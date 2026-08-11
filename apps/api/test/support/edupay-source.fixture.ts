import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

type CourseItem = {
  integrationId: string;
  sourceTenantId: string;
  name: string;
  updatedAt: string;
  deletedAt: string | null;
};

type StudentItem = {
  integrationId: string;
  sourceTenantId: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED';
  courseIntegrationId: string;
  updatedAt: string;
  deletedAt: string | null;
};

type Conflict = {
  code: 'COURSE_NAME_MISSING' | 'STUDENT_STRUCTURED_NAME_MISSING';
  entity: 'COURSE' | 'STUDENT';
  integrationId: string;
  sourceTenantId: string;
  updatedAt: string;
  deletedAt: string | null;
};

type Cursor = {
  offset: number;
  runId: string;
  mode: 'full' | 'incremental';
  snapshot: string | null;
};

export class EduPaySourceFixture {
  readonly token = 'synthetic-source-service-token-0000000000000000';
  readonly sourceTenantId = 'colegio-conquistadores';
  readonly requests: Array<{
    authorization: string | undefined;
    correlationId: string | undefined;
    sourceTenantId: string | undefined;
    url: string;
  }> = [];
  courses: CourseItem[] = [];
  students: StudentItem[] = [];
  conflicts: Conflict[] = [];
  rejectSnapshotCompletion = false;
  failNextCursorEntity: 'COURSE' | 'STUDENT' | undefined;
  private server?: Server;
  private origin?: string;
  private activeSnapshot: { runId: string; token: string } | undefined;

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const address = this.server.address() as AddressInfo;
    this.origin = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
  }

  reset(): void {
    this.requests.length = 0;
    this.courses = [];
    this.students = [];
    this.conflicts = [];
    this.rejectSnapshotCompletion = false;
    this.failNextCursorEntity = undefined;
    this.activeSnapshot = undefined;
  }

  environment(): Record<string, string> {
    if (!this.origin) throw new Error('EduPay source fixture is not started.');
    return {
      EDUPAY_INTEGRATION_BASE_URL: this.origin,
      EDUPAY_INTEGRATION_TOKEN: this.token,
      EDUPAY_INTEGRATION_TIMEOUT_MS: '1000',
      EDUPAY_SYNC_PAGE_SIZE: '1',
      EDUPAY_SYNC_LEASE_SECONDS: '60',
      EDUPAY_SYNC_ITEM_EVIDENCE_LIMIT: '100',
    };
  }

  private async handle(
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ): Promise<void> {
    this.requests.push({
      authorization: request.headers.authorization,
      correlationId: request.headers['x-correlation-id'] as string | undefined,
      sourceTenantId: request.headers['x-source-tenant-id'] as
        string | undefined,
      url: request.url ?? '',
    });
    response.setHeader('Content-Type', 'application/json');
    if (
      request.headers.authorization !== `Bearer ${this.token}` ||
      request.headers['x-source-tenant-id'] !== this.sourceTenantId
    ) {
      this.error(response, 401, 'INTEGRATION_AUTHENTICATION_FAILED');
      return;
    }
    const url = new URL(request.url ?? '/', 'http://source.test');
    const cursorEntity = url.pathname.endsWith('/courses')
      ? 'COURSE'
      : url.pathname.endsWith('/students')
        ? 'STUDENT'
        : undefined;
    if (
      cursorEntity &&
      this.failNextCursorEntity === cursorEntity &&
      url.searchParams.has('cursor')
    ) {
      this.failNextCursorEntity = undefined;
      this.error(response, 503, 'INTEGRATION_RATE_LIMITED');
      return;
    }
    if (url.pathname.endsWith('/snapshot/complete')) {
      const expectedRunId = this.activeSnapshot?.runId;
      if (
        this.rejectSnapshotCompletion ||
        url.searchParams.get('snapshot') !== this.activeSnapshot?.token ||
        url.searchParams.get('courseWatermark') !==
          `watermark:COURSE:full:${expectedRunId}` ||
        url.searchParams.get('studentWatermark') !==
          `watermark:STUDENT:full:${expectedRunId}`
      ) {
        this.error(response, 400, 'INCOMPLETE_SNAPSHOT');
        return;
      }
      response.end(
        JSON.stringify({
          schemaVersion: '1',
          sourceTenantId: this.sourceTenantId,
          snapshot: {
            runId: this.activeSnapshot?.runId,
            capturedAt: '2026-08-11T12:00:00.000Z',
            completedAt: '2026-08-11T12:01:00.000Z',
            requiredEntities: ['COURSE', 'STUDENT'],
            complete: true,
          },
        }),
      );
      return;
    }
    if (url.pathname.endsWith('/snapshot')) {
      const runId = randomUUID();
      this.activeSnapshot = { runId, token: `snapshot:${runId}` };
      response.end(
        JSON.stringify({
          schemaVersion: '1',
          sourceTenantId: this.sourceTenantId,
          snapshotToken: this.activeSnapshot.token,
          snapshot: {
            runId,
            capturedAt: '2026-08-11T12:00:00.000Z',
            requiredEntities: ['COURSE', 'STUDENT'],
            complete: false,
          },
        }),
      );
      return;
    }
    if (url.pathname.endsWith('/courses')) {
      if (!this.validFullSnapshotRequest(url)) {
        this.error(response, 400, 'INVALID_SNAPSHOT');
        return;
      }
      this.feed(response, url, 'COURSE', this.courses);
      return;
    }
    if (url.pathname.endsWith('/students')) {
      if (!this.validFullSnapshotRequest(url)) {
        this.error(response, 400, 'INVALID_SNAPSHOT');
        return;
      }
      this.feed(response, url, 'STUDENT', this.students);
      return;
    }
    response.statusCode = 404;
    response.end();
  }

  private validFullSnapshotRequest(url: URL): boolean {
    if (url.searchParams.get('mode') !== 'full') return true;
    if (url.searchParams.has('cursor')) return true;
    return url.searchParams.get('snapshot') === this.activeSnapshot?.token;
  }

  private feed(
    response: import('node:http').ServerResponse,
    url: URL,
    entity: 'COURSE' | 'STUDENT',
    entityItems: Array<CourseItem | StudentItem>,
  ): void {
    const mode =
      url.searchParams.get('mode') === 'full' ? 'full' : 'incremental';
    const encodedCursor = url.searchParams.get('cursor');
    const cursor = encodedCursor
      ? (JSON.parse(
          Buffer.from(encodedCursor, 'base64url').toString(),
        ) as Cursor)
      : undefined;
    const runId =
      cursor?.runId ??
      (mode === 'full' ? this.activeSnapshot?.runId : randomUUID()) ??
      randomUUID();
    const offset = cursor?.offset ?? 0;
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const all = [
      ...entityItems.map((item) => ({ kind: 'item' as const, value: item })),
      ...this.conflicts
        .filter((conflict) => conflict.entity === entity)
        .map((conflict) => ({ kind: 'conflict' as const, value: conflict })),
    ];
    const visible = all.slice(offset, offset + limit);
    const hasNext = offset + limit < all.length;
    const nextCursor = hasNext
      ? Buffer.from(
          JSON.stringify({
            offset: offset + limit,
            runId,
            mode,
            snapshot: this.activeSnapshot?.token ?? null,
          } satisfies Cursor),
        ).toString('base64url')
      : null;
    const items = visible
      .filter((entry) => entry.kind === 'item')
      .map((entry) => entry.value);
    const conflicts = visible
      .filter((entry) => entry.kind === 'conflict')
      .map((entry) => entry.value);
    const terminalWatermark = hasNext
      ? null
      : `watermark:${entity}:${mode}:${runId}`;
    response.end(
      JSON.stringify({
        schemaVersion: '1',
        sourceTenantId: this.sourceTenantId,
        entity,
        mode,
        items,
        conflicts,
        page: {
          limit,
          scannedCount: visible.length,
          itemCount: items.length,
          conflictCount: conflicts.length,
          nextCursor,
          complete: !hasNext,
        },
        watermark: { next: terminalWatermark, available: !hasNext },
        ...(mode === 'full'
          ? {
              snapshot: {
                runId,
                capturedAt: '2026-08-11T12:00:00.000Z',
                entity,
                entityComplete: !hasNext,
                tenantSnapshotComplete: false,
                requiredEntities: ['COURSE', 'STUDENT'],
              },
            }
          : {
              run: {
                runId,
                capturedAt: '2026-08-11T12:00:00.000Z',
              },
            }),
      }),
    );
  }

  private error(
    response: import('node:http').ServerResponse,
    statusCode: number,
    code:
      | 'INTEGRATION_AUTHENTICATION_FAILED'
      | 'INCOMPLETE_SNAPSHOT'
      | 'INTEGRATION_RATE_LIMITED'
      | 'INVALID_SNAPSHOT',
  ): void {
    response.statusCode = statusCode;
    response.end(
      JSON.stringify({
        statusCode,
        code,
        message: 'The source request was rejected.',
        timestamp: '2026-08-11T12:00:00.000Z',
        path: '/api/v1/integrations/academico',
      }),
    );
  }
}
