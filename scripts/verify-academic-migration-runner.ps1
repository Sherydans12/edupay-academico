[CmdletBinding()]
param(
  # Immutable runner reference, e.g. ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest>
  [Parameter(Mandatory = $true)]
  [string]$AcademicImage,

  # Full source SHA expected in the image label org.opencontainers.image.revision.
  [Parameter(Mandatory = $true)]
  [string]$ExpectedRevision,

  # Number of migrations already applied in the target ledger (production had 13
  # on 2026-11-15). Migrations after this index are the ones the runner must add.
  [int]$AppliedCount = 13
)

# Rehearses an Academic migration runner against disposable PostgreSQL 15 only.
# It never reads a production DATABASE_URL and never connects to a real database.
# Checks: image command/platform/revision; fresh install with exact checksums and
# a safe rerun; upgrade from the applied ledger with synthetic rows preserved;
# `migrate status` reporting exactly the pending migrations; and, when the
# ADR-0024 migration is pending, the RUN/IPE columns, constraints and index.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runnerCommand = @('pnpm', '--filter', '@edupay/api', 'db:migrate:deploy')
$statusCommand = @('pnpm', '--filter', '@edupay/api', 'db:migrate:status')
$identifierMigration = '20261115120000_student_national_identifier'

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
    'psql', '-qAt', '-U', 'runner_rehearsal', '-d', $Database,
    '-v', 'ON_ERROR_STOP=1', '-c', $Sql
  )
}

function Get-DbValue {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  return ([string](Invoke-DbSql -Database $Database -Sql $Sql | Select-Object -Last 1)).Trim()
}

function Assert-SqlFails {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Reason
  )
  $failed = $false
  try { [void](Invoke-DbSql -Database $Database -Sql $Sql) } catch { $failed = $true }
  if (-not $failed) { throw "Expected the database to reject: $Reason" }
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

function Get-Checksum {
  param([Parameter(Mandatory = $true)][string]$Name)
  $sqlPath = Join-Path (Join-Path $script:migrationsPath $Name) 'migration.sql'
  if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) { throw "Missing migration SQL: $sqlPath" }
  return (Get-FileHash -LiteralPath $sqlPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Add-AppliedMigrations {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string[]]$Names
  )
  foreach ($name in $Names) {
    if ($name -notmatch '^[a-z0-9_]+$') { throw "Unexpected migration name: $name" }
    $sqlPath = Join-Path (Join-Path $script:migrationsPath $name) 'migration.sql'
    $containerPath = "/tmp/$name.sql"
    [void](Invoke-DockerChecked @('cp', $sqlPath, "${script:pgContainer}:$containerPath"))
    [void](Invoke-DockerChecked @(
      'exec', '--env', "PGPASSWORD=$script:dbPassword", $script:pgContainer,
      'psql', '-U', 'runner_rehearsal', '-d', $Database,
      '-v', 'ON_ERROR_STOP=1', '-f', $containerPath
    ))
    $ledgerSql = @'
INSERT INTO public."_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES ('{0}', '{1}', now(), '{2}', now(), 1);
'@ -f ([guid]::NewGuid().ToString()), (Get-Checksum $name), $name
    [void](Invoke-DbSql -Database $Database -Sql $ledgerSql)
  }
}

function Assert-Ledger {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string[]]$Names
  )
  $rows = @(Invoke-DbSql -Database $Database -Sql @'
SELECT "migration_name" || '|' || "checksum" || '|' ||
       ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)::text
FROM public."_prisma_migrations"
ORDER BY "migration_name";
'@)
  if ($rows.Count -ne $Names.Count) {
    throw "$Database ledger row count mismatch: expected $($Names.Count), got $($rows.Count)."
  }
  foreach ($line in $rows) {
    $parts = "$line".Split('|')
    if ($parts.Count -ne 3) { throw "$Database returned malformed ledger output." }
    if ($parts[0] -notin $Names -or $parts[2] -ne 'true') {
      throw "$Database ledger contains an unexpected or unfinished migration: $($parts[0])."
    }
    if ($parts[1] -ne (Get-Checksum $parts[0])) { throw "$Database checksum mismatch for $($parts[0])." }
  }
}

function Invoke-Runner {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [string[]]$Command = @()
  )
  $url = "postgresql://runner_rehearsal:$($script:dbPassword)@$($script:pgContainer):5432/$Database"
  $arguments = @('run', '--rm', '--network', $script:networkName, '--env', "DATABASE_URL=$url", $AcademicImage) + $Command
  $output = & docker @arguments 2>&1
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($output | ForEach-Object { "$_" }) }
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$script:migrationsPath = Join-Path $repositoryRoot 'apps\api\prisma\migrations'
$names = @(Get-ChildItem -LiteralPath $script:migrationsPath -Directory | Sort-Object Name | Select-Object -ExpandProperty Name)
if ($AppliedCount -lt 1 -or $AppliedCount -ge $names.Count) {
  throw "AppliedCount must leave at least one pending migration; repository has $($names.Count)."
}
$applied = @($names[0..($AppliedCount - 1)])
$pending = @($names[$AppliedCount..($names.Count - 1)])
Write-Host "Repository migrations: $($names.Count); applied baseline: $AppliedCount; pending: $($pending -join ', ')"

$details = ([string](Invoke-DockerChecked @(
  'image', 'inspect', $AcademicImage, '--format',
  '{{json .Config.Cmd}}|{{.Os}}|{{.Architecture}}|{{index .Config.Labels "org.opencontainers.image.revision"}}'
))).Trim()
$expectedDetails = "$(ConvertTo-Json -InputObject $runnerCommand -Compress)|linux|amd64|$ExpectedRevision"
if ($details -ne $expectedDetails) {
  throw "Unexpected runner image. Expected $expectedDetails, got $details."
}
Write-Host "PASS image: migrate deploy command, linux/amd64, revision $ExpectedRevision."

$script:networkName = "academic-runner-test-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$script:pgContainer = "academic-runner-pg-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$script:dbPassword = "test-$([guid]::NewGuid().ToString('N'))"
$networkCreated = $false
$containerStarted = $false
try {
  [void](Invoke-DockerChecked @('network', 'create', $script:networkName))
  $networkCreated = $true
  [void](Invoke-DockerChecked @(
    'run', '-d', '--rm', '--name', $script:pgContainer, '--network', $script:networkName,
    '--env', 'POSTGRES_USER=runner_rehearsal',
    '--env', "POSTGRES_PASSWORD=$script:dbPassword",
    '--env', 'POSTGRES_DB=postgres',
    'postgres:15-alpine'
  ))
  $containerStarted = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec --env "PGPASSWORD=$script:dbPassword" $script:pgContainer pg_isready -U runner_rehearsal -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Disposable PostgreSQL 15 did not become ready within 60 seconds.' }

  # 1. Fresh install and safe rerun.
  New-Database 'academico_fresh'
  $fresh = Invoke-Runner -Database 'academico_fresh'
  if ($fresh.ExitCode -ne 0) { throw "Fresh migrate deploy failed: $($fresh.Output -join [Environment]::NewLine)" }
  Assert-Ledger -Database 'academico_fresh' -Names $names
  $rerun = Invoke-Runner -Database 'academico_fresh'
  if ($rerun.ExitCode -ne 0 -or -not ($rerun.Output -match 'No pending migrations')) {
    throw "Rerun on an up-to-date ledger did not report 'No pending migrations'."
  }
  Assert-Ledger -Database 'academico_fresh' -Names $names
  Write-Host "PASS fresh install: $($names.Count) exact checksums; rerun applied nothing."

  # 2. Upgrade from the applied baseline with synthetic rows.
  New-Database 'academico_upgrade'
  Add-AppliedMigrations -Database 'academico_upgrade' -Names $applied
  [void](Invoke-DbSql -Database 'academico_upgrade' -Sql @'
INSERT INTO public.tenants (id, updated_at) VALUES ('synthetic-tenant-a', now()), ('synthetic-tenant-b', now());
INSERT INTO public.students (id, tenant_id, pagination_token, first_name, last_name, updated_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'synthetic-tenant-a', '21111111-1111-4111-8111-111111111111', 'Sintetico', 'Uno', now()),
  ('11111111-1111-4111-8111-111111111112', 'synthetic-tenant-a', '21111111-1111-4111-8111-111111111112', 'Sintetico', 'Dos', now()),
  ('11111111-1111-4111-8111-111111111113', 'synthetic-tenant-b', '21111111-1111-4111-8111-111111111113', 'Sintetico', 'Tres', now());
'@)
  $before = Get-DbValue -Database 'academico_upgrade' -Sql "SELECT (SELECT count(*) FROM public.tenants) || '|' || (SELECT count(*) FROM public.students) || '|' || (SELECT count(*) FROM public.course_enrollments);"

  # `migrate status` must list exactly the pending migrations before deploying.
  $status = Invoke-Runner -Database 'academico_upgrade' -Command $statusCommand
  $statusText = $status.Output -join "`n"
  foreach ($name in $pending) {
    if ($statusText -notmatch [regex]::Escape($name)) { throw "migrate status did not list pending migration $name." }
  }
  foreach ($name in $applied) {
    if ($statusText -match [regex]::Escape($name)) { throw "migrate status unexpectedly listed applied migration $name." }
  }
  Write-Host "PASS migrate status: lists only $($pending -join ', ') (exit code $($status.ExitCode))."

  $upgrade = Invoke-Runner -Database 'academico_upgrade'
  if ($upgrade.ExitCode -ne 0) { throw "Upgrade migrate deploy failed: $($upgrade.Output -join [Environment]::NewLine)" }
  $appliedLines = @($upgrade.Output | Where-Object { $_ -match 'Applying migration' })
  if ($appliedLines.Count -ne $pending.Count) {
    throw "Expected $($pending.Count) applied migration(s), saw: $($appliedLines -join '; ')"
  }
  Assert-Ledger -Database 'academico_upgrade' -Names $names
  $after = Get-DbValue -Database 'academico_upgrade' -Sql "SELECT (SELECT count(*) FROM public.tenants) || '|' || (SELECT count(*) FROM public.students) || '|' || (SELECT count(*) FROM public.course_enrollments);"
  if ($after -ne $before) { throw "Row counts changed during upgrade: before $before, after $after." }
  Write-Host "PASS upgrade $AppliedCount -> $($names.Count): only the pending migration(s) applied; counts tenants|students|enrollments preserved ($after)."

  # 3. ADR-0024 structure and constraints, when that migration is pending.
  if ($pending -contains $identifierMigration) {
    $nulls = Get-DbValue -Database 'academico_upgrade' -Sql "SELECT count(*) FROM public.students WHERE national_id_type IS NOT NULL OR national_id IS NOT NULL;"
    if ($nulls -ne '0') { throw 'Existing students received an identifier during migration; no backfill is allowed.' }
    $structure = Get-DbValue -Database 'academico_upgrade' -Sql @'
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name IN ('national_id_type','national_id') AND is_nullable='YES') || '|' ||
       (SELECT count(*) FROM pg_constraint WHERE conname IN ('students_national_id_pair_check','students_national_id_type_check')) || '|' ||
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='students_tenant_id_national_id_type_national_id_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%');
'@
    if ($structure -ne '2|2|1') { throw "Unexpected identifier structure (columns|checks|unique index): $structure" }
    [void](Invoke-DbSql -Database 'academico_upgrade' -Sql "UPDATE public.students SET national_id_type='RUN', national_id='111111111' WHERE id='11111111-1111-4111-8111-111111111111';")
    [void](Invoke-DbSql -Database 'academico_upgrade' -Sql "UPDATE public.students SET national_id_type='RUN', national_id='111111111' WHERE id='11111111-1111-4111-8111-111111111113';")
    Assert-SqlFails -Database 'academico_upgrade' -Reason 'duplicate RUN in the same tenant' -Sql "UPDATE public.students SET national_id_type='RUN', national_id='111111111' WHERE id='11111111-1111-4111-8111-111111111112';"
    Assert-SqlFails -Database 'academico_upgrade' -Reason 'identifier without type' -Sql "UPDATE public.students SET national_id='222222222' WHERE id='11111111-1111-4111-8111-111111111112';"
    Assert-SqlFails -Database 'academico_upgrade' -Reason 'unsupported identifier type' -Sql "UPDATE public.students SET national_id_type='DNI', national_id='222222222' WHERE id='11111111-1111-4111-8111-111111111112';"
    Write-Host 'PASS ADR-0024 structure: nullable pair, two checks, unique per tenant/type; no backfill; same RUN allowed in another tenant.'
  }

  Write-Host 'PASS runner rehearsal completed against disposable PostgreSQL only.'
} finally {
  if ($containerStarted) {
    try { [void](Invoke-DockerChecked @('stop', $script:pgContainer)) } catch { Write-Warning 'Could not stop the disposable PostgreSQL container automatically.' }
  }
  if ($networkCreated) {
    try { [void](Invoke-DockerChecked @('network', 'rm', $script:networkName)) } catch { Write-Warning 'Could not remove the disposable network automatically.' }
  }
}
