import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, openSync, closeSync } from 'node:fs';
import { chmod, lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identityRoot = resolve(
  process.env.EDUPAY_IDENTITY_DIR ?? join(root, '..', '..', 'EduPayIdentity'),
);
const postgresImage = process.env.PILOT_POSTGRES_IMAGE ?? 'postgres:15-alpine';
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
      const diagnostics = options.safeDiagnostics
        ? safeDiagnostics(`${stdout}\n${stderr}`)
        : '';
      rejectPromise(
        new Error(
          `${options.label ?? `${tool} ${args.join(' ')}`} failed (${result.code}).${diagnostics ? ` Safe diagnostic: ${diagnostics}` : ''}`,
        ),
      );
    });
  });
}

function safeDiagnostics(output) {
  const redacted = output
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[redacted]')
    .replace(/\b(?:act|inv)_[A-Za-z0-9_-]+\b/g, '[redacted-activation]')
    .replace(/(token|secret|password|key)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
  return redacted
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join(' | ')
    .slice(0, 1_200);
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

async function waitUntil(label, check, timeoutMs = 45_000) {
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

async function startPostgres(label, database) {
  const password = randomBytes(24).toString('base64url');
  const name = `edupay-bootstrap-${label}-${process.pid}-${randomUUID().slice(0, 8)}`;
  assert.match(name, /^edupay-bootstrap-[a-z-]+-\d+-[a-f0-9]+$/);
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

function identityEnvironment(databaseUrl, keys, port) {
  return {
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_ISSUER: `http://127.0.0.1:${port}`,
    JWT_AUDIENCE: 'edupay-academico-api',
    JWT_ACCESS_TTL_SECONDS: '600',
    JWT_ALGORITHM: 'RS256',
    JWT_KEY_ID: 'bootstrap-key',
    JWT_PRIVATE_KEY_PATH: keys.privateKeyPath,
    JWT_PUBLIC_JWKS_PATH: keys.jwksPath,
    JWKS_CACHE_MAX_AGE_SECONDS: '60',
    ARGON2_MEMORY_COST: '8192',
    ARGON2_TIME_COST: '2',
    ARGON2_PARALLELISM: '1',
    ARGON2_HASH_LENGTH: '32',
    ARGON2_SALT_LENGTH: '16',
    OPAQUE_TOKEN_BYTES: '32',
    REFRESH_IDLE_TTL_SECONDS: '2592000',
    SESSION_ABSOLUTE_TTL_SECONDS: '7776000',
    LOGOUT_ALL_REAUTH_MAX_AGE_SECONDS: '600',
    PASSWORD_LOCK_THRESHOLD: '100',
    PASSWORD_LOCK_SECONDS: '900',
    RATE_LIMIT_WINDOW_SECONDS: '900',
    RATE_LIMIT_LOGIN_MAX: '1000',
    RATE_LIMIT_REFRESH_MAX: '1000',
    RATE_LIMIT_INTERNAL_MAX: '1000',
    IDENTITY_ACADEMICO_SERVICE_TOKEN: randomBytes(32).toString('base64url'),
    IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS: '',
    IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS_EXPIRES_AT: '',
    RESEND_API_KEY: '',
    IDENTITY_EMAIL_FROM: 'EduPay Identity <identity@example.test>',
    IDENTITY_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    IDENTITY_TRUSTED_WEB_ORIGINS: '',
    IDENTITY_COOKIE_SECURE: 'false',
    IDENTITY_REFRESH_COOKIE_SAMESITE: 'lax',
    IDENTITY_EMAIL_INVITATION_TTL_SECONDS: '86400',
    IDENTITY_ACTIVATION_TTL_SECONDS: '3600',
    IDENTITY_PASSWORD_RESET_TTL_SECONDS: '3600',
    ACTIVATION_ATTEMPT_LIMIT: '100',
    PASSWORD_MIN_LENGTH: '12',
    OUTBOX_MAX_ATTEMPTS: '5',
    OUTBOX_BASE_BACKOFF_SECONDS: '30',
    IDENTITY_OUTBOX_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
}

async function waitForHttp(url, processRecord) {
  return waitUntil(url, async () => {
    if (processRecord.exitCode !== undefined) throw new Error('service exited');
    return (await fetch(url)).ok;
  });
}

function startIdentity(environment) {
  const logPath = join(resources.temp, 'identity.log');
  const descriptor = openSync(logPath, 'a');
  const child = spawn(
    process.execPath,
    [join(identityRoot, 'dist', 'main.js')],
    {
      cwd: identityRoot,
      env: { ...process.env, ...environment },
      windowsHide: true,
      stdio: ['ignore', descriptor, descriptor],
    },
  );
  closeSync(descriptor);
  const record = { child, logPath, exitCode: undefined };
  child.on('exit', (code) => {
    record.exitCode = code;
  });
  resources.processes.push(record);
  return record;
}

async function stopProcess(record) {
  if (record.child.exitCode !== null && record.exitCode !== undefined) return;
  record.child.kill('SIGTERM');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  if (record.exitCode === undefined) record.child.kill('SIGKILL');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  assert.equal(response.status, options.expected ?? 200);
  return text ? JSON.parse(text) : undefined;
}

async function main() {
  assert(
    existsSync(join(identityRoot, 'package.json')),
    `Identity repository not found at ${identityRoot}.`,
  );
  resources.temp = await mkdtemp(join(tmpdir(), 'edupay-bootstrap-smoke-'));
  await chmod(resources.temp, 0o700).catch(() => undefined);
  const identityPostgres = await startPostgres('identity', 'identity');
  const academicPostgres = await startPostgres('academic', 'academico');
  checkpoint(
    'topology: separate disposable PostgreSQL 15 containers are healthy',
  );

  const keys = {
    privateKeyPath: join(resources.temp, 'identity-private.pem'),
    jwksPath: join(resources.temp, 'identity-jwks.json'),
  };
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  await writeFile(
    keys.privateKeyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  await writeFile(
    keys.jwksPath,
    JSON.stringify({
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'bootstrap-key',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }),
    { mode: 0o600 },
  );
  const identityPort = await freePort();
  const identityEnv = identityEnvironment(
    identityPostgres.url,
    keys,
    identityPort,
  );

  if (process.env.PILOT_SKIP_BUILD !== 'true') {
    await run('pnpm', ['prisma:generate'], {
      cwd: identityRoot,
      env: identityEnv,
      label: 'generate Identity client',
    });
    await run('pnpm', ['build'], {
      cwd: identityRoot,
      env: identityEnv,
      label: 'build Identity',
    });
    await run('pnpm', ['--filter', '@edupay/api', 'db:generate'], {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'generate Academic client',
    });
    await run('pnpm', ['--filter', '@edupay/api', 'build'], {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'build Academic',
    });
  }
  await run('pnpm', ['prisma:migrate:deploy'], {
    cwd: identityRoot,
    env: identityEnv,
    label: 'migrate Identity',
  });
  await run('pnpm', ['--filter', '@edupay/api', 'db:migrate:deploy'], {
    cwd: root,
    env: { DATABASE_URL: academicPostgres.url },
    label: 'migrate Academic',
  });

  const tenantId = randomUUID();
  const handle = `pilot-bootstrap-${randomUUID().slice(0, 8)}`;
  const username = `pilot.admin.${randomUUID().slice(0, 8)}`;
  const bootstrapArgs = [
    'bootstrap:tenant-admin',
    '--tenant-id',
    tenantId,
    '--tenant-handle',
    handle,
    '--username',
    username,
    '--activation',
    'code',
    '--request-id',
    'pilot-bootstrap-smoke',
  ];
  const identityBootstrap = await run('pnpm', bootstrapArgs, {
    cwd: identityRoot,
    env: identityEnv,
    label: 'run actual Identity tenant-admin bootstrap',
    safeDiagnostics: true,
  });
  const output = JSON.parse(
    identityBootstrap.stdout
      .trim()
      .split('\n')
      .find((line) => line.trim().startsWith('{')) ?? '{}',
  );
  assert.equal(output.action, 'IDENTITY_TENANT_ADMIN_BOOTSTRAP');
  assert.equal(output.membershipStatus, 'PENDING_ACTIVATION');
  assert.equal(output.roles.length, 1);
  assert.equal(output.roles[0], 'TENANT_ADMIN');
  const activationCode = output.activation.activationCode;
  assert.match(activationCode, /^act_/);
  await run(
    'pnpm',
    [
      'bootstrap:tenant',
      '--tenant-id',
      tenantId,
      '--request-id',
      'pilot-bootstrap-smoke',
    ],
    {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'run actual Academic tenant bootstrap',
    },
  );
  checkpoint(
    'bootstrap: actual Identity and Academic commands used the same canonical UUID',
  );

  const identityAdminCount = Number(
    await sql(
      identityPostgres,
      `SELECT count(*) FROM tenant_memberships m JOIN membership_roles mr ON mr."membershipId"=m.id JOIN roles r ON r.id=mr."roleId" WHERE m."tenantRealmId"='${tenantId}'::uuid AND r.code='TENANT_ADMIN';`,
    ),
  );
  const systemAdminCount = Number(
    await sql(
      identityPostgres,
      `SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur."roleId" WHERE r.code='SYSTEM_ADMIN';`,
    ),
  );
  const academicTenantCount = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM tenants WHERE id='${tenantId}';`,
    ),
  );
  const quotaCount = Number(
    await sql(
      academicPostgres,
      `SELECT count(*) FROM storage_quota_policies WHERE tenant_id='${tenantId}';`,
    ),
  );
  assert.equal(identityAdminCount, 1);
  assert.equal(systemAdminCount, 0);
  assert.equal(academicTenantCount, 1);
  assert.equal(quotaCount, 1);

  const identityRerun = await run('pnpm', bootstrapArgs, {
    cwd: identityRoot,
    env: identityEnv,
    label: 'rerun Identity tenant-admin bootstrap',
  });
  assert.match(identityRerun.stdout, /already-compatible/);
  const academicRerun = await run(
    'pnpm',
    [
      'bootstrap:tenant',
      '--tenant-id',
      tenantId,
      '--request-id',
      'pilot-bootstrap-smoke-rerun',
    ],
    {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      label: 'rerun Academic tenant bootstrap',
    },
  );
  assert.match(academicRerun.stdout, /already-compatible/);
  const identityConflictArgs = [...bootstrapArgs];
  identityConflictArgs[5] = 'different-handle';
  const identityConflict = await run('pnpm', identityConflictArgs, {
    cwd: identityRoot,
    env: identityEnv,
    allowFailure: true,
  });
  assert.notEqual(identityConflict.code, 0);
  const academicConflict = await run(
    'pnpm',
    ['bootstrap:tenant', '--tenant-id', tenantId, '--quota-bytes', '1'],
    {
      cwd: root,
      env: { DATABASE_URL: academicPostgres.url },
      allowFailure: true,
    },
  );
  assert.notEqual(academicConflict.code, 0);
  checkpoint(
    'bootstrap: compatible reruns are idempotent and incompatible reruns fail',
  );

  const emailProbeTenantId = randomUUID();
  const emailProbeHandle = `pilot-email-${randomUUID().slice(0, 8)}`;
  const emailProbeUsername = `pilot.email.${randomUUID().slice(0, 8)}`;
  const emailProbeBootstrap = await run(
    'pnpm',
    [
      'bootstrap:tenant-admin',
      '--tenant-id',
      emailProbeTenantId,
      '--tenant-handle',
      emailProbeHandle,
      '--username',
      emailProbeUsername,
      '--activation',
      'email',
      '--email',
      'pilot.email@example.test',
      '--request-id',
      'pilot-bootstrap-email-outbox',
    ],
    {
      cwd: identityRoot,
      env: identityEnv,
      label: 'create disposable Identity email activation intent',
      safeDiagnostics: true,
    },
  );
  const emailProbeOutput = JSON.parse(
    emailProbeBootstrap.stdout
      .trim()
      .split('\n')
      .find((line) => line.trim().startsWith('{')) ?? '{}',
  );
  assert.equal(emailProbeOutput.action, 'IDENTITY_TENANT_ADMIN_BOOTSTRAP');
  assert.equal(emailProbeOutput.activation.method, 'email');
  const pendingEmailIntents = Number(
    await sql(
      identityPostgres,
      `SELECT count(*) FROM outbox_events WHERE "eventType"='identity.email.invitation.v1' AND "status"='PENDING';`,
    ),
  );
  assert.equal(pendingEmailIntents, 1);
  checkpoint(
    'email lifecycle: actual Identity email activation created one disposable outbox intent without calling Resend',
  );
  await sql(
    identityPostgres,
    `DELETE FROM outbox_events WHERE "eventType"='identity.email.invitation.v1' AND "status"='PENDING';`,
  );

  const identityEmailWorker = await run('pnpm', ['email:deliver'], {
    cwd: identityRoot,
    env: identityEnv,
    label: 'run independent Identity email worker',
    safeDiagnostics: true,
  });
  assert.match(
    identityEmailWorker.stdout,
    /Identity email outbox run complete/,
  );
  checkpoint(
    'workers: independently runnable Identity email worker completed an empty disposable outbox',
  );

  const identityProcess = startIdentity(identityEnv);
  const identityBaseUrl = `http://127.0.0.1:${identityPort}`;
  await waitForHttp(
    `${identityBaseUrl}/api/v1/identity/health`,
    identityProcess,
  );
  const password = `Pilot-${randomBytes(24).toString('base64url')}`;
  await requestJson(`${identityBaseUrl}/api/v1/auth/activations/complete`, {
    method: 'POST',
    expected: 200,
    body: { activationCode, institutionalUsername: username, password },
  });
  const login = await requestJson(`${identityBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    expected: 200,
    body: {
      tenantHandle: handle,
      identifier: username,
      password,
      device: { label: 'Disposable bootstrap smoke' },
    },
  });
  assert.equal(login.activeMembership.tenantId, tenantId);
  assert.deepEqual(login.activeMembership.roles, ['TENANT_ADMIN']);
  const activatedRerun = await run('pnpm', bootstrapArgs, {
    cwd: identityRoot,
    env: identityEnv,
    label: 'verify activated Identity bootstrap rerun',
  });
  assert.match(activatedRerun.stdout, /activated/);
  checkpoint(
    'activation/login: one-time code produced normal active TENANT_ADMIN account without bootstrap password',
  );
}

let failure;
try {
  await main();
  checkpoint('PASS disposable first-tenant bootstrap smoke');
} catch (error) {
  failure = error;
  console.error(
    `BOOTSTRAP SMOKE FAILED: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
} finally {
  for (const processRecord of [...resources.processes].reverse())
    await stopProcess(processRecord).catch(() => undefined);
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
      basename(target).startsWith('edupay-bootstrap-smoke-')
    )
      await rm(target, { recursive: true, force: true });
  }
}
if (failure) process.exitCode = 1;
