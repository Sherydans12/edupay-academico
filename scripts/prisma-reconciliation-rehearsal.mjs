import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(root, 'apps', 'api');
const prismaCli = join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js');
const migrationsRoot = join(apiRoot, 'prisma', 'migrations');
const repairSqlPath = join(
  root,
  'scripts',
  'prisma-reconciliation',
  'academic-additive-repair.sql',
);
const backfillSqlPath = join(
  root,
  'scripts',
  'prisma-reconciliation',
  'reconcile-body-documents.sql',
);

const historicalMigrationName =
  '20260820160800_add_content_revisions_drafts_and_versioning';
const historicalMigrationRef =
  '06a3c20:apps/api/prisma/migrations/20260820160800_add_content_revisions_drafts_and_versioning/migration.sql';
const historicalMigrationSha256 =
  '06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670';
const baseMigrationNames = [
  '20260808195654_academic_structure',
  '20260808220000_learning_content',
  '20260808230000_storage_submissions',
  '20260809000000_hardened_upload_transport',
  '20260809100000_academic_notifications',
  '20260811190000_edupay_sync_consumer',
];
const commandReceiptsMigration =
  '20260824140000_command_receipts_and_sparse_ordering';
const bodyDocumentMigration = '20260825113000_add_learning_body_document';
const projectionMigration = '20260903110000_financial_projection_producer';
const postgresImage =
  process.env.PRISMA_RECONCILIATION_POSTGRES_IMAGE ?? 'postgres:15-alpine';
const containerName = `edupay-prisma-rehearsal-${process.pid}`;
const databaseName = 'academico_rehearsal';
const freshDatabaseName = 'academico_fresh_rehearsal';
const databaseUser = 'rehearsal';
const databasePassword = 'rehearsal';

function command(file, args, options = {}) {
  const result = execFileSync(file, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
  });
  return result;
}

function commandResult(file, args, options = {}) {
  try {
    return { exitCode: 0, stdout: command(file, args, options), stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message,
    };
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runPsql(container, sql, database = databaseName) {
  return command(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      databaseUser,
      '-d',
      database,
      '-P',
      'pager=off',
      '-t',
      '-P',
      'format=unaligned',
      '-P',
      'fieldsep=|',
    ],
    { input: sql },
  );
}

function runPrisma(cwd, databaseUrl, args) {
  return command(process.execPath, [prismaCli, ...args], {
    cwd,
    env: { DATABASE_URL: databaseUrl },
  });
}

async function createPrismaProject(migrationNames, historicalSql) {
  const project = await mkdtemp(join(apiRoot, '.prisma-rehearsal-'));
  const prismaDir = join(project, 'prisma');
  const projectMigrations = join(prismaDir, 'migrations');
  await mkdir(projectMigrations, { recursive: true });
  await cp(
    join(apiRoot, 'prisma', 'schema.prisma'),
    join(prismaDir, 'schema.prisma'),
  );
  await cp(
    join(migrationsRoot, 'migration_lock.toml'),
    join(projectMigrations, 'migration_lock.toml'),
  );
  for (const migrationName of migrationNames) {
    await cp(
      join(migrationsRoot, migrationName),
      join(projectMigrations, migrationName),
      { recursive: true },
    );
  }
  if (historicalSql) {
    const historicalDir = join(projectMigrations, historicalMigrationName);
    await mkdir(historicalDir, { recursive: true });
    await writeFile(join(historicalDir, 'migration.sql'), historicalSql);
  }
  await writeFile(
    join(project, 'prisma.config.ts'),
    "import { defineConfig } from 'prisma/config';\n\nexport default defineConfig({\n  schema: 'prisma/schema.prisma',\n  migrations: { path: 'prisma/migrations' },\n  datasource: { url: process.env.DATABASE_URL },\n});\n",
  );
  return project;
}

const seedSql = `
BEGIN;
INSERT INTO tenants (id, created_at, updated_at)
VALUES ('rehearsal-tenant', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO academic_years (id, tenant_id, pagination_token, label, start_date, end_date, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000011', '2026', DATE '2026-03-01', DATE '2026-12-20', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO courses (id, tenant_id, academic_year_id, pagination_token, label, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000002', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012', 'Curso sintético', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO students (id, tenant_id, pagination_token, first_name, last_name, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000003', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000013', 'Synthetic', 'Student', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO subjects (id, tenant_id, pagination_token, name, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000004', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000014', 'Asignatura sintética', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO course_subjects (id, tenant_id, course_id, subject_id, pagination_token, default_for_course, sort_order, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000005', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000015', true, 0, 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO learning_units (id, tenant_id, course_subject_id, title, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000006', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000005', 'Unidad sintética', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO course_enrollments (id, tenant_id, student_id, course_id, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000007', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'ACTIVE', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO learning_items (id, tenant_id, course_subject_id, learning_unit_id, type, title, content, sort_order, publication_status, created_by_identity_user_id, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000008', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', 'MATERIAL', 'Material sintético', 'Contenido material sintético', 0, 'PUBLISHED', 'synthetic-teacher', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO learning_items (id, tenant_id, course_subject_id, learning_unit_id, type, title, instructions, due_at, sort_order, publication_status, created_by_identity_user_id, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000009', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', 'ASSIGNMENT', 'Tarea sintética', 'Instrucciones sintéticas', TIMESTAMPTZ '2026-10-01 00:00:00+00', 1, 'DRAFT', 'synthetic-teacher', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO learning_items (id, tenant_id, course_subject_id, learning_unit_id, type, title, body, sort_order, publication_status, created_by_identity_user_id, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-00000000000a', 'rehearsal-tenant', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', 'ANNOUNCEMENT', 'Aviso sintético', 'Aviso de prueba', 2, 'PUBLISHED', 'synthetic-teacher', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO learning_item_drafts (tenant_id, learning_item_id, title, instructions, due_at, based_on_version, updated_by_identity_user_id, created_at, updated_at)
VALUES ('rehearsal-tenant', '00000000-0000-4000-8000-000000000009', 'Borrador sintético', 'Instrucciones de borrador', TIMESTAMPTZ '2026-10-02 00:00:00+00', 1, 'synthetic-teacher', TIMESTAMPTZ '2026-09-14 00:00:00+00', TIMESTAMPTZ '2026-09-14 00:00:00+00');
INSERT INTO content_revisions (id, tenant_id, entity_type, entity_id, revision_number, operation, snapshot, actor_identity_user_id, created_at)
VALUES ('00000000-0000-4000-8000-00000000000b', 'rehearsal-tenant', 'LEARNING_ITEM', '00000000-0000-4000-8000-000000000008', 1, 'CREATED', '{"schemaVersion":1}', 'synthetic-teacher', TIMESTAMPTZ '2026-09-14 00:00:00+00');
COMMIT;
`;

const preflightSql = `
DO $$
DECLARE
  body_columns integer;
  expected_index integer;
  backfill_candidates integer;
BEGIN
  IF to_regclass('public.content_revisions') IS NULL
     OR to_regclass('public.learning_item_drafts') IS NULL
     OR to_regclass('public.command_receipts') IS NULL THEN
    RAISE EXCEPTION 'RECONCILIATION_FAIL: required tables are missing';
  END IF;
  SELECT count(*) INTO body_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('learning_items', 'learning_item_drafts')
    AND column_name = 'body_document'
    AND udt_name = 'jsonb'
    AND is_nullable = 'YES';
  IF body_columns <> 2 THEN
    RAISE EXCEPTION 'RECONCILIATION_FAIL: body_document catalog mismatch';
  END IF;
  SELECT count(*) INTO expected_index
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'command_receipts_tenant_id_created_at_idx',
      'command_receipts_tenant_actor_command_key_key',
      'content_revisions_entity_revision_key'
    );
  IF expected_index <> 3 THEN
    RAISE EXCEPTION 'RECONCILIATION_FAIL: required index mismatch';
  END IF;
  SELECT count(*) INTO backfill_candidates
  FROM learning_items
  WHERE body_document IS NULL
    AND COALESCE(CASE type
      WHEN 'MATERIAL' THEN content
      WHEN 'ASSIGNMENT' THEN instructions
      WHEN 'ASSESSMENT' THEN instructions
      WHEN 'ANNOUNCEMENT' THEN body
    END, '') <> '';
  IF backfill_candidates <> 3 THEN
    RAISE EXCEPTION 'RECONCILIATION_FAIL: expected 3 synthetic body candidates, got %', backfill_candidates;
  END IF;
END $$;
SELECT 'PREFLIGHT|PASS';
`;

const integrityBeforeSql = `
SELECT 'before|learning_items|' || count(*) FROM learning_items;
SELECT 'before|drafts|' || count(*) FROM learning_item_drafts;
SELECT 'before|revisions|' || count(*) FROM content_revisions;
SELECT 'before|enrollments|' || count(*) FROM course_enrollments;
`;

const integrityAfterSql = `
SELECT 'after|learning_items|' || count(*) FROM learning_items;
SELECT 'after|drafts|' || count(*) FROM learning_item_drafts;
SELECT 'after|revisions|' || count(*) FROM content_revisions;
SELECT 'after|enrollments|' || count(*) FROM course_enrollments;
SELECT 'after|body_documents_nonnull|' || count(*) FROM learning_items WHERE body_document IS NOT NULL;
SELECT id || '|' || jsonb_extract_path_text(body_document, 'blocks', '0', 'text') FROM learning_items ORDER BY id;
SELECT learning_item_id || '|' || jsonb_extract_path_text(body_document, 'blocks', '0', 'text') FROM learning_item_drafts ORDER BY learning_item_id;
SELECT 'enrollment_projection|' || financial_projection_version || '|' || financial_projection_effective_from::text || '|' || COALESCE(financial_projection_effective_to::text, '') FROM course_enrollments;
`;

async function main() {
  const historicalSql = command('git', ['show', historicalMigrationRef], {
    encoding: 'buffer',
  });
  assert(
    sha256(historicalSql) === historicalMigrationSha256,
    'Historical migration SHA mismatch',
  );
  const repairSql = await readFile(repairSqlPath, 'utf8');
  assert(
    sha256(repairSql) ===
      '299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5',
    'Repair SQL SHA mismatch',
  );
  const backfillSql = await readFile(backfillSqlPath, 'utf8');

  const baseProject = await createPrismaProject(
    baseMigrationNames,
    historicalSql,
  );
  const candidateProject = await createPrismaProject([
    ...baseMigrationNames,
    historicalMigrationName,
    commandReceiptsMigration,
    bodyDocumentMigration,
    projectionMigration,
  ]);
  const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@127.0.0.1:PORT/${databaseName}?schema=public`;
  let mappedPort;
  try {
    command('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--env',
      `POSTGRES_USER=${databaseUser}`,
      '--env',
      `POSTGRES_PASSWORD=${databasePassword}`,
      '--env',
      `POSTGRES_DB=${databaseName}`,
      '--publish',
      '127.0.0.1::5432',
      postgresImage,
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const portResult = commandResult('docker', [
        'port',
        containerName,
        '5432/tcp',
      ]);
      const match = portResult.stdout.match(/:(\d+)\s*$/m);
      if (match) {
        const ready = commandResult('docker', [
          'exec',
          containerName,
          'pg_isready',
          '-U',
          databaseUser,
          '-d',
          databaseName,
        ]);
        if (ready.exitCode === 0) {
          mappedPort = match[1];
          break;
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    assert(mappedPort, 'PostgreSQL disposable did not become ready');
    const resolvedUrl = databaseUrl.replace('PORT', mappedPort);

    runPrisma(baseProject, resolvedUrl, ['migrate', 'deploy']);
    runPsql(containerName, seedSql);
    const before = runPsql(containerName, integrityBeforeSql);
    runPsql(containerName, repairSql);
    runPsql(containerName, preflightSql);
    const afterRepair = runPsql(
      containerName,
      'SELECT count(*) FROM learning_items WHERE body_document IS NOT NULL;',
    );
    assert(
      afterRepair.trim() === '0',
      `Repair unexpectedly changed body_document rows: ${afterRepair}`,
    );

    const currentStatus = commandResult(
      process.execPath,
      [prismaCli, 'migrate', 'status'],
      {
        cwd: candidateProject,
        env: { DATABASE_URL: resolvedUrl },
      },
    );
    assert(
      !currentStatus.stdout.includes('not found locally'),
      'Candidate still omits the historical production migration',
    );

    runPsql(containerName, backfillSql);
    const afterBackfill = runPsql(
      containerName,
      'SELECT count(*) FROM learning_items WHERE body_document IS NOT NULL;\nSELECT count(*) FROM learning_item_drafts WHERE body_document IS NOT NULL;',
    );
    assert(
      afterBackfill.trim() === '3\n1',
      `Unexpected backfill result: ${afterBackfill}`,
    );

    runPrisma(candidateProject, resolvedUrl, [
      'migrate',
      'resolve',
      '--applied',
      commandReceiptsMigration,
    ]);
    runPrisma(candidateProject, resolvedUrl, [
      'migrate',
      'resolve',
      '--applied',
      bodyDocumentMigration,
    ]);
    runPrisma(candidateProject, resolvedUrl, ['migrate', 'deploy']);
    const finalStatus = commandResult(
      process.execPath,
      [prismaCli, 'migrate', 'status'],
      {
        cwd: candidateProject,
        env: { DATABASE_URL: resolvedUrl },
      },
    );
    assert(
      finalStatus.exitCode === 0,
      `Reconciled migrate status failed: ${finalStatus.stdout}${finalStatus.stderr}`,
    );
    const after = runPsql(containerName, integrityAfterSql);
    assert(
      after.includes('after|learning_items|3'),
      'Learning item count changed',
    );
    assert(after.includes('after|drafts|1'), 'Draft count changed');
    assert(after.includes('after|revisions|1'), 'Revision count changed');
    assert(after.includes('after|enrollments|1'), 'Enrollment count changed');
    assert(
      after.includes('after|body_documents_nonnull|3'),
      'Body document count mismatch',
    );
    assert(
      after.includes('enrollment_projection|1|2026-09-14 00:00:00+00'),
      'Projection backfill mismatch',
    );
    const ledger = runPsql(
      containerName,
      "SELECT migration_name || '|' || checksum FROM _prisma_migrations ORDER BY finished_at, migration_name;",
    );
    assert(
      ledger.includes(`${commandReceiptsMigration}|`),
      'Command receipts migration not reconciled',
    );
    assert(
      ledger.includes(`${bodyDocumentMigration}|`),
      'Body document migration not reconciled',
    );
    assert(
      ledger.includes(`${projectionMigration}|`),
      'Projection migration not applied',
    );
    assert(
      ledger.includes(
        `${historicalMigrationName}|${historicalMigrationSha256}`,
      ),
      'Historical migration ledger was not preserved',
    );
    const projectionObjects = runPsql(
      containerName,
      "SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'financial_projection%';",
    );
    assert(
      projectionObjects.trim() === '3',
      `Unexpected projection table count: ${projectionObjects}`,
    );

    runPsql(containerName, `CREATE DATABASE ${freshDatabaseName};`, 'postgres');
    const freshUrl = databaseUrl
      .replace('PORT', mappedPort)
      .replace(databaseName, freshDatabaseName);
    runPrisma(candidateProject, freshUrl, ['migrate', 'deploy']);
    const freshStatus = commandResult(
      process.execPath,
      [prismaCli, 'migrate', 'status'],
      {
        cwd: candidateProject,
        env: { DATABASE_URL: freshUrl },
      },
    );
    assert(
      freshStatus.exitCode === 0,
      `Fresh migrate status failed: ${freshStatus.stdout}${freshStatus.stderr}`,
    );
    const freshChecks = runPsql(
      containerName,
      "SELECT count(*) FROM _prisma_migrations;\nSELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'financial_projection%';",
      freshDatabaseName,
    );
    assert(
      freshChecks.trim() === '10\n3',
      `Fresh schema checks failed: ${freshChecks}`,
    );

    console.log('PRISMA_RECONCILIATION_REHEARSAL_PASS');
    console.log(`postgres_image=${postgresImage}`);
    console.log(`historical_migration_sha256=${historicalMigrationSha256}`);
    console.log(
      'repair_sql_sha256=299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5',
    );
    console.log(`current_candidate_status_exit=${currentStatus.exitCode}`);
    console.log(
      `current_candidate_status=${(currentStatus.stdout + currentStatus.stderr).replaceAll(/\s+/g, ' ').trim()}`,
    );
    console.log(`final_candidate_status_exit=${finalStatus.exitCode}`);
    console.log(`fresh_candidate_status_exit=${freshStatus.exitCode}`);
    console.log(`ledger=${ledger.trim().replaceAll('\n', ';')}`);
    console.log(`before_integrity=${before.trim().replaceAll('\n', ';')}`);
    console.log(`after_integrity=${after.trim().replaceAll('\n', ';')}`);
  } finally {
    if (!process.argv.includes('--keep-container')) {
      commandResult('docker', ['rm', '--force', containerName]);
    } else if (mappedPort) {
      console.log(`kept_container=${containerName}`);
      console.log(
        `kept_database_url=${databaseUrl.replace('PORT', mappedPort)}`,
      );
    }
    for (const temporaryProject of [baseProject, candidateProject]) {
      try {
        await rm(temporaryProject, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 250,
        });
      } catch (cleanupError) {
        console.error(
          `temporary_cleanup_warning=${temporaryProject}:${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error('PRISMA_RECONCILIATION_REHEARSAL_FAIL');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
