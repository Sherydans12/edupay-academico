import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identityRoot = resolve(
  process.env.EDUPAY_IDENTITY_DIR ??
    join(repositoryRoot, '..', '..', 'EduPayIdentity'),
);
const postgresImage = process.env.PILOT_POSTGRES_IMAGE ?? 'postgres:15-alpine';
const clamavImage = process.env.PILOT_CLAMAV_IMAGE ?? 'clamav/clamav:1.4.3';
const useClamAv = process.env.PILOT_MALWARE_SCANNER === 'clamav';
const requestPrefix = `pilot-${randomUUID().slice(0, 8)}`;
const resources = {
  containers: [],
  processes: [],
  temporaryRoot: undefined,
};
const secrets = new Set();
let requestNumber = 0;

function checkpoint(message) {
  process.stdout.write(`CHECKPOINT ${message}\n`);
}

function rememberSecret(value) {
  if (typeof value === 'string' && value.length > 0) secrets.add(value);
  return value;
}

function redact(value) {
  let output = String(value ?? '');
  for (const secret of [...secrets].sort(
    (left, right) => right.length - left.length,
  )) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(activationCode|refreshToken|accessToken|password)\s*[=:]\s*[^\s,}]+/gi,
      '$1=[REDACTED]',
    );
}

function commandFor(tool, args) {
  if (process.platform === 'win32' && tool === 'pnpm') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm', ...args],
    };
  }
  return { command: tool, args };
}

async function run(tool, args, options = {}) {
  const resolved = commandFor(tool, args);
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd ?? repositoryRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
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
      if (code === 0 || options.allowFailure) {
        resolvePromise(result);
        return;
      }
      rejectPromise(
        new Error(
          `${options.label ?? `${tool} ${args.join(' ')}`} failed (${code}).\n${redact(
            `${stdout}\n${stderr}`.trim(),
          )}`,
        ),
      );
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function freePort() {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      const port = address.port;
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise(port);
      });
    });
  });
}

async function waitUntil(label, callback, timeoutMilliseconds = 45_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await callback();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `${label} did not become ready.${lastError ? ` ${redact(lastError.message)}` : ''}`,
  );
}

async function startPostgres(label, database) {
  const password = rememberSecret(randomBytes(24).toString('base64url'));
  const name = `edupay-pilot-${label}-${process.pid}-${randomUUID().slice(0, 8)}`;
  assert.match(name, /^edupay-pilot-[a-z-]+-\d+-[a-f0-9]+$/);
  const environmentFile = join(
    resources.temporaryRoot,
    `${label}-postgres.env`,
  );
  await writeFile(
    environmentFile,
    `POSTGRES_USER=pilot\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,
    { mode: 0o600 },
  );
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--env-file',
      environmentFile,
      '--publish',
      '127.0.0.1::5432',
      postgresImage,
    ],
    { label: `start disposable ${label} PostgreSQL` },
  );
  resources.containers.push(name);
  await waitUntil(`${label} PostgreSQL`, async () => {
    const result = await run(
      'docker',
      ['exec', name, 'pg_isready', '--username', 'pilot', '--dbname', database],
      { allowFailure: true },
    );
    return result.code === 0;
  });
  const portResult = await run('docker', ['port', name, '5432/tcp']);
  const match = portResult.stdout.trim().match(/:(\d+)$/);
  assert(match, `Docker did not publish a PostgreSQL port for ${label}.`);
  const port = Number(match[1]);
  return {
    container: name,
    database,
    url: `postgresql://pilot:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}?schema=public`,
  };
}

async function startClamAv() {
  const name = `edupay-pilot-clamav-${process.pid}-${randomUUID().slice(0, 8)}`;
  assert.match(name, /^edupay-pilot-clamav-\d+-[a-f0-9]+$/);
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::3310',
      '--health-cmd',
      'clamdscan --ping=1 --config-file=/etc/clamav/clamd.conf',
      '--health-interval',
      '15s',
      '--health-timeout',
      '5s',
      '--health-retries',
      '10',
      '--health-start-period',
      '60s',
      clamavImage,
    ],
    { label: 'start disposable ClamAV service' },
  );
  resources.containers.push(name);
  await waitUntil(
    'disposable ClamAV',
    async () => {
      const result = await run(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', name],
        { allowFailure: true },
      );
      return result.stdout.trim() === 'healthy';
    },
    180_000,
  );
  const portResult = await run('docker', ['port', name, '3310/tcp']);
  const match = portResult.stdout.trim().match(/:(\d+)$/);
  assert(match, 'Docker did not publish a ClamAV port.');
  return { container: name, host: '127.0.0.1', port: Number(match[1]) };
}

function startProcess(label, cwd, entrypoint, environment) {
  const logPath = join(resources.temporaryRoot, `${label}.log`);
  const descriptor = openSync(logPath, 'a');
  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env: { ...process.env, ...environment },
    windowsHide: true,
    stdio: ['ignore', descriptor, descriptor],
  });
  closeSync(descriptor);
  const record = { child, label, logPath };
  resources.processes.push(record);
  child.on('exit', (code) => {
    record.exitCode = code;
  });
  return record;
}

async function stopProcess(record) {
  if (record.child.exitCode !== null) return;
  record.child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolvePromise) =>
      record.child.once('exit', () => resolvePromise(true)),
    ),
    sleep(3_000).then(() => false),
  ]);
  if (!exited && process.platform === 'win32') {
    await run('taskkill', ['/pid', String(record.child.pid), '/t', '/f'], {
      allowFailure: true,
    });
  } else if (!exited) {
    record.child.kill('SIGKILL');
  }
}

async function waitForHttp(label, url, processRecord) {
  return await waitUntil(label, async () => {
    if (processRecord.exitCode !== undefined) {
      const log = existsSync(processRecord.logPath)
        ? await readFile(processRecord.logPath, 'utf8')
        : '';
      throw new Error(`${label} exited early. ${redact(log.slice(-4_000))}`);
    }
    const response = await fetch(url, { redirect: 'error' });
    return response.ok;
  });
}

async function hashPassword(password) {
  const script = [
    "import { argon2id, hash } from 'argon2';",
    'const value = await hash(process.env.PILOT_PASSWORD, { type: argon2id, memoryCost: 8192, timeCost: 2, parallelism: 1, hashLength: 32 });',
    'process.stdout.write(value);',
  ].join('\n');
  const result = await run(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: identityRoot,
      env: { PILOT_PASSWORD: password },
      label: 'create disposable Identity password verifier',
    },
  );
  return rememberSecret(result.stdout.trim());
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function executeSql(postgres, sql) {
  await run(
    'docker',
    [
      'exec',
      '--interactive',
      postgres.container,
      'psql',
      '--username',
      'pilot',
      '--dbname',
      postgres.database,
      '--set',
      'ON_ERROR_STOP=1',
      '--quiet',
    ],
    { input: sql, label: `bootstrap ${postgres.database}` },
  );
}

async function scalar(postgres, sql) {
  const result = await run(
    'docker',
    [
      'exec',
      postgres.container,
      'psql',
      '--username',
      'pilot',
      '--dbname',
      postgres.database,
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      sql,
    ],
    { label: `query ${postgres.database}` },
  );
  return result.stdout.trim();
}

function requestUrl(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`);
}

async function requestJson(baseUrl, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('accept', 'application/json');
  headers.set('x-request-id', `${requestPrefix}-${++requestNumber}`);
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined)
    headers.set('content-type', 'application/json');
  const response = await fetch(requestUrl(baseUrl, path), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    redirect: 'error',
  });
  const expected = new Set(
    Array.isArray(options.expected)
      ? options.expected
      : [options.expected ?? (options.method === 'POST' ? 201 : 200)],
  );
  const text = await response.text();
  if (!expected.has(response.status)) {
    let code = '';
    try {
      const parsed = JSON.parse(text);
      code = parsed?.error?.code ? ` (${parsed.error.code})` : '';
    } catch {
      // Keep failure output free of response bodies, which may contain one-time secrets.
    }
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}${code}; expected ${[
        ...expected,
      ].join('/')}.`,
    );
  }
  if (!text) return undefined;
  const data = JSON.parse(text);
  if (data?.accessToken) rememberSecret(data.accessToken);
  if (data?.refreshToken) rememberSecret(data.refreshToken);
  if (data?.activationCode) rememberSecret(data.activationCode);
  return data;
}

async function requestBytes(baseUrl, path, token, expected = 200) {
  const headers = new Headers({
    accept: 'application/octet-stream',
    'x-request-id': `${requestPrefix}-${++requestNumber}`,
  });
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(requestUrl(baseUrl, path), {
    headers,
    redirect: 'error',
  });
  const expectedStatuses = new Set(
    Array.isArray(expected) ? expected : [expected],
  );
  if (!expectedStatuses.has(response.status)) {
    throw new Error(
      `GET ${path} returned ${response.status}; expected ${[...expectedStatuses].join('/')}.`,
    );
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    headers: response.headers,
  };
}

async function login(identityBaseUrl, tenantHandle, identifier, password) {
  return await requestJson(identityBaseUrl, '/api/v1/auth/login', {
    method: 'POST',
    expected: 200,
    body: {
      tenantHandle,
      identifier,
      password,
      device: { label: 'Cross-service pilot smoke' },
    },
  });
}

async function provision(identityBaseUrl, adminToken, tenantId, input) {
  return await requestJson(
    identityBaseUrl,
    `/api/v1/tenants/${tenantId}/memberships`,
    {
      method: 'POST',
      expected: 201,
      token: adminToken,
      body: input,
    },
  );
}

async function activateMembership(
  identityBaseUrl,
  adminToken,
  tenantId,
  membership,
  password,
) {
  const challenge = await requestJson(
    identityBaseUrl,
    `/api/v1/tenants/${tenantId}/memberships/${membership.membershipId}/activation-challenge`,
    { method: 'POST', expected: 201, token: adminToken },
  );
  assert.equal(challenge.membershipId, membership.membershipId);
  assert.equal(challenge.username, membership.institutionalUsername);
  assert.match(challenge.activationCode, /^act_/);
  await requestJson(identityBaseUrl, '/api/v1/auth/activations/complete', {
    method: 'POST',
    expected: 200,
    body: {
      activationCode: challenge.activationCode,
      institutionalUsername: membership.institutionalUsername,
      password,
    },
  });
}

async function uploadText(
  apiBaseUrl,
  token,
  learningItemId,
  filename,
  content,
) {
  const bytes = Buffer.from(content, 'utf8');
  const intent = await requestJson(apiBaseUrl, '/file-upload-intents', {
    method: 'POST',
    expected: 201,
    token,
    body: {
      parentType: 'LEARNING_ITEM',
      parentId: learningItemId,
      category: 'STUDENT_SUBMISSION',
      filename,
      mimeType: 'text/plain',
      sizeBytes: bytes.length,
    },
  });
  assert.equal(intent.status, 'RESERVED');
  assert.equal(intent.upload.fieldName, 'file');
  assert.equal(intent.upload.method, 'POST');
  assert(!JSON.stringify(intent).match(/storageKey|publicUrl|base64/i));

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'text/plain' }), filename);
  const response = await fetch(new URL(intent.upload.path, apiBaseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'x-request-id': `${requestPrefix}-${++requestNumber}`,
    },
    body: form,
    redirect: 'error',
  });
  if (response.status !== 201) {
    throw new Error(
      `Multipart upload returned ${response.status}; expected 201.`,
    );
  }
  const file = await response.json();
  assert.equal(file.originalFilename, filename);
  assert.equal(file.sizeBytes, bytes.length);
  assert.equal(file.category, 'STUDENT_SUBMISSION');
  assert(!JSON.stringify(file).match(/storageKey|publicUrl|base64/i));
  return { bytes, file };
}

async function uploadTextExpectedFailure(
  apiBaseUrl,
  token,
  learningItemId,
  filename,
  content,
) {
  const bytes = Buffer.from(content, 'utf8');
  const intent = await requestJson(apiBaseUrl, '/file-upload-intents', {
    method: 'POST',
    expected: 201,
    token,
    body: {
      parentType: 'LEARNING_ITEM',
      parentId: learningItemId,
      category: 'STUDENT_SUBMISSION',
      filename,
      mimeType: 'text/plain',
      sizeBytes: bytes.length,
    },
  });
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'text/plain' }), filename);
  const response = await fetch(new URL(intent.upload.path, apiBaseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'x-request-id': `${requestPrefix}-${++requestNumber}`,
    },
    body: form,
    redirect: 'error',
  });
  const body = await response.text();
  let errorCode;
  try {
    errorCode = JSON.parse(body)?.error?.code;
  } catch {
    errorCode = undefined;
  }
  return { intentId: intent.id, status: response.status, errorCode, bytes };
}

function byType(page, type) {
  return page.items.filter((notification) => notification.type === type);
}

function clone(value) {
  return structuredClone(value);
}

function assertNoGrade(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoGrade(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert(
      !/grade|score|rubric|points/i.test(key),
      `Unexpected grading field: ${key}`,
    );
    assertNoGrade(nested);
  }
}

async function listFilesRecursively(root) {
  if (!existsSync(root)) return [];
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await listFilesRecursively(path)));
    else output.push(path);
  }
  return output;
}

async function signContextFreeSystemAdminToken(environment, bootstrap) {
  const script = [
    "import { readFile } from 'node:fs/promises';",
    "import { importPKCS8, SignJWT } from 'jose';",
    "const key = await importPKCS8(await readFile(process.env.JWT_PRIVATE_KEY_PATH, 'utf8'), 'RS256');",
    'const now = Math.floor(Date.now() / 1000);',
    "const token = await new SignJWT({ sid: process.env.PILOT_SESSION_ID, scope: ['identity:use'], amr: ['bootstrap'], auth_time: now })",
    "  .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID, typ: 'JWT' })",
    '  .setIssuer(process.env.JWT_ISSUER).setAudience(process.env.JWT_AUDIENCE)',
    '  .setSubject(process.env.PILOT_USER_ID).setJti(process.env.PILOT_JWT_ID)',
    '  .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 600).sign(key);',
    'process.stdout.write(token);',
  ].join('\n');
  const result = await run(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: identityRoot,
      env: {
        ...environment,
        PILOT_USER_ID: bootstrap.systemAdminUserId,
        PILOT_SESSION_ID: bootstrap.systemAdminSessionId,
        PILOT_JWT_ID: randomUUID(),
      },
      label: 'issue context-free SYSTEM_ADMIN contract token',
    },
  );
  return rememberSecret(result.stdout.trim());
}

async function prepareRepositories(identityDatabaseUrl, academicDatabaseUrl) {
  checkpoint(
    'prepare: generating clients, applying migrations, and building both services',
  );
  await run('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: identityRoot,
    label: 'verify Identity origin/main',
  });
  const identityBranch = (
    await run('git', ['branch', '--show-current'], { cwd: identityRoot })
  ).stdout.trim();
  assert.equal(identityBranch, 'main', 'EduPay Identity must be on main.');
  const identityDivergence = (
    await run(
      'git',
      ['rev-list', '--left-right', '--count', 'origin/main...HEAD'],
      {
        cwd: identityRoot,
      },
    )
  ).stdout.trim();
  assert.equal(
    identityDivergence,
    '0\t0',
    'EduPay Identity main must match origin/main.',
  );
  const identityStatus = (
    await run('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: identityRoot,
    })
  ).stdout.trim();
  assert.equal(identityStatus, '', 'EduPay Identity main must be clean.');

  const academicBranch = (
    await run('git', ['branch', '--show-current'], { cwd: repositoryRoot })
  ).stdout.trim();
  assert(
    academicBranch && academicBranch !== 'main',
    'Run the pilot smoke from an Academic feature branch, not main.',
  );

  const skipBuild = process.env.PILOT_SKIP_BUILD === 'true';
  if (!skipBuild) {
    await run('pnpm', ['prisma:generate'], {
      cwd: identityRoot,
      env: { DATABASE_URL: identityDatabaseUrl },
      label: 'generate Identity Prisma client',
    });
  }
  await run('pnpm', ['prisma:migrate:deploy'], {
    cwd: identityRoot,
    env: { DATABASE_URL: identityDatabaseUrl },
    label: 'apply Identity migrations',
  });
  if (!skipBuild) {
    await run('pnpm', ['build'], {
      cwd: identityRoot,
      env: { DATABASE_URL: identityDatabaseUrl },
      label: 'build Identity',
    });
  }

  if (!skipBuild) {
    await run('pnpm', ['--filter', '@edupay/api', 'db:generate'], {
      cwd: repositoryRoot,
      env: { DATABASE_URL: academicDatabaseUrl },
      label: 'generate Academic Prisma client',
    });
  }
  await run('pnpm', ['--filter', '@edupay/api', 'db:migrate:deploy'], {
    cwd: repositoryRoot,
    env: { DATABASE_URL: academicDatabaseUrl },
    label: 'apply Academic migrations',
  });
  if (!skipBuild) {
    await run('pnpm', ['--filter', '@edupay/api', 'build'], {
      cwd: repositoryRoot,
      env: { DATABASE_URL: academicDatabaseUrl },
      label: 'build Academic API',
    });
  }
}

async function bootstrapIdentity(postgres, bootstrap) {
  const adminHash = await hashPassword(bootstrap.adminPassword);
  const systemHash = await hashPassword(bootstrap.systemAdminPassword);
  assert.match(adminHash, /^\$argon2id\$/);
  assert.match(systemHash, /^\$argon2id\$/);
  const roleRows = Object.entries(bootstrap.roleIds)
    .map(([code, id]) => {
      const scope = code === 'SYSTEM_ADMIN' ? 'PLATFORM' : 'TENANT';
      return `(${sqlLiteral(id)}, ${sqlLiteral(code)}::\"RoleCode\", ${sqlLiteral(scope)}::\"RoleScope\")`;
    })
    .join(',\n');
  const sql = `
BEGIN;
INSERT INTO "tenant_realms" ("id", "handle", "status", "updatedAt") VALUES
  (${sqlLiteral(bootstrap.tenantAId)}::uuid, ${sqlLiteral(bootstrap.tenantAHandle)}, 'ACTIVE', now()),
  (${sqlLiteral(bootstrap.tenantBId)}::uuid, ${sqlLiteral(bootstrap.tenantBHandle)}, 'ACTIVE', now());
INSERT INTO "roles" ("id", "code", "scope") VALUES ${roleRows};
INSERT INTO "identity_users" ("id", "status", "updatedAt") VALUES
  (${sqlLiteral(bootstrap.adminUserId)}::uuid, 'ACTIVE', now()),
  (${sqlLiteral(bootstrap.systemAdminUserId)}::uuid, 'ACTIVE', now());
INSERT INTO "password_credentials" ("userId", "passwordHash", "passwordSetAt", "updatedAt") VALUES
  (${sqlLiteral(bootstrap.adminUserId)}::uuid, ${sqlLiteral(adminHash)}, now(), now()),
  (${sqlLiteral(bootstrap.systemAdminUserId)}::uuid, ${sqlLiteral(systemHash)}, now(), now());
INSERT INTO "login_identifiers" ("id", "userId", "tenantRealmId", "kind", "normalizedValue", "updatedAt") VALUES
  (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(bootstrap.adminUserId)}::uuid, ${sqlLiteral(bootstrap.tenantAId)}::uuid, 'USERNAME', ${sqlLiteral(bootstrap.adminUsername)}, now()),
  (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(bootstrap.adminUserId)}::uuid, ${sqlLiteral(bootstrap.tenantBId)}::uuid, 'USERNAME', ${sqlLiteral(bootstrap.adminUsername)}, now());
INSERT INTO "tenant_memberships" ("id", "userId", "tenantRealmId", "status", "activatedAt", "updatedAt") VALUES
  (${sqlLiteral(bootstrap.adminMembershipAId)}::uuid, ${sqlLiteral(bootstrap.adminUserId)}::uuid, ${sqlLiteral(bootstrap.tenantAId)}::uuid, 'ACTIVE', now(), now()),
  (${sqlLiteral(bootstrap.adminMembershipBId)}::uuid, ${sqlLiteral(bootstrap.adminUserId)}::uuid, ${sqlLiteral(bootstrap.tenantBId)}::uuid, 'ACTIVE', now(), now());
INSERT INTO "membership_roles" ("membershipId", "roleId") VALUES
  (${sqlLiteral(bootstrap.adminMembershipAId)}::uuid, ${sqlLiteral(bootstrap.roleIds.TENANT_ADMIN)}::uuid),
  (${sqlLiteral(bootstrap.adminMembershipBId)}::uuid, ${sqlLiteral(bootstrap.roleIds.TENANT_ADMIN)}::uuid);
INSERT INTO "user_roles" ("userId", "roleId", "roleScope") VALUES
  (${sqlLiteral(bootstrap.systemAdminUserId)}::uuid, ${sqlLiteral(bootstrap.roleIds.SYSTEM_ADMIN)}::uuid, 'PLATFORM');
INSERT INTO "sessions" ("id", "userId", "activeMembershipId", "refreshTokenFamilyId", "idleExpiresAt", "absoluteExpiresAt") VALUES
  (${sqlLiteral(bootstrap.systemAdminSessionId)}::uuid, ${sqlLiteral(bootstrap.systemAdminUserId)}::uuid, NULL, ${sqlLiteral(randomUUID())}::uuid, now() + interval '1 day', now() + interval '1 day');
COMMIT;
`;
  await executeSql(postgres, sql);
  return { adminHash };
}

async function bootstrapAcademicTenants(postgres, tenantIds) {
  const values = tenantIds
    .map((tenantId) => `(${sqlLiteral(tenantId)}, now(), now())`)
    .join(',\n');
  await executeSql(
    postgres,
    `INSERT INTO tenants (id, created_at, updated_at) VALUES\n${values};`,
  );
}

async function main() {
  assert(
    existsSync(join(identityRoot, 'package.json')),
    `Identity repository not found at ${identityRoot}.`,
  );
  resources.temporaryRoot = await mkdtemp(
    join(tmpdir(), 'edupay-pilot-cross-service-'),
  );
  await chmod(resources.temporaryRoot, 0o700).catch(() => undefined);
  const storageRoot = join(resources.temporaryRoot, 'private-storage');
  const storageTempRoot = join(storageRoot, 'tmp');
  const keysRoot = join(resources.temporaryRoot, 'identity-keys');
  await mkdir(storageTempRoot, { recursive: true, mode: 0o700 });
  await mkdir(keysRoot, { recursive: true, mode: 0o700 });

  const identityPostgres = await startPostgres('identity', 'identity');
  const academicPostgres = await startPostgres('academic', 'academico');
  checkpoint(
    'topology: separate disposable PostgreSQL 15 containers are healthy',
  );
  const clamav = useClamAv ? await startClamAv() : undefined;
  if (clamav) {
    checkpoint('malware: private disposable ClamAV/clamd service is healthy');
  }
  await prepareRepositories(identityPostgres.url, academicPostgres.url);

  const bootstrap = {
    tenantAId: randomUUID(),
    tenantBId: randomUUID(),
    tenantAHandle: `pilot-a-${randomUUID().slice(0, 8)}`,
    tenantBHandle: `pilot-b-${randomUUID().slice(0, 8)}`,
    adminUserId: randomUUID(),
    adminMembershipAId: randomUUID(),
    adminMembershipBId: randomUUID(),
    adminUsername: `pilot.admin.${randomUUID().slice(0, 8)}`,
    adminPassword: rememberSecret(
      `Adm-${randomBytes(24).toString('base64url')}`,
    ),
    systemAdminUserId: randomUUID(),
    systemAdminSessionId: randomUUID(),
    systemAdminPassword: rememberSecret(
      `Sys-${randomBytes(24).toString('base64url')}`,
    ),
    roleIds: {
      SYSTEM_ADMIN: randomUUID(),
      TENANT_ADMIN: randomUUID(),
      TEACHER: randomUUID(),
      STUDENT: randomUUID(),
      GUARDIAN: randomUUID(),
    },
  };
  const { adminHash } = await bootstrapIdentity(identityPostgres, bootstrap);
  const bootstrapJoinCount = Number(
    await scalar(
      identityPostgres,
      `SELECT count(*) FROM login_identifiers identifiers JOIN identity_users users ON users.id=identifiers."userId" JOIN password_credentials credentials ON credentials."userId"=users.id JOIN tenant_realms realms ON realms.id=identifiers."tenantRealmId" JOIN tenant_memberships memberships ON memberships."userId"=users.id AND memberships."tenantRealmId"=realms.id JOIN membership_roles assignments ON assignments."membershipId"=memberships.id JOIN roles ON roles.id=assignments."roleId" WHERE users.id=${sqlLiteral(bootstrap.adminUserId)}::uuid AND identifiers."normalizedValue"=${sqlLiteral(bootstrap.adminUsername)} AND realms.handle=${sqlLiteral(bootstrap.tenantAHandle)} AND memberships.status='ACTIVE' AND roles.code='TENANT_ADMIN';`,
    ),
  );
  assert.equal(bootstrapJoinCount, 1);
  const storedAdminHash = rememberSecret(
    await scalar(
      identityPostgres,
      `SELECT "passwordHash" FROM password_credentials WHERE "userId"=${sqlLiteral(bootstrap.adminUserId)}::uuid;`,
    ),
  );
  assert.equal(storedAdminHash, adminHash);
  await bootstrapAcademicTenants(academicPostgres, [
    bootstrap.tenantAId,
    bootstrap.tenantBId,
  ]);
  checkpoint(
    'bootstrap: canonical tenants created independently in Identity and Academic',
  );

  const identityPort = await freePort();
  const apiPort = await freePort();
  const identityBaseUrl = `http://127.0.0.1:${identityPort}`;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
  const serviceToken = rememberSecret(randomBytes(32).toString('base64url'));
  const wrongServiceToken = rememberSecret(
    randomBytes(32).toString('base64url'),
  );
  const outboxKey = rememberSecret(randomBytes(32).toString('base64'));

  const privateKeyPath = join(keysRoot, 'identity-private.pem');
  const jwksPath = join(keysRoot, 'identity-public.jwks.json');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  await writeFile(
    privateKeyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  await writeFile(
    jwksPath,
    JSON.stringify({
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'pilot-key',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }),
    { mode: 0o600 },
  );

  const identityEnvironment = {
    NODE_ENV: 'test',
    PORT: String(identityPort),
    DATABASE_URL: identityPostgres.url,
    JWT_ISSUER: identityBaseUrl,
    JWT_AUDIENCE: 'edupay-academico-api',
    JWT_ACCESS_TTL_SECONDS: '600',
    JWT_ALGORITHM: 'RS256',
    JWT_KEY_ID: 'pilot-key',
    JWT_PRIVATE_KEY_PATH: privateKeyPath,
    JWT_PUBLIC_JWKS_PATH: jwksPath,
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
    RATE_LIMIT_INTERNAL_MAX: '5000',
    IDENTITY_ACADEMICO_SERVICE_TOKEN: serviceToken,
    IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS: '',
    IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS_EXPIRES_AT: '',
    RESEND_API_KEY: '',
    IDENTITY_EMAIL_FROM: 'EduPay Identity <identity@example.test>',
    IDENTITY_PUBLIC_BASE_URL: identityBaseUrl,
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
    IDENTITY_OUTBOX_ENCRYPTION_KEY: outboxKey,
  };
  const academicEnvironment = {
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    DATABASE_URL: academicPostgres.url,
    IDENTITY_ISSUER: identityBaseUrl,
    IDENTITY_AUDIENCE: 'edupay-academico-api',
    IDENTITY_JWKS_URI: `${identityBaseUrl}/.well-known/jwks.json`,
    IDENTITY_JWT_ALGORITHMS: 'RS256',
    IDENTITY_CLOCK_SKEW_SECONDS: '30',
    IDENTITY_JWKS_CACHE_MAX_AGE_MS: '60000',
    IDENTITY_JWKS_COOLDOWN_MS: '1000',
    IDENTITY_JWKS_TIMEOUT_MS: '5000',
    IDENTITY_INTERNAL_BASE_URL: identityBaseUrl,
    IDENTITY_INTERNAL_SERVICE_TOKEN: serviceToken,
    IDENTITY_INTERNAL_TIMEOUT_MS: '3000',
    STORAGE_ROOT: storageRoot,
    STORAGE_TEMP_ROOT: storageTempRoot,
    STORAGE_MIN_FREE_BYTES: '0',
    STORAGE_MIN_FREE_PERCENTAGE: '0',
    ACADEMIC_MALWARE_SCANNER: useClamAv ? 'clamav' : 'fake',
    ACADEMIC_CLAMAV_HOST: clamav?.host ?? '',
    ACADEMIC_CLAMAV_PORT: String(clamav?.port ?? 3310),
    ACADEMIC_CLAMAV_TIMEOUT_MS: '10000',
    ACADEMIC_MALWARE_SCAN_CONCURRENCY: '2',
    ACADEMIC_RESEND_API_KEY: '',
    ACADEMIC_EMAIL_FROM: 'EduPay Académico <academic@example.test>',
    ACADEMIC_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}`,
    ACADEMIC_EMAIL_REPLY_TO: '',
    ACADEMIC_EMAIL_MODE: 'fake',
    NOTIFICATION_WORKER_POLL_INTERVAL_MS: '100',
    NOTIFICATION_WORKER_BATCH_SIZE: '50',
    NOTIFICATION_MAX_DELIVERY_ATTEMPTS: '5',
    NOTIFICATION_PROCESSING_LEASE_SECONDS: '30',
    NOTIFICATION_RETRY_SCHEDULE_SECONDS: '1,2,3,4,5',
  };

  const identityProcess = startProcess(
    'identity',
    identityRoot,
    join(identityRoot, 'dist', 'main.js'),
    identityEnvironment,
  );
  await waitForHttp(
    'Identity service',
    `${identityBaseUrl}/api/v1/identity/health`,
    identityProcess,
  );
  const apiProcess = startProcess(
    'academic-api',
    repositoryRoot,
    join(repositoryRoot, 'apps', 'api', 'dist', 'main.js'),
    academicEnvironment,
  );
  await waitForHttp('Academic API', `${apiBaseUrl}/health`, apiProcess);
  const workerProcess = startProcess(
    'academic-worker',
    repositoryRoot,
    join(
      repositoryRoot,
      'apps',
      'api',
      'dist',
      'notifications',
      'notification-worker-main.js',
    ),
    academicEnvironment,
  );
  assert.equal(workerProcess.exitCode, undefined);
  checkpoint(
    'services: real Identity, Academic API, and fake-email worker are running',
  );

  let adminA;
  try {
    adminA = await login(
      identityBaseUrl,
      bootstrap.tenantAHandle,
      bootstrap.adminUsername,
      bootstrap.adminPassword,
    );
  } catch (error) {
    const failedAttempts = await scalar(
      identityPostgres,
      `SELECT "failedAttemptCount" FROM password_credentials WHERE "userId"=${sqlLiteral(bootstrap.adminUserId)}::uuid;`,
    );
    const auditShape = await scalar(
      identityPostgres,
      `SELECT ("actorUserId" IS NOT NULL)::text || ':' || ("tenantRealmId" IS NOT NULL)::text FROM auth_audit_events WHERE "eventType"='LOGIN' ORDER BY "occurredAt" DESC LIMIT 1;`,
    );
    throw new Error(
      `Identity rejected the verified bootstrap principal (failedAttempts=${failedAttempts}, auditActorTenant=${auditShape}). ${error.message}`,
    );
  }
  const adminB = await login(
    identityBaseUrl,
    bootstrap.tenantBHandle,
    bootstrap.adminUsername,
    bootstrap.adminPassword,
  );
  assert.equal(adminA.activeMembership.tenantId, bootstrap.tenantAId);
  assert.equal(adminB.activeMembership.tenantId, bootstrap.tenantBId);

  const systemAdminToken = await signContextFreeSystemAdminToken(
    identityEnvironment,
    bootstrap,
  );
  const systemAdminMe = await requestJson(identityBaseUrl, '/api/v1/auth/me', {
    token: systemAdminToken,
    expected: 200,
  });
  assert.deepEqual(systemAdminMe.platformRoles, ['SYSTEM_ADMIN']);
  assert.equal(systemAdminMe.session.activeMembership, null);
  await requestJson(apiBaseUrl, '/tenant', {
    token: systemAdminToken,
    expected: [401, 403, 404],
  });
  checkpoint(
    'security: context-free SYSTEM_ADMIN has no Academic tenant access',
  );

  await requestJson(apiBaseUrl, '/tenant', {
    token: adminA.accessToken,
    expected: 200,
  });
  const year = await requestJson(apiBaseUrl, '/academic-years', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: {
      label: 'Pilot 2026',
      startDate: '2026-03-01',
      endDate: '2026-12-31',
    },
  });
  const academicTenant = await requestJson(apiBaseUrl, '/tenant', {
    token: adminA.accessToken,
    expected: 200,
  });
  assert.equal(academicTenant.id, bootstrap.tenantAId);
  await requestJson(apiBaseUrl, `/academic-years/${year.id}`, {
    method: 'PATCH',
    token: adminA.accessToken,
    expected: 200,
    body: { status: 'ACTIVE' },
  });
  const course = await requestJson(apiBaseUrl, '/courses', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { academicYearId: year.id, label: '5° Básico A', status: 'ACTIVE' },
  });
  const student = await requestJson(apiBaseUrl, '/students', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: {
      firstName: 'Pilot',
      lastName: 'Student',
      email: 'pilot.student@example.test',
    },
  });
  const teacher = await requestJson(apiBaseUrl, '/teachers', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: {
      firstName: 'Pilot',
      lastName: 'Teacher',
      email: 'pilot.teacher@example.test',
    },
  });
  const subject = await requestJson(apiBaseUrl, '/subjects', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { name: 'Lenguaje' },
  });
  const courseSubject = await requestJson(apiBaseUrl, '/course-subjects', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: {
      courseId: course.id,
      subjectId: subject.id,
      defaultForCourse: true,
      sortOrder: 0,
    },
  });
  await requestJson(apiBaseUrl, '/course-enrollments', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { studentId: student.id, courseId: course.id },
  });
  await requestJson(apiBaseUrl, '/course-subject-teachers', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { courseSubjectId: courseSubject.id, teacherIds: [teacher.id] },
  });
  checkpoint(
    'academic setup: tenant, year, course, people, subject, enrollment, and teacher assignment created',
  );

  const teacherPassword = rememberSecret(
    `Tea-${randomBytes(24).toString('base64url')}`,
  );
  const teacherMembership = await provision(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    {
      institutionalUsername: `pilot.teacher.${randomUUID().slice(0, 8)}`,
      roles: ['TEACHER'],
    },
  );
  assert.equal(teacherMembership.status, 'PENDING_ACTIVATION');
  const linkedTeacher = await requestJson(
    apiBaseUrl,
    `/teachers/${teacher.id}/identity-link`,
    {
      method: 'PUT',
      expected: 200,
      token: adminA.accessToken,
      body: { identityUserId: teacherMembership.userId },
    },
  );
  assert.equal(linkedTeacher.identityUserId, teacherMembership.userId);
  await activateMembership(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    teacherMembership,
    teacherPassword,
  );

  const studentPassword = rememberSecret(
    `Stu-${randomBytes(24).toString('base64url')}`,
  );
  const studentMembership = await provision(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    {
      institutionalUsername: `pilot.student.${randomUUID().slice(0, 8)}`,
      roles: ['STUDENT'],
    },
  );
  assert.equal(studentMembership.status, 'PENDING_ACTIVATION');
  const linkedStudent = await requestJson(
    apiBaseUrl,
    `/students/${student.id}/identity-link`,
    {
      method: 'PUT',
      expected: 200,
      token: adminA.accessToken,
      body: { identityUserId: studentMembership.userId },
    },
  );
  assert.equal(linkedStudent.identityUserId, studentMembership.userId);
  await activateMembership(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    studentMembership,
    studentPassword,
  );

  const teacherLogin = await login(
    identityBaseUrl,
    bootstrap.tenantAHandle,
    teacherMembership.institutionalUsername,
    teacherPassword,
  );
  const studentLogin = await login(
    identityBaseUrl,
    bootstrap.tenantAHandle,
    studentMembership.institutionalUsername,
    studentPassword,
  );
  checkpoint(
    'identity onboarding: Teacher and Student linked while pending, activated, and logged in',
  );

  const outsideTeacher = await requestJson(apiBaseUrl, '/teachers', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { firstName: 'Outside', lastName: 'Teacher' },
  });
  const outsideTeacherPassword = rememberSecret(
    `Out-${randomBytes(24).toString('base64url')}`,
  );
  const outsideTeacherMembership = await provision(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    {
      institutionalUsername: `pilot.outside.${randomUUID().slice(0, 8)}`,
      roles: ['TEACHER'],
    },
  );
  await requestJson(
    apiBaseUrl,
    `/teachers/${outsideTeacher.id}/identity-link`,
    {
      method: 'PUT',
      expected: 200,
      token: adminA.accessToken,
      body: { identityUserId: outsideTeacherMembership.userId },
    },
  );
  await activateMembership(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    outsideTeacherMembership,
    outsideTeacherPassword,
  );
  const outsideTeacherLogin = await login(
    identityBaseUrl,
    bootstrap.tenantAHandle,
    outsideTeacherMembership.institutionalUsername,
    outsideTeacherPassword,
  );

  const unit = await requestJson(apiBaseUrl, '/learning-units', {
    method: 'POST',
    expected: 201,
    token: teacherLogin.accessToken,
    body: {
      courseSubjectId: courseSubject.id,
      title: 'Unidad piloto',
      description: 'Actividad de punta a punta.',
      sortOrder: 0,
    },
  });
  await requestJson(apiBaseUrl, `/learning-units/${unit.id}`, {
    method: 'PATCH',
    expected: 200,
    token: teacherLogin.accessToken,
    body: { status: 'ACTIVE' },
  });
  const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const assignment = await requestJson(
    apiBaseUrl,
    `/learning-units/${unit.id}/items`,
    {
      method: 'POST',
      expected: 201,
      token: teacherLogin.accessToken,
      body: {
        type: 'ASSIGNMENT',
        title: 'Ensayo piloto',
        instructions: 'Entrega los archivos solicitados.',
        dueAt,
        sortOrder: 0,
      },
    },
  );
  const published = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/publish`,
    {
      method: 'POST',
      expected: [200, 201],
      token: teacherLogin.accessToken,
    },
  );
  assert.equal(published.publicationStatus, 'PUBLISHED');
  checkpoint(
    'teacher publication: active LearningUnit and published ASSIGNMENT created',
  );

  const effectiveSubjects = await requestJson(
    apiBaseUrl,
    '/student-context/course-subjects',
    { token: studentLogin.accessToken, expected: 200 },
  );
  assert(effectiveSubjects.some((item) => item.id === courseSubject.id));
  const learningRoute = await requestJson(
    apiBaseUrl,
    `/course-subjects/${courseSubject.id}/learning`,
    { token: studentLogin.accessToken, expected: 200 },
  );
  assert(
    learningRoute.units.some((entry) =>
      entry.items.some((item) => item.id === assignment.id),
    ),
  );
  const visibleAssignment = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}`,
    { token: studentLogin.accessToken, expected: 200 },
  );
  assert.equal(visibleAssignment.id, assignment.id);
  let studentNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: studentLogin.accessToken,
      expected: 200,
    },
  );
  const publishedNotifications = byType(
    studentNotifications,
    'ASSIGNMENT_PUBLISHED',
  );
  assert.equal(publishedNotifications.length, 1);
  const publishedNotification = publishedNotifications[0];
  assert.equal(publishedNotification.readAt, null);
  await requestJson(
    apiBaseUrl,
    `/notifications/${publishedNotification.id}/read`,
    { method: 'PATCH', token: studentLogin.accessToken, expected: 200 },
  );
  await requestJson(
    apiBaseUrl,
    `/notifications/${publishedNotification.id}/read`,
    { method: 'PATCH', token: studentLogin.accessToken, expected: 200 },
  );
  studentNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: studentLogin.accessToken,
      expected: 200,
    },
  );
  assert(byType(studentNotifications, 'ASSIGNMENT_PUBLISHED')[0].readAt);
  assert.equal(byType(studentNotifications, 'ASSIGNMENT_PUBLISHED').length, 1);
  checkpoint(
    'student access: effective CourseSubject, published item, one readable notification verified',
  );

  const usageBefore = await requestJson(apiBaseUrl, '/storage/usage', {
    token: adminA.accessToken,
    expected: 200,
  });
  assert.equal(usageBefore.usedBytes, 0);
  assert.equal(usageBefore.reservedBytes, 0);
  const uploadOne = await uploadText(
    apiBaseUrl,
    studentLogin.accessToken,
    assignment.id,
    'borrador-a.txt',
    'Primera evidencia del piloto.\n',
  );
  const uploadTwo = await uploadText(
    apiBaseUrl,
    studentLogin.accessToken,
    assignment.id,
    'borrador-b.txt',
    'Segunda evidencia independiente.\n',
  );
  const usageAfterTwo = await requestJson(apiBaseUrl, '/storage/usage', {
    token: adminA.accessToken,
    expected: 200,
  });
  assert.equal(
    usageAfterTwo.usedBytes,
    uploadOne.bytes.length + uploadTwo.bytes.length,
  );
  assert.equal(usageAfterTwo.reservedBytes, 0);
  assert.equal(usageAfterTwo.fileCount, 2);
  assert.equal(usageAfterTwo.blobCount, 2);

  await requestJson(apiBaseUrl, `/learning-items/${assignment.id}/submission`, {
    method: 'POST',
    expected: 400,
    token: studentLogin.accessToken,
    body: {
      fileObjectIds: [uploadOne.file.id, uploadTwo.file.id],
      studentComment: 'Entrega inicial.',
      isLate: false,
    },
  });
  const firstSubmission = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/submission`,
    {
      method: 'POST',
      expected: 201,
      token: studentLogin.accessToken,
      body: {
        fileObjectIds: [uploadOne.file.id, uploadTwo.file.id],
        studentComment: 'Entrega inicial.',
      },
    },
  );
  assert.equal(firstSubmission.status, 'SUBMITTED');
  assert.equal(firstSubmission.revisions.length, 1);
  assert.equal(firstSubmission.revisions[0].revisionNumber, 1);
  assert.equal(firstSubmission.revisions[0].isLate, false);
  assert.equal(
    new Date(firstSubmission.revisions[0].effectiveDueAt).getTime(),
    new Date(dueAt).getTime(),
  );
  assert.deepEqual(
    firstSubmission.revisions[0].files.map((file) => file.id).sort(),
    [uploadOne.file.id, uploadTwo.file.id].sort(),
  );
  await requestBytes(
    apiBaseUrl,
    `/files/${uploadOne.file.id}/download`,
    undefined,
    401,
  );
  checkpoint(
    'upload/submission: multipart files, quota, server lateness, and immutable revision 1 verified',
  );

  let teacherNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: teacherLogin.accessToken,
      expected: 200,
    },
  );
  assert.equal(byType(teacherNotifications, 'SUBMISSION_RECEIVED').length, 1);
  const teacherList = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/submissions`,
    { token: teacherLogin.accessToken, expected: 200 },
  );
  assert.equal(teacherList.length, 1);
  assert.equal(teacherList[0].id, firstSubmission.id);
  const teacherDetail = await requestJson(
    apiBaseUrl,
    `/submissions/${firstSubmission.id}`,
    { token: teacherLogin.accessToken, expected: 200 },
  );
  assert.equal(teacherDetail.studentId, student.id);
  const downloadedOne = await requestBytes(
    apiBaseUrl,
    `/files/${uploadOne.file.id}/download`,
    teacherLogin.accessToken,
  );
  assert.deepEqual(downloadedOne.body, uploadOne.bytes);
  assert.match(
    downloadedOne.headers.get('cache-control') ?? '',
    /private, no-store/,
  );
  assert(!downloadedOne.headers.get('location'));

  await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/submissions`,
    { token: outsideTeacherLogin.accessToken, expected: [403, 404] },
  );
  await requestJson(
    apiBaseUrl,
    `/submission-revisions/${firstSubmission.revisions[0].id}/reviews`,
    {
      method: 'POST',
      token: outsideTeacherLogin.accessToken,
      expected: [403, 404],
      body: { action: 'CHANGES_REQUESTED', comment: 'Unauthorized review.' },
    },
  );

  const changed = await requestJson(
    apiBaseUrl,
    `/submission-revisions/${firstSubmission.revisions[0].id}/reviews`,
    {
      method: 'POST',
      expected: 201,
      token: teacherLogin.accessToken,
      body: {
        action: 'CHANGES_REQUESTED',
        comment: 'Corrige la conclusión y vuelve a entregar.',
      },
    },
  );
  assert.equal(changed.status, 'CHANGES_REQUESTED');
  assert.equal(changed.revisions[0].reviews.length, 1);
  assert.equal(changed.revisions[0].reviews[0].action, 'CHANGES_REQUESTED');
  const immutableRevisionOne = clone(changed.revisions[0]);
  studentNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: studentLogin.accessToken,
      expected: 200,
    },
  );
  assert.equal(byType(studentNotifications, 'CHANGES_REQUESTED').length, 1);
  checkpoint(
    'teacher review: assigned teacher downloaded evidence and requested changes; outside teacher denied',
  );

  const corrected = await uploadText(
    apiBaseUrl,
    studentLogin.accessToken,
    assignment.id,
    'correccion.txt',
    'Conclusión corregida y evidencia final.\n',
  );
  const secondSubmission = await requestJson(
    apiBaseUrl,
    `/submissions/${firstSubmission.id}/revisions`,
    {
      method: 'POST',
      expected: 201,
      token: studentLogin.accessToken,
      body: {
        fileObjectIds: [corrected.file.id],
        studentComment: 'Versión corregida.',
      },
    },
  );
  assert.equal(secondSubmission.status, 'SUBMITTED');
  assert.equal(secondSubmission.revisions.length, 2);
  assert.deepEqual(secondSubmission.revisions[0], immutableRevisionOne);
  assert.equal(secondSubmission.revisions[1].revisionNumber, 2);
  teacherNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: teacherLogin.accessToken,
      expected: 200,
    },
  );
  assert.equal(byType(teacherNotifications, 'RESUBMISSION_RECEIVED').length, 1);

  const reviewed = await requestJson(
    apiBaseUrl,
    `/submission-revisions/${secondSubmission.revisions[1].id}/reviews`,
    {
      method: 'POST',
      expected: 201,
      token: teacherLogin.accessToken,
      body: { action: 'REVIEWED', comment: 'Revisión completada.' },
    },
  );
  assert.equal(reviewed.status, 'REVIEWED');
  studentNotifications = await requestJson(
    apiBaseUrl,
    '/notifications?limit=100',
    {
      token: studentLogin.accessToken,
      expected: 200,
    },
  );
  assert.equal(byType(studentNotifications, 'SUBMISSION_REVIEWED').length, 1);
  checkpoint(
    'resubmission/review: immutable revision 2 and final REVIEWED notification verified',
  );

  const finalSubmission = await requestJson(
    apiBaseUrl,
    `/submissions/${firstSubmission.id}`,
    { token: studentLogin.accessToken, expected: 200 },
  );
  const finalTeacherList = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/submissions`,
    { token: teacherLogin.accessToken, expected: 200 },
  );
  assert.equal(finalTeacherList.length, 1);
  assert.equal(finalSubmission.revisions.length, 2);
  assert.deepEqual(finalSubmission.revisions[0], immutableRevisionOne);
  assert.equal(finalSubmission.revisions[1].reviews.length, 1);
  assert.equal(finalSubmission.revisions[1].reviews[0].action, 'REVIEWED');
  const oldBytes = await requestBytes(
    apiBaseUrl,
    `/files/${uploadTwo.file.id}/download`,
    teacherLogin.accessToken,
  );
  const correctedBytes = await requestBytes(
    apiBaseUrl,
    `/files/${corrected.file.id}/download`,
    teacherLogin.accessToken,
  );
  assert.deepEqual(oldBytes.body, uploadTwo.bytes);
  assert.deepEqual(correctedBytes.body, corrected.bytes);
  assertNoGrade(finalSubmission);
  const gradingColumns = Number(
    await scalar(
      academicPostgres,
      "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%grade%' OR column_name ILIKE '%score%' OR column_name ILIKE '%rubric%');",
    ),
  );
  assert.equal(gradingColumns, 0);

  const notificationEventCountsBeforeReads = await scalar(
    academicPostgres,
    `SELECT string_agg(event_type::text || ':' || count_value::text, ',' ORDER BY event_type::text) FROM (SELECT event_type, count(*) AS count_value FROM notification_events WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} GROUP BY event_type) counts;`,
  );
  await requestJson(apiBaseUrl, '/notifications?limit=100', {
    token: studentLogin.accessToken,
    expected: 200,
  });
  await requestJson(apiBaseUrl, '/notifications?limit=100', {
    token: teacherLogin.accessToken,
    expected: 200,
  });
  await requestJson(apiBaseUrl, `/learning-items/${assignment.id}`, {
    token: studentLogin.accessToken,
    expected: 200,
  });
  const notificationEventCountsAfterReads = await scalar(
    academicPostgres,
    `SELECT string_agg(event_type::text || ':' || count_value::text, ',' ORDER BY event_type::text) FROM (SELECT event_type, count(*) AS count_value FROM notification_events WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} GROUP BY event_type) counts;`,
  );
  assert.equal(
    notificationEventCountsAfterReads,
    notificationEventCountsBeforeReads,
  );
  for (const eventType of [
    'ASSIGNMENT_PUBLISHED',
    'SUBMISSION_RECEIVED',
    'CHANGES_REQUESTED',
    'RESUBMISSION_RECEIVED',
    'SUBMISSION_REVIEWED',
  ]) {
    const count = Number(
      await scalar(
        academicPostgres,
        `SELECT count(*) FROM notification_events WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND event_type=${sqlLiteral(eventType)}::\"NotificationEventType\";`,
      ),
    );
    assert.equal(count, 1, `${eventType} event count`);
  }
  await waitUntil('fake academic email deliveries', async () => {
    const pending = Number(
      await scalar(
        academicPostgres,
        `SELECT count(*) FROM notification_deliveries WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND channel='EMAIL' AND status NOT IN ('DELIVERED','SKIPPED');`,
      ),
    );
    return pending === 0;
  });
  const failedAcademicEmail = Number(
    await scalar(
      academicPostgres,
      `SELECT count(*) FROM notification_deliveries WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND channel='EMAIL' AND status='FAILED';`,
    ),
  );
  assert.equal(failedAcademicEmail, 0);
  checkpoint(
    'history/notifications: two revisions, two reviews, no grades, no duplicate events, fake email delivered',
  );

  const secondStudent = await requestJson(apiBaseUrl, '/students', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { firstName: 'Other', lastName: 'Student' },
  });
  const secondStudentPassword = rememberSecret(
    `Two-${randomBytes(24).toString('base64url')}`,
  );
  const secondStudentMembership = await provision(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    {
      institutionalUsername: `pilot.other.${randomUUID().slice(0, 8)}`,
      roles: ['STUDENT'],
    },
  );
  await requestJson(apiBaseUrl, `/students/${secondStudent.id}/identity-link`, {
    method: 'PUT',
    expected: 200,
    token: adminA.accessToken,
    body: { identityUserId: secondStudentMembership.userId },
  });
  await activateMembership(
    identityBaseUrl,
    adminA.accessToken,
    bootstrap.tenantAId,
    secondStudentMembership,
    secondStudentPassword,
  );
  await requestJson(apiBaseUrl, '/course-enrollments', {
    method: 'POST',
    expected: 201,
    token: adminA.accessToken,
    body: { studentId: secondStudent.id, courseId: course.id },
  });
  const secondStudentLogin = await login(
    identityBaseUrl,
    bootstrap.tenantAHandle,
    secondStudentMembership.institutionalUsername,
    secondStudentPassword,
  );
  const duplicateUpload = await uploadText(
    apiBaseUrl,
    secondStudentLogin.accessToken,
    assignment.id,
    'otra-entrega.txt',
    uploadOne.bytes.toString('utf8'),
  );
  const otherSubmission = await requestJson(
    apiBaseUrl,
    `/learning-items/${assignment.id}/submission`,
    {
      method: 'POST',
      expected: 201,
      token: secondStudentLogin.accessToken,
      body: { fileObjectIds: [duplicateUpload.file.id] },
    },
  );
  await requestJson(apiBaseUrl, `/submissions/${otherSubmission.id}`, {
    token: studentLogin.accessToken,
    expected: [403, 404],
  });
  const targetLogicalSubmissionCount = Number(
    await scalar(
      academicPostgres,
      `SELECT count(*) FROM submissions WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND student_id=${sqlLiteral(student.id)}::uuid AND learning_item_id=${sqlLiteral(assignment.id)}::uuid;`,
    ),
  );
  assert.equal(targetLogicalSubmissionCount, 1);

  const usageFinal = await requestJson(apiBaseUrl, '/storage/usage', {
    token: adminA.accessToken,
    expected: 200,
  });
  assert.equal(
    usageFinal.usedBytes,
    uploadOne.bytes.length + uploadTwo.bytes.length + corrected.bytes.length,
  );
  assert.equal(usageFinal.reservedBytes, 0);
  assert.equal(usageFinal.fileCount, 4);
  assert.equal(usageFinal.blobCount, 3);
  checkpoint(
    'security/storage: other Student denied; tenant-local dedup and exact quota accounting verified',
  );

  if (clamav) {
    const eicarBytes = [
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
      'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
      '!$H+H*',
    ].join('');
    const usageBeforeEicar = await requestJson(apiBaseUrl, '/storage/usage', {
      token: adminA.accessToken,
      expected: 200,
    });
    const eicar = await uploadTextExpectedFailure(
      apiBaseUrl,
      studentLogin.accessToken,
      assignment.id,
      'security-check.txt',
      eicarBytes,
    );
    assert.equal(eicar.status, 400);
    assert.equal(eicar.errorCode, 'MALWARE_DETECTED');
    assert.equal(
      await scalar(
        academicPostgres,
        `SELECT status FROM upload_intents WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND id=${sqlLiteral(eicar.intentId)}::uuid;`,
      ),
      'FAILED',
    );
    const usageAfterEicar = await requestJson(apiBaseUrl, '/storage/usage', {
      token: adminA.accessToken,
      expected: 200,
    });
    assert.equal(usageAfterEicar.reservedBytes, 0);
    assert.equal(usageAfterEicar.usedBytes, usageBeforeEicar.usedBytes);
    assert.equal(usageAfterEicar.fileCount, usageBeforeEicar.fileCount);
    assert.equal(usageAfterEicar.blobCount, usageBeforeEicar.blobCount);
    await requestBytes(
      apiBaseUrl,
      `/files/${randomUUID()}/download`,
      studentLogin.accessToken,
      [403, 404],
    );
    const eicarOnDisk = await Promise.all(
      (await listFilesRecursively(storageRoot)).map(async (path) =>
        (await readFile(path)).includes(Buffer.from(eicarBytes, 'ascii')),
      ),
    );
    assert.equal(eicarOnDisk.some(Boolean), false);
    assert.deepEqual(await listFilesRecursively(storageTempRoot), []);
    checkpoint(
      'malware: clean files remained available; dynamically generated EICAR was rejected, unreleased, and not downloadable',
    );

    if (process.env.PILOT_CLAMAV_FAILURE_GATE !== 'false') {
      await run('docker', ['stop', clamav.container], {
        label: 'stop disposable ClamAV for fail-closed check',
      });
      await requestJson(apiBaseUrl, '/health/ready', { expected: 503 });
      const unavailable = await uploadTextExpectedFailure(
        apiBaseUrl,
        studentLogin.accessToken,
        assignment.id,
        'scanner-unavailable.txt',
        'safe retry after scanner outage\n',
      );
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.errorCode, 'MALWARE_SCANNER_UNAVAILABLE');
      assert.equal(
        await scalar(
          academicPostgres,
          `SELECT status FROM upload_intents WHERE tenant_id=${sqlLiteral(bootstrap.tenantAId)} AND id=${sqlLiteral(unavailable.intentId)}::uuid;`,
        ),
        'FAILED',
      );
      assert.deepEqual(await listFilesRecursively(storageTempRoot), []);
      checkpoint(
        'malware: scanner outage failed readiness and rejected uploads closed',
      );
    }
  }

  const yearB = await requestJson(apiBaseUrl, '/academic-years', {
    method: 'POST',
    expected: 201,
    token: adminB.accessToken,
    body: {
      label: 'Pilot B 2026',
      startDate: '2026-03-01',
      endDate: '2026-12-31',
    },
  });
  assert(yearB.id);
  const academicTenantB = await requestJson(apiBaseUrl, '/tenant', {
    token: adminB.accessToken,
    expected: 200,
  });
  assert.equal(academicTenantB.id, bootstrap.tenantBId);
  await requestJson(apiBaseUrl, `/students/${student.id}`, {
    token: adminB.accessToken,
    expected: [403, 404],
  });
  await requestBytes(
    apiBaseUrl,
    `/files/${uploadOne.file.id}/download`,
    adminB.accessToken,
    [403, 404],
  );

  await requestJson(
    identityBaseUrl,
    `/internal/v1/sessions/${adminA.sessionId}/status`,
    {
      token: wrongServiceToken,
      expected: [401, 403],
    },
  );
  await requestJson(identityBaseUrl, '/api/v1/auth/logout', {
    method: 'POST',
    expected: 204,
    token: adminA.accessToken,
  });
  await requestJson(apiBaseUrl, `/students/${student.id}/identity-link`, {
    method: 'PUT',
    expected: 403,
    token: adminA.accessToken,
    body: { identityUserId: studentMembership.userId },
  });
  checkpoint(
    'security: cross-tenant resource/file, wrong service credential, and revoked high-risk session denied',
  );

  const tempFiles = await listFilesRecursively(storageTempRoot);
  assert.deepEqual(tempFiles, []);
  const storedFiles = (await listFilesRecursively(storageRoot)).filter(
    (path) => !path.startsWith(storageTempRoot),
  );
  assert.equal(storedFiles.length, 3);
  for (const path of storedFiles) {
    assert(path.startsWith(storageRoot));
    assert(!path.includes('..'));
  }
  checkpoint(
    'cleanup evidence: multipart staging is empty and private blob count matches quota accounting',
  );
  checkpoint('PASS full real-service pilot cross-service smoke');
}

async function cleanup() {
  for (const processRecord of [...resources.processes].reverse()) {
    await stopProcess(processRecord).catch(() => undefined);
  }
  for (const container of [...resources.containers].reverse()) {
    if (!/^edupay-pilot-[a-z-]+-\d+-[a-f0-9]+$/.test(container)) continue;
    await run('docker', ['rm', '--force', container], {
      allowFailure: true,
    }).catch(() => undefined);
  }
  if (resources.temporaryRoot) {
    const target = resolve(resources.temporaryRoot);
    const expectedParent = resolve(tmpdir());
    const targetStats = await lstat(target);
    if (
      resolve(dirname(target)) === expectedParent &&
      /^edupay-pilot-cross-service-[A-Za-z0-9]{6}$/.test(basename(target)) &&
      targetStats.isDirectory() &&
      !targetStats.isSymbolicLink()
    ) {
      await rm(target, { recursive: true });
    }
  }
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
  process.stderr.write(
    `PILOT SMOKE FAILED: ${redact(error?.stack ?? error)}\n`,
  );
  for (const record of resources.processes) {
    if (!existsSync(record.logPath)) continue;
    const log = await readFile(record.logPath, 'utf8').catch(() => '');
    if (log) {
      process.stderr.write(
        `SERVICE LOG ${record.label}:\n${redact(log.slice(-4_000))}\n`,
      );
    }
  }
} finally {
  await cleanup();
}

if (failure) process.exitCode = 1;
