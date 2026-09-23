import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(root, 'apps', 'api');
const migrationsRoot = join(apiRoot, 'prisma', 'migrations');
const prismaCli = join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js');
const allMigrations = (await import('node:fs/promises'))
  .readdir(migrationsRoot, { withFileTypes: true })
  .then((rows) => rows.filter((row) => row.isDirectory()).map((row) => row.name).sort());
const migrationNames = await allMigrations;
const deployedTen = migrationNames.slice(0, 10);
if (deployedTen.at(-1) !== '20260903110000_financial_projection_producer') {
  throw new Error('The expected ten-migration deployed baseline changed.');
}
const container = `die-cumulative-upgrade-${process.pid}`;
const password = 'synthetic_upgrade_gate';
const database = 'academic_upgrade';
const storageRoot = await mkdtemp(join(apiRoot, '.die-upgrade-storage-'));
const bytes = Buffer.from('existing synthetic private file\n');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const storageKey = `tenants/synthetic-upgrade/blobs/${sha256}`;

function command(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(sql, target = database) {
  return command(
    'docker',
    ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', target, '-t', '-A'],
    { input: sql },
  ).trim();
}

async function project(names) {
  const directory = await mkdtemp(join(apiRoot, '.die-upgrade-prisma-'));
  await mkdir(join(directory, 'prisma', 'migrations'), { recursive: true });
  await cp(join(apiRoot, 'prisma', 'schema.prisma'), join(directory, 'prisma', 'schema.prisma'));
  await cp(join(migrationsRoot, 'migration_lock.toml'), join(directory, 'prisma', 'migrations', 'migration_lock.toml'));
  for (const name of names) {
    await cp(join(migrationsRoot, name), join(directory, 'prisma', 'migrations', name), { recursive: true });
  }
  await writeFile(
    join(directory, 'prisma.config.ts'),
    "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL } });\n",
  );
  return directory;
}

const baseline = await project(deployedTen);
const candidate = await project(migrationNames);
let port;
try {
  command('docker', [
    'run', '--detach', '--rm', '--name', container,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432', 'postgres:15-alpine',
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const mapped = command('docker', ['port', container, '5432/tcp']).match(/:(\d+)/)?.[1];
      if (mapped) {
        command('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', database]);
        port = mapped;
        break;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  if (!port) throw new Error('Disposable PostgreSQL did not become ready.');
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  command(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: baseline, env: { DATABASE_URL: url } });
  const tenantId = 'synthetic-upgrade';
  const studentId = randomUUID();
  const blobId = randomUUID();
  const fileId = randomUUID();
  await mkdir(dirname(join(storageRoot, storageKey)), { recursive: true });
  await writeFile(join(storageRoot, storageKey), bytes);
  psql(`
    INSERT INTO tenants (id, updated_at) VALUES ('${tenantId}', NOW());
    INSERT INTO students (id, tenant_id, pagination_token, first_name, last_name, updated_at)
      VALUES ('${studentId}', '${tenantId}', '${randomUUID()}', 'Synthetic', 'Student', NOW());
    INSERT INTO stored_blobs
      (id, tenant_id, storage_key, sha256, stored_size_bytes, detected_mime,
       detected_extension, lifecycle, validation_status, scan_status, validated_at, available_at)
      VALUES ('${blobId}', '${tenantId}', '${storageKey}', '${sha256}', ${bytes.length},
       'application/pdf', '.pdf', 'AVAILABLE', 'VALID', 'CLEAR', NOW(), NOW());
    INSERT INTO file_objects
      (id, tenant_id, stored_blob_id, original_filename, normalized_filename,
       declared_size_bytes, authoritative_size_bytes, declared_mime, detected_mime,
       extension, category, uploaded_by_identity_user_id, lifecycle, validated_at)
      VALUES ('${fileId}', '${tenantId}', '${blobId}', 'existing.pdf', 'existing.pdf',
       ${bytes.length}, ${bytes.length}, 'application/pdf', 'application/pdf', '.pdf',
       'LEARNING_MATERIAL', 'synthetic-user', 'AVAILABLE', NOW());
    INSERT INTO financial_projection_outbox_events
      (id, tenant_id, event_type, schema_version, aggregate_id, entity_version,
       payload, occurred_at, updated_at)
      VALUES ('${randomUUID()}', '${tenantId}', 'synthetic.preserved.v1', '1',
       '${studentId}', 1, '{"synthetic":true}'::jsonb, NOW(), NOW());
  `);
  const beforeLedger = psql('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;');
  const beforeCounts = psql(`SELECT
    (SELECT count(*) FROM students WHERE tenant_id='${tenantId}') || '|' ||
    (SELECT count(*) FROM file_objects WHERE tenant_id='${tenantId}') || '|' ||
    (SELECT count(*) FROM financial_projection_outbox_events WHERE tenant_id='${tenantId}');`);
  command(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: candidate, env: { DATABASE_URL: url } });
  const afterLedger = psql('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;');
  const afterCounts = psql(`SELECT
    (SELECT count(*) FROM students WHERE tenant_id='${tenantId}') || '|' ||
    (SELECT count(*) FROM file_objects WHERE tenant_id='${tenantId}') || '|' ||
    (SELECT count(*) FROM financial_projection_outbox_events WHERE tenant_id='${tenantId}');`);
  const stored = await readFile(join(storageRoot, storageKey));
  if (beforeLedger !== '10' || afterLedger !== String(migrationNames.length)) throw new Error('Migration ledger count mismatch.');
  if (beforeCounts !== '1|1|1' || afterCounts !== beforeCounts) throw new Error('Representative data was not preserved.');
  if (createHash('sha256').update(stored).digest('hex') !== sha256) throw new Error('Existing private file changed.');
  console.log(JSON.stringify({
    gate: 'academic-10-to-candidate',
    baselineMigrations: 10,
    candidateMigrations: migrationNames.length,
    dataPreserved: true,
    ledgerPreserved: true,
    privateFilePreserved: true,
  }));
} finally {
  try { command('docker', ['rm', '--force', container]); } catch {}
  await rm(baseline, { recursive: true, force: true });
  await rm(candidate, { recursive: true, force: true });
  await rm(storageRoot, { recursive: true, force: true });
}
