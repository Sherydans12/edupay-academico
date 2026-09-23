[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$IdentityRepoPath,

  [Parameter(Mandatory = $true)]
  [string]$IdentityImage,

  [Parameter(Mandatory = $true)]
  [string]$AcademicImage
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-DockerChecked {
  param([Parameter(Mandatory = $true)][string[]]$DockerArguments)
  $output = & docker @DockerArguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($DockerArguments[0]) failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-DbSql {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  return Invoke-DockerChecked @(
    'exec', '--env', "PGPASSWORD=$script:dbPassword", $script:pgContainer,
    'psql', '-qAt', '-U', 'die_release_test', '-d', $Database,
    '-v', 'ON_ERROR_STOP=1', '-c', $Sql
  )
}

function New-Database {
  param([Parameter(Mandatory = $true)][string]$Name)
  [void](Invoke-DbSql -Database 'postgres' -Sql "CREATE DATABASE $Name;")
  [void](Invoke-DbSql -Database $Name -Sql @'
CREATE TABLE public."_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
'@)
}

function Add-HistoricalMigrations {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$MigrationsPath,
    [Parameter(Mandatory = $true)][string[]]$Names
  )
  foreach ($name in $Names) {
    if ($name -notmatch '^[a-z0-9_]+$') { throw "Unexpected migration name: $name" }
    $sqlPath = Join-Path (Join-Path $MigrationsPath $name) 'migration.sql'
    if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) { throw "Missing migration SQL: $sqlPath" }
    $containerPath = "/tmp/$name.sql"
    [void](Invoke-DockerChecked @('cp', $sqlPath, "${script:pgContainer}:$containerPath"))
    [void](Invoke-DockerChecked @(
      'exec', '--env', "PGPASSWORD=$script:dbPassword", $script:pgContainer,
      'psql', '-U', 'die_release_test', '-d', $Database,
      '-v', 'ON_ERROR_STOP=1', '-f', $containerPath
    ))
    $checksum = (Get-FileHash -LiteralPath $sqlPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $migrationId = [guid]::NewGuid().ToString()
    $ledgerSql = @'
INSERT INTO public."_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES ('{0}', '{1}', now(), '{2}', now(), 1);
'@ -f $migrationId, $checksum, $name
    [void](Invoke-DbSql -Database $Database -Sql $ledgerSql)
  }
}

function Assert-Ledger {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$MigrationsPath,
    [Parameter(Mandatory = $true)][string[]]$Names
  )
  $rows = @(Invoke-DbSql -Database $Database -Sql @'
SELECT "migration_name" || '|' || "checksum" || '|' || ("finished_at" IS NOT NULL)::text
FROM public."_prisma_migrations"
ORDER BY "migration_name";
'@)
  if ($rows.Count -ne $Names.Count) {
    throw "$Database ledger row count mismatch: expected $($Names.Count), got $($rows.Count)."
  }
  foreach ($line in $rows) {
    $parts = "$line".Split('|')
    if ($parts.Count -ne 3) { throw "$Database returned malformed migration ledger output." }
    $name = $parts[0]
    if ($name -notin $Names -or $parts[2] -ne 'true') { throw "$Database ledger contains an unexpected or unfinished migration: $name." }
    $sqlPath = Join-Path (Join-Path $MigrationsPath $name) 'migration.sql'
    $expected = (Get-FileHash -LiteralPath $sqlPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($parts[1] -ne $expected) { throw "$Database checksum mismatch for $name." }
  }
}

function Assert-ImageCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string[]]$ExpectedCommand
  )
  $details = Invoke-DockerChecked @('image', 'inspect', $Image, '--format', '{{json .Config.Cmd}}|{{.Os}}|{{.Architecture}}')
  $parts = ([string]$details).Split('|')
  $expectedJson = ConvertTo-Json -InputObject @($ExpectedCommand) -Compress
  if ($parts.Count -ne 3 -or $parts[0] -ne $expectedJson -or $parts[1] -ne 'linux' -or $parts[2] -ne 'amd64') {
    throw "Unexpected migration image command/platform for ${Image}. Expected $expectedJson|linux|amd64, got $($details -join ' ')."
  }
}

function Invoke-MigrationImage {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$Database
  )
  $url = "postgresql://die_release_test:$($script:dbPassword)@$($script:pgContainer):5432/$Database"
  $log = Invoke-DockerChecked @(
    'run', '--rm', '--network', $script:networkName,
    '--env', "DATABASE_URL=$url", $Image
  )
  $log | Where-Object { "$_" -match 'Applying migration|No pending migrations|All migrations have been successfully applied' } | ForEach-Object { Write-Host "$_" }
}

function Invoke-PnpmChecked {
  param([Parameter(Mandatory = $true)][string[]]$PnpmArguments)
  $output = & pnpm @PnpmArguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($PnpmArguments -join ' ') failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

$identityRoot = (Resolve-Path -LiteralPath $IdentityRepoPath).Path
$identityMigrations = Join-Path $identityRoot 'prisma\migrations'
$academicRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$academicMigrations = Join-Path $academicRoot 'apps\api\prisma\migrations'
$identityNames = @(Get-ChildItem -LiteralPath $identityMigrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name)
$expectedIdentityNames = @(
  '20260808000000_identity_foundation',
  '20260809000000_account_lifecycle',
  '20260831000000_provisioning_idempotency_receipts',
  '20260924000000_add_staff_role'
)
$academicNames = @(Get-ChildItem -LiteralPath $academicMigrations -Directory | Sort-Object Name | Select-Object -ExpandProperty Name)
$expectedAcademicTail = @(
  '20260922120000_die_educational_inclusion',
  '20260923120000_tenant_operational_profile',
  '20260924120000_die_staff_members'
)
if (($identityNames -join ',') -ne ($expectedIdentityNames -join ',')) { throw 'Identity migrations differ from the four authorized release migrations.' }
if ($academicNames.Count -ne 13 -or ($academicNames[-3..-1] -join ',') -ne ($expectedAcademicTail -join ',')) {
  throw 'Academic migrations differ from the ten historical plus three authorized release migrations.'
}
if (-not (Test-Path -LiteralPath (Join-Path $identityRoot 'node_modules\.bin\vitest.cmd'))) {
  throw 'Install the Identity workspace dependencies with pnpm install --frozen-lockfile before running this validation.'
}

$script:networkName = "die-migration-test-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$script:pgContainer = "die-migration-pg-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$script:dbPassword = "test-$([guid]::NewGuid().ToString('N'))"
$networkCreated = $false
$containerStarted = $false
$previousDatabaseUrl = $env:DATABASE_URL
$previousTestDatabaseUrl = $env:TEST_DATABASE_URL

try {
  [void](Invoke-DockerChecked @('network', 'create', $script:networkName))
  $networkCreated = $true
  [void](Invoke-DockerChecked @(
    'run', '-d', '--rm', '--name', $script:pgContainer,
    '--network', $script:networkName, '-p', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=die_release_test',
    '--env', "POSTGRES_PASSWORD=$script:dbPassword",
    '--env', 'POSTGRES_DB=postgres',
    'postgres:15-alpine'
  ))
  $containerStarted = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec --env "PGPASSWORD=$script:dbPassword" $script:pgContainer pg_isready -U die_release_test -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Disposable PostgreSQL 15 did not become ready within 60 seconds.' }

  Assert-ImageCommand -Image $IdentityImage -ExpectedCommand @('pnpm', 'prisma:migrate:deploy')
  Assert-ImageCommand -Image $AcademicImage -ExpectedCommand @('pnpm', '--filter', '@edupay/api', 'db:migrate:deploy')

  New-Database 'identity_fresh'
  Invoke-MigrationImage -Image $IdentityImage -Database 'identity_fresh'
  Assert-Ledger -Database 'identity_fresh' -MigrationsPath $identityMigrations -Names $expectedIdentityNames
  $freshIdentityCounts = (Invoke-DbSql -Database 'identity_fresh' -Sql @'
SELECT (SELECT count(*) FROM public."_prisma_migrations") || '|' ||
       (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='RoleCode' AND e.enumlabel='STAFF');
'@ | Select-Object -Last 1).Trim()
  if ($freshIdentityCounts -ne '4|1') { throw "Identity fresh install did not yield four migrations and STAFF: $freshIdentityCounts" }
  Invoke-MigrationImage -Image $IdentityImage -Database 'identity_fresh'
  Assert-Ledger -Database 'identity_fresh' -MigrationsPath $identityMigrations -Names $expectedIdentityNames
  Write-Host 'PASS Identity fresh install and safe retry: four exact checksums; STAFF present.'

  New-Database 'identity_upgrade'
  Add-HistoricalMigrations -Database 'identity_upgrade' -MigrationsPath $identityMigrations -Names $expectedIdentityNames[0..2]
  $actorId = [guid]::NewGuid().ToString()
  $tenantId = [guid]::NewGuid().ToString()
  $receiptId = [guid]::NewGuid().ToString()
  $createdAt = '2026-09-23T12:00:00Z'
  $userSql = @'
INSERT INTO public.identity_users (id, status, "createdAt", "updatedAt")
VALUES ('{0}', 'ACTIVE', '{1}', '{1}');
'@ -f $actorId, $createdAt
  [void](Invoke-DbSql -Database 'identity_upgrade' -Sql $userSql)
  $tenantSql = @'
INSERT INTO public.tenant_realms (id, handle, status, "createdAt", "updatedAt")
VALUES ('{0}', 'synthetic-upgrade-test', 'ACTIVE', '{1}', '{1}');
'@ -f $tenantId, $createdAt
  [void](Invoke-DbSql -Database 'identity_upgrade' -Sql $tenantSql)
  $payloadJson = '{"synthetic":true}'
  $payloadHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($payloadJson))).ToLowerInvariant()
  $responseBody = '{"membershipId":"synthetic-membership"}'
  $receiptTemplate = @'
INSERT INTO public.provisioning_idempotency_receipts
  (id, operation, "actorUserId", "tenantRealmId", "idempotencyKey", "payloadHash", "statusCode", "responseBody", "createdAt")
VALUES ('{0}', 'MEMBERSHIP_PROVISION', '{1}', '{2}', 'synthetic-upgrade-key', '{3}', 201, '{4}', '{5}');
'@
  $receiptSql = $receiptTemplate -f $receiptId, $actorId, $tenantId, $payloadHash, $responseBody, $createdAt
  [void](Invoke-DbSql -Database 'identity_upgrade' -Sql $receiptSql)
  Invoke-MigrationImage -Image $IdentityImage -Database 'identity_upgrade'
  Assert-Ledger -Database 'identity_upgrade' -MigrationsPath $identityMigrations -Names $expectedIdentityNames
  $identityPreservation = (Invoke-DbSql -Database 'identity_upgrade' -Sql @'
SELECT (SELECT count(*) FROM public.identity_users) || '|' ||
       (SELECT count(*) FROM public.tenant_realms) || '|' ||
       (SELECT count(*) FROM public.provisioning_idempotency_receipts) || '|' ||
       (SELECT "responseBody" FROM public.provisioning_idempotency_receipts WHERE "idempotencyKey"='synthetic-upgrade-key') || '|' ||
       (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='RoleCode' AND e.enumlabel='STAFF');
'@ | Select-Object -Last 1).Trim()
  if ($identityPreservation -ne '1|1|1|{"membershipId":"synthetic-membership"}|1') { throw "Identity upgrade preservation assertion failed: $identityPreservation" }
  Write-Host 'PASS Identity upgrade: three historical checksums/data and the idempotency receipt preserved; only STAFF migration added.'

  New-Database 'identity_behavior'
  Invoke-MigrationImage -Image $IdentityImage -Database 'identity_behavior'
  $publishedPortLine = (Invoke-DockerChecked @('port', $script:pgContainer, '5432/tcp') | Select-Object -Last 1).Trim()
  if ($publishedPortLine -notmatch ':(\d+)$') { throw 'Unable to read the local-only PostgreSQL test port.' }
  $localPort = $Matches[1]
  $testUrl = "postgresql://die_release_test:$script:dbPassword@127.0.0.1:$localPort/identity_behavior"
  $env:DATABASE_URL = $testUrl
  $env:TEST_DATABASE_URL = $testUrl
  Push-Location $identityRoot
  try {
    [void](Invoke-PnpmChecked @('prisma:generate'))
    Invoke-PnpmChecked @('exec', 'vitest', 'run', 'test/account-lifecycle.integration-spec.ts', '--reporter=verbose') | ForEach-Object { Write-Host "$_" }
  } finally {
    Pop-Location
  }
  Write-Host 'PASS Identity PostgreSQL lifecycle suite: retry/collision, concurrency, transactional rollback, password recovery and STAFF contract.'

  New-Database 'academico_fresh'
  Invoke-MigrationImage -Image $AcademicImage -Database 'academico_fresh'
  Assert-Ledger -Database 'academico_fresh' -MigrationsPath $academicMigrations -Names $academicNames
  $freshAcademicCounts = (Invoke-DbSql -Database 'academico_fresh' -Sql @'
SELECT (SELECT count(*) FROM public.tenants) || '|' ||
       (SELECT count(*) FROM public.tenant_operational_profiles) || '|' ||
       (SELECT count(*) FROM public.die_member_assignments) || '|' ||
       (SELECT count(*) FROM public.die_support_episodes);
'@ | Select-Object -Last 1).Trim()
  if ($freshAcademicCounts -ne '0|0|0|0') { throw "Academic fresh migration created unexpected tenant or pilot data: $freshAcademicCounts" }
  Write-Host 'PASS Academic fresh install: all 13 exact checksums; no tenant, profile or DIE records.'

  New-Database 'academico_upgrade'
  Add-HistoricalMigrations -Database 'academico_upgrade' -MigrationsPath $academicMigrations -Names $academicNames[0..9]
  [void](Invoke-DbSql -Database 'academico_upgrade' -Sql @'
INSERT INTO public.tenants (id, updated_at) VALUES ('synthetic-release-tenant', now());
INSERT INTO public.students (id, tenant_id, pagination_token, first_name, last_name, updated_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'synthetic-release-tenant', '22222222-2222-4222-8222-222222222222', 'Synthetic', 'Learner', now());
'@)
  Invoke-MigrationImage -Image $AcademicImage -Database 'academico_upgrade'
  Assert-Ledger -Database 'academico_upgrade' -MigrationsPath $academicMigrations -Names $academicNames
  $academicPreservation = (Invoke-DbSql -Database 'academico_upgrade' -Sql @'
SELECT (SELECT count(*) FROM public.tenants WHERE id='synthetic-release-tenant') || '|' ||
       (SELECT count(*) FROM public.students WHERE id='11111111-1111-4111-8111-111111111111' AND tenant_id='synthetic-release-tenant' AND first_name='Synthetic' AND last_name='Learner') || '|' ||
       (SELECT count(*) FROM public.tenant_operational_profiles) || '|' ||
       (SELECT count(*) FROM public.die_member_assignments) || '|' ||
       (SELECT count(*) FROM public.die_support_episodes);
'@ | Select-Object -Last 1).Trim()
  if ($academicPreservation -ne '1|1|0|0|0') { throw "Academic 10-to-13 preservation assertion failed: $academicPreservation" }
  Write-Host 'PASS Academic 10-to-13 upgrade: ten historical checksums and synthetic tenant/student preserved; only three authorized migrations added.'
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:TEST_DATABASE_URL = $previousTestDatabaseUrl
  if ($containerStarted) { try { [void](Invoke-DockerChecked @('stop', $script:pgContainer)) } catch { Write-Warning 'Could not stop the disposable PostgreSQL container automatically.' } }
  if ($networkCreated) { try { [void](Invoke-DockerChecked @('network', 'rm', $script:networkName)) } catch { Write-Warning 'Could not remove the disposable Docker network automatically.' } }
}
