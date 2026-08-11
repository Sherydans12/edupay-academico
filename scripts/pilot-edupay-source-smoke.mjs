import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, openSync, closeSync } from 'node:fs';
import { chmod, lstat, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(
  process.env.EDUPAY_SOURCE_DIR ?? join(root, '..', '..', 'EduPay'),
);
const postgresImage = process.env.PILOT_POSTGRES_IMAGE ?? 'postgres:15-alpine';
const sourceTenantId = 'colegio-conquistadores';
const resources = { containers: [], processes: [], temp: undefined };

function checkpoint(message) {
  console.log(`CHECKPOINT ${message}`);
}

function commandFor(tool, args) {
  if (process.platform === 'win32' && tool === 'pnpm')
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm', ...args],
    };
  if (process.platform === 'win32' && (tool === 'npm' || tool === 'npx'))
    return { command: `${tool}.cmd`, args };
  return { command: tool, args };
}

async function run(tool, args, options = {}) {
  const resolved = commandFor(tool, args);
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...(options.env ?? {}) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      const result = { code: code ?? -1, stdout, stderr };
      if (result.code === 0 || options.allowFailure)
        return resolvePromise(result);
      rejectPromise(
        new Error(
          `${options.label ?? `${tool} ${args.join(' ')}`} failed (${result.code}).`,
        ),
      );
    });
  });
}

async function waitUntil(label, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // Disposable services are expected to take a few seconds to start.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label} did not become ready.`);
}

async function freePort() {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      const port = address.port;
      server.close((error) =>
        error ? rejectPromise(error) : resolvePromise(port),
      );
    });
  });
}

async function startPostgres(label, database) {
  const password = randomBytes(24).toString('base64url');
  const name = `edupay-sync-${label}-${process.pid}-${randomUUID().slice(0, 8)}`;
  assert.match(name, /^edupay-sync-[a-z-]+-\d+-[a-f0-9]+$/);
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '-e',
      'POSTGRES_USER=pilot',
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      `POSTGRES_DB=${database}`,
      '--publish',
      '127.0.0.1::5432',
      postgresImage,
    ],
    { label: `start ${label} PostgreSQL` },
  );
  resources.containers.push(name);
  await waitUntil(
    `${label} PostgreSQL`,
    async () =>
      (
        await run(
          'docker',
          ['exec', name, 'pg_isready', '-U', 'pilot', '-d', database],
          { allowFailure: true },
        )
      ).code === 0,
  );
  const port = Number(
    (await run('docker', ['port', name, '5432/tcp'])).stdout
      .trim()
      .match(/:(\d+)$/)?.[1],
  );
  assert(Number.isInteger(port));
  return {
    container: name,
    database,
    url: `postgresql://pilot:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}?schema=public`,
  };
}

async function sql(postgres, statement) {
  return (
    await run(
      'docker',
      [
        'exec',
        postgres.container,
        'psql',
        '-U',
        'pilot',
        '-d',
        postgres.database,
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        statement,
      ],
      { label: `query ${postgres.database}` },
    )
  ).stdout.trim();
}

async function startSource(environment, port) {
  const logPath = join(resources.temp, 'edupay-source.log');
  const descriptor = openSync(logPath, 'a');
  const child = spawn(
    process.execPath,
    [join(sourceRoot, 'backend', 'dist', 'main.js')],
    {
      cwd: join(sourceRoot, 'backend'),
      env: { ...process.env, ...environment, PORT: String(port) },
      windowsHide: true,
      stdio: ['ignore', descriptor, descriptor],
    },
  );
  closeSync(descriptor);
  const record = { child, exitCode: undefined };
  child.on('exit', (code) => {
    record.exitCode = code;
  });
  resources.processes.push(record);
  await waitUntil('BL-002 source API health', async () => {
    if (record.exitCode !== undefined) throw new Error('source API exited');
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    return response.ok;
  });
  return record;
}

const academicEnvironment = (
  academicDatabaseUrl,
  sourceBaseUrl,
  sourceToken,
) => ({
  NODE_ENV: 'test',
  DATABASE_URL: academicDatabaseUrl,
  IDENTITY_ISSUER: 'http://identity.invalid',
  IDENTITY_AUDIENCE: 'edupay-academico-api',
  IDENTITY_JWKS_URI: 'http://identity.invalid/.well-known/jwks.json',
  IDENTITY_INTERNAL_BASE_URL: 'http://identity.invalid',
  IDENTITY_INTERNAL_SERVICE_TOKEN: randomBytes(32).toString('base64url'),
  EDUPAY_INTEGRATION_BASE_URL: sourceBaseUrl,
  EDUPAY_INTEGRATION_TOKEN: sourceToken,
  EDUPAY_INTEGRATION_ALLOW_PRIVATE_HTTP: 'true',
  ACADEMIC_TRUSTED_WEB_ORIGINS: 'http://localhost:3000',
  STORAGE_ROOT: join(root, 'tmp', 'pilot-sync-files'),
  STORAGE_TEMP_ROOT: join(root, 'tmp', 'pilot-sync-files', 'tmp'),
  STORAGE_MIN_FREE_BYTES: '0',
  STORAGE_MIN_FREE_PERCENTAGE: '0',
  ACADEMIC_MALWARE_SCANNER: 'fake',
  ACADEMIC_CLAMAV_PORT: '3310',
  ACADEMIC_CLAMAV_TIMEOUT_MS: '10000',
  ACADEMIC_EMAIL_MODE: 'fake',
});

async function main() {
  assert(
    existsSync(join(sourceRoot, 'backend', 'package.json')),
    `BL-002 source repository not found at ${sourceRoot}.`,
  );
  const sourceStatus = (
    await run('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: sourceRoot,
    })
  ).stdout.trim();
  assert.equal(sourceStatus, '', 'BL-002 source checkout must be clean.');
  const sourceBranch = (
    await run('git', ['branch', '--show-current'], { cwd: sourceRoot })
  ).stdout.trim();
  assert.equal(sourceBranch, 'main', 'BL-002 source checkout must be on main.');
  const sourceDivergence = (
    await run(
      'git',
      ['rev-list', '--left-right', '--count', 'origin/main...HEAD'],
      { cwd: sourceRoot },
    )
  ).stdout.trim();
  assert.equal(
    sourceDivergence,
    '0\t0',
    'BL-002 source main must match origin/main.',
  );

  resources.temp = await mkdtemp(join(tmpdir(), 'edupay-source-smoke-'));
  await chmod(resources.temp, 0o700).catch(() => undefined);
  const sourcePostgres = await startPostgres('source', 'edupay');
  const academicPostgres = await startPostgres('academic', 'academico');
  const sourceToken = randomBytes(32).toString('base64url');
  const cursorSecret = randomBytes(32).toString('base64url');
  const sourcePort = await freePort();
  const sourceEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: sourcePostgres.url,
    EDUPAY_ACADEMICO_INTEGRATION_TOKEN: sourceToken,
    EDUPAY_ACADEMICO_CURSOR_SECRET: cursorSecret,
    EDUPAY_ACADEMICO_ALLOWED_TENANTS: sourceTenantId,
    EDUPAY_ACADEMICO_RATE_LIMIT_PER_MINUTE: '1000',
    JWT_SECRET: randomBytes(32).toString('base64url'),
    UPLOAD_DIR: join(resources.temp, 'source-uploads'),
  };

  if (process.env.PILOT_SKIP_BUILD !== 'true') {
    await run('npm', ['ci'], {
      cwd: join(sourceRoot, 'backend'),
      label: 'install BL-002 dependencies',
    });
    await run('npx', ['prisma', 'generate'], {
      cwd: join(sourceRoot, 'backend'),
      env: sourceEnv,
      label: 'generate BL-002 client',
    });
    await run('npm', ['run', 'build'], {
      cwd: join(sourceRoot, 'backend'),
      env: sourceEnv,
      label: 'build BL-002 source API',
    });
    await run('pnpm', ['--filter', '@edupay/api', 'db:generate'], {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'generate Academic client',
    });
    await run('pnpm', ['--filter', '@edupay/api', 'build'], {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'build Academic sync consumer',
    });
  }
  await run('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(sourceRoot, 'backend'),
    env: sourceEnv,
    label: 'migrate BL-002 source database',
  });
  const seed = await run('npx', ['prisma', 'db', 'seed'], {
    cwd: join(sourceRoot, 'backend'),
    env: sourceEnv,
    label: 'seed disposable BL-002 source data',
  });
  assert(seed.code === 0);
  const sourceProcess = await startSource(sourceEnv, sourcePort);
  const sourceBaseUrl = `http://127.0.0.1:${sourcePort}`;
  const academicEnv = academicEnvironment(
    academicPostgres.url,
    sourceBaseUrl,
    sourceToken,
  );
  await run('pnpm', ['--filter', '@edupay/api', 'db:generate'], {
    cwd: root,
    env: academicEnv,
    label: 'generate Academic sync client',
  });
  await run('pnpm', ['--filter', '@edupay/api', 'db:migrate:deploy'], {
    cwd: root,
    env: academicEnv,
    label: 'migrate Academic sync database',
  });

  const tenantId = randomUUID();
  const academicYearId = randomUUID();
  await run('pnpm', ['bootstrap:tenant', '--', '--tenant-id', tenantId], {
    cwd: root,
    env: academicEnv,
    label: 'bootstrap disposable Academic tenant',
  });
  await sql(
    academicPostgres,
    `INSERT INTO academic_years (id, tenant_id, label, start_date, end_date, status) VALUES ('${academicYearId}', '${tenantId}', 'Pilot Sync 2026', DATE '2026-01-01', DATE '2026-12-31', 'ACTIVE');`,
  );
  const configureArgs = [
    'sync:configure',
    '--',
    '--tenant-id',
    tenantId,
    '--source-tenant-id',
    sourceTenantId,
    '--academic-year-id',
    academicYearId,
  ];
  const configured = await run('pnpm', configureArgs, {
    cwd: root,
    env: academicEnv,
    label: 'configure EduPay mapping',
  });
  assert.match(configured.stdout, /"created":true/);
  const configuredAgain = await run('pnpm', configureArgs, {
    cwd: root,
    env: academicEnv,
    label: 'rerun EduPay mapping',
  });
  assert.match(configuredAgain.stdout, /already-compatible/);
  const invalidMapping = await run(
    'pnpm',
    [
      'sync:configure',
      '--',
      '--tenant-id',
      tenantId,
      '--source-tenant-id',
      sourceTenantId,
      '--academic-year-id',
      randomUUID(),
    ],
    { cwd: root, env: academicEnv, allowFailure: true },
  );
  assert.notEqual(invalidMapping.code, 0);
  checkpoint(
    'sync configuration: canonical mapping, active AcademicYear, idempotent rerun, and invalid mapping refusal verified',
  );

  await run(
    'pnpm',
    ['sync:run', '--', '--tenant-id', tenantId, '--mode', 'incremental'],
    { cwd: root, env: academicEnv, label: 'run real BL-002 incremental sync' },
  );
  await run(
    'pnpm',
    ['sync:run', '--', '--tenant-id', tenantId, '--mode', 'full'],
    { cwd: root, env: academicEnv, label: 'run real BL-002 full sync' },
  );
  const courseCount = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM courses WHERE tenant_id='${tenantId}' AND source='EDUPAY' AND external_reference IS NOT NULL;`,
    ),
  );
  const studentCount = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM students WHERE tenant_id='${tenantId}' AND source='EDUPAY' AND external_reference IS NOT NULL;`,
    ),
  );
  const enrollmentCount = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM course_enrollments WHERE tenant_id='${tenantId}' AND source='EDUPAY' AND external_reference IS NOT NULL;`,
    ),
  );
  const succeededRuns = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM sync_runs WHERE tenant_id='${tenantId}' AND status='SUCCEEDED';`,
    ),
  );
  const fullComplete = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM sync_runs WHERE tenant_id='${tenantId}' AND mode='FULL' AND status='SUCCEEDED' AND snapshot_complete=true AND watermark_advanced=true;`,
    ),
  );
  const academicPersonalData = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM students WHERE tenant_id='${tenantId}' AND (email IS NOT NULL OR identity_user_id IS NOT NULL);`,
    ),
  );
  const forbiddenAcademicTables = Number(
    await sql(
      academicPostgres,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('guardians','payments','payment_concepts');",
    ),
  );
  assert(courseCount > 0);
  assert(studentCount > 0);
  assert(enrollmentCount > 0);
  assert(succeededRuns >= 2);
  assert(fullComplete >= 1);
  assert.equal(academicPersonalData, 0);
  assert.equal(forbiddenAcademicTables, 0);
  checkpoint(
    'sync results: Course/Student identities, source-managed enrollments, terminal watermarks/full completion, and data minimization verified',
  );

  const academicDump = await run(
    'docker',
    [
      'exec',
      academicPostgres.container,
      'pg_dump',
      '-U',
      'pilot',
      '-d',
      academicPostgres.database,
    ],
    { label: 'inspect disposable Academic dump for source token' },
  );
  assert(!academicDump.stdout.includes(sourceToken));
  assert(!academicDump.stderr.includes(sourceToken));
  checkpoint(
    'sync secret custody: source token absent from disposable Academic database dump',
  );
  void sourceProcess;
}

let failure;
try {
  await main();
  checkpoint('PASS real BL-002 current-main synchronization smoke');
} catch (error) {
  failure = error;
  console.error(
    `EDUPAY SOURCE SMOKE FAILED: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
} finally {
  for (const processRecord of [...resources.processes].reverse()) {
    processRecord.child.kill('SIGTERM');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    if (processRecord.exitCode === undefined)
      processRecord.child.kill('SIGKILL');
  }
  for (const container of [...resources.containers].reverse())
    await run('docker', ['rm', '--force', container], {
      allowFailure: true,
    }).catch(() => undefined);
  if (resources.temp) {
    const target = resolve(resources.temp);
    const stats = await lstat(target).catch(() => undefined);
    if (
      stats?.isDirectory() &&
      !stats.isSymbolicLink() &&
      resolve(dirname(target)) === resolve(tmpdir()) &&
      basename(target).startsWith('edupay-source-smoke-')
    )
      await rm(target, { recursive: true, force: true });
  }
}
if (failure) process.exitCode = 1;
