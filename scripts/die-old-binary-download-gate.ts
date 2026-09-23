import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Pool } from 'pg';

import { IdentityInternalFixture } from '../apps/api/test/support/identity-internal.fixture';
import { IdentityJwksFixture } from '../apps/api/test/support/identity-jwks.fixture';

const oldRoot = process.env.DIE_OLD_ACADEMIC_ROOT;
const databaseUrl = process.env.DIE_ROLLBACK_DATABASE_URL;
if (!oldRoot || !databaseUrl) {
  throw new Error(
    'DIE_OLD_ACADEMIC_ROOT and DIE_ROLLBACK_DATABASE_URL are required.',
  );
}

const tenantId = `die-rollback-${randomUUID().slice(0, 8)}`;
const actorId = 'synthetic-rollback-admin';
const membershipId = 'synthetic-rollback-membership';
const sessionId = 'synthetic-rollback-session';
const studentId = randomUUID();
const episodeId = randomUUID();
const entryId = randomUUID();
const revisionId = randomUUID();
const blobId = randomUUID();
const fileObjectId = randomUUID();
const referenceId = randomUUID();
const bytes = Buffer.from('synthetic DIE rollback boundary evidence\n');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const storageKey = `tenants/${tenantId}/blobs/${sha256}`;
async function main(): Promise<void> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'edupay-die-old-gate-'));
  const storageTempRoot = join(storageRoot, 'tmp');
  const pool = new Pool({ connectionString: databaseUrl });
  const jwks = new IdentityJwksFixture();
  const identity = new IdentityInternalFixture();
  let child: ReturnType<typeof spawn> | undefined;
  let containment: ReturnType<typeof createHttpServer> | undefined;

  try {
    await mkdir(dirname(join(storageRoot, storageKey)), { recursive: true });
    await mkdir(storageTempRoot, { recursive: true });
    await writeFile(join(storageRoot, storageKey), bytes);
    await pool.query('BEGIN');
    await pool.query(
      'INSERT INTO tenants (id, updated_at) VALUES ($1, NOW())',
      [tenantId],
    );
    await pool.query(
      `INSERT INTO students
      (id, tenant_id, pagination_token, first_name, last_name, updated_at)
     VALUES ($1, $2, $3, 'Estudiante', 'Sintético', NOW())`,
      [studentId, tenantId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO die_support_episodes
      (id, tenant_id, student_id, start_date, reason,
       created_by_identity_user_id, updated_at)
     VALUES ($1, $2, $3, DATE '2026-09-23', 'Gate sintético', $4, NOW())`,
      [episodeId, tenantId, studentId, actorId],
    );
    await pool.query(
      `INSERT INTO die_journal_entries
      (id, tenant_id, student_id, support_episode_id,
       original_author_identity_user_id, original_author_display_label, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5, NOW())`,
      [entryId, tenantId, studentId, episodeId, actorId],
    );
    await pool.query(
      `INSERT INTO die_journal_revisions
      (id, tenant_id, journal_entry_id, revision_number, category, event_date,
       title, description, information_source, corrected_by_identity_user_id,
       corrected_by_display_label)
     VALUES ($1, $2, $3, 1, 'OBSERVATION', DATE '2026-09-23',
       'Gate sintético', 'Contenido sintético', 'WITNESSED', $4, $4)`,
      [revisionId, tenantId, entryId, actorId],
    );
    await pool.query(
      `INSERT INTO stored_blobs
      (id, tenant_id, storage_key, sha256, stored_size_bytes, detected_mime,
       detected_extension, lifecycle, validation_status, scan_status,
       validated_at, available_at)
     VALUES ($1, $2, $3, $4, $5, 'application/pdf', '.pdf', 'AVAILABLE',
       'VALID', 'CLEAR', NOW(), NOW())`,
      [blobId, tenantId, storageKey, sha256, bytes.length],
    );
    await pool.query(
      `INSERT INTO file_objects
      (id, tenant_id, stored_blob_id, original_filename, normalized_filename,
       declared_size_bytes, authoritative_size_bytes, declared_mime,
       detected_mime, extension, category, uploaded_by_identity_user_id,
       lifecycle, validated_at)
     VALUES ($1, $2, $3, 'evidence.pdf', 'evidence.pdf', $4, $4,
       'application/pdf', 'application/pdf', '.pdf', 'DIE_ATTACHMENT', $5,
       'AVAILABLE', NOW())`,
      [fileObjectId, tenantId, blobId, bytes.length, actorId],
    );
    await pool.query(
      `INSERT INTO file_references
      (id, tenant_id, file_object_id, reference_type, category,
       die_journal_entry_id, created_by_identity_user_id)
     VALUES ($1, $2, $3, 'DIE_JOURNAL_ENTRY', 'DIE_ATTACHMENT', $4, $5)`,
      [referenceId, tenantId, fileObjectId, entryId, actorId],
    );
    await pool.query('COMMIT');

    await jwks.start();
    await identity.start();
    identity.registerSession({
      identityUserId: actorId,
      membershipId,
      sessionId,
      tenantId,
    });
    const port = await freePort();
    const token = await jwks.sign({
      membership_id: membershipId,
      roles: ['TENANT_ADMIN'],
      sid: sessionId,
      sub: actorId,
      tenant_id: tenantId,
    });
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: oldRoot,
      env: {
        ...process.env,
        ...jwks.environment(),
        ...identity.environment(),
        API_HOST: '127.0.0.1',
        API_PORT: String(port),
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
        STORAGE_ROOT: storageRoot,
        STORAGE_TEMP_ROOT: storageTempRoot,
        STORAGE_MIN_FREE_BYTES: '0',
        STORAGE_MIN_FREE_PERCENTAGE: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let processOutput = '';
    child.stdout?.on('data', (chunk) => (processOutput += String(chunk)));
    child.stderr?.on('data', (chunk) => (processOutput += String(chunk)));
    await waitUntilReady(port, child, () => processOutput);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/files/${fileObjectId}/download`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const responseBytes = Buffer.from(await response.arrayBuffer());
    if (response.ok || responseBytes.equals(bytes)) {
      throw new Error('The previous API exposed a DIE attachment.');
    }
    const safeErrorBody = responseBytes.toString('utf8');
    if (
      safeErrorBody.includes('Contenido sintético') ||
      safeErrorBody.includes('evidence.pdf') ||
      safeErrorBody.includes(tenantId)
    ) {
      throw new Error('The previous API error disclosed protected metadata.');
    }
    const contentType = response.headers.get('content-type') ?? '';
    const oldExport = await fetch(
      `http://127.0.0.1:${port}/api/v1/die/students/${studentId}/export.pdf`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (oldExport.ok) {
      throw new Error('The previous API unexpectedly served a DIE export.');
    }

    const containmentPort = await freePort();
    containment = createHttpServer((request, proxyResponse) => {
      const url = request.url ?? '';
      const protectedPath =
        /^\/api\/v1\/files\/[^/]+\/download$/.test(url) ||
        /^\/api\/v1\/die\/students\/[^/]+\/export\.pdf$/.test(url);
      proxyResponse.writeHead(protectedPath ? 503 : 404, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      proxyResponse.end(
        JSON.stringify({
          error: {
            code: protectedPath ? 'DIE_RECOVERY_CONTAINMENT' : 'NOT_FOUND',
          },
        }),
      );
    });
    await new Promise<void>((resolve) =>
      containment!.listen(containmentPort, '127.0.0.1', resolve),
    );
    for (const path of [
      `/api/v1/files/${fileObjectId}/download`,
      `/api/v1/die/students/${studentId}/export.pdf`,
    ]) {
      const blocked = await fetch(
        `http://127.0.0.1:${containmentPort}${path}`,
      );
      if (blocked.status !== 503) {
        throw new Error(`Containment did not block ${path}.`);
      }
    }
    console.log(
      JSON.stringify({
        gate: 'previous-api-die-download-boundary',
        oldApiStatus: response.status,
        oldExportStatus: oldExport.status,
        containedRoutes: [
          '/api/v1/files/:fileObjectId/download',
          '/api/v1/die/students/:studentId/export.pdf',
        ],
        protected: true,
        responseWasAttachment: contentType.startsWith('application/pdf'),
        tenantScope: 'synthetic',
      }),
    );
  } finally {
    await new Promise<void>((resolve) =>
      containment ? containment.close(() => resolve()) : resolve(),
    );
    child?.kill();
    await jwks.close().catch(() => undefined);
    await identity.close().catch(() => undefined);
    await pool.end();
    await rm(storageRoot, { recursive: true, force: true });
  }
}

void main();

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local port.'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitUntilReady(
  port: number,
  process: ReturnType<typeof spawn>,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null)
      throw new Error(`Previous API exited early: ${output().slice(-1000)}`);
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/ready`,
      );
      if (response.ok) return;
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Previous API did not become ready: ${output().slice(-1000)}`,
  );
}
