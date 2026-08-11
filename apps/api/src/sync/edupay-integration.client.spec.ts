import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EduPayIntegrationClient,
  EduPayIntegrationError,
} from './edupay-integration.client';

const TOKEN = 'synthetic-edupay-integration-token-000000000000';
const TENANT = 'colegio-conquistadores';
const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';

describe('EduPayIntegrationClient', () => {
  let server: Server;
  let baseUrl: string;
  let requests: Array<{
    headers: Record<string, string | string[] | undefined>;
    url: string;
  }>;
  let responder: (response: import('node:http').ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests.push({ headers: request.headers, url: request.url ?? '' });
      responder(response);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requests = [];
    responder = (response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(courseFeed()));
    };
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('sends dedicated service authentication, tenant scope, schema, and correlation', async () => {
    const client = createClient();
    const result = await client.courseFeed(TENANT, 'safe-correlation', {
      mode: 'incremental',
    });

    expect(result.items[0]?.integrationId).toBe(COURSE_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(requests[0]?.headers['x-source-tenant-id']).toBe(TENANT);
    expect(requests[0]?.headers['x-correlation-id']).toBe('safe-correlation');
    expect(requests[0]?.url).toContain('schemaVersion=1');
  });

  it('rejects malformed or wrong-tenant success responses without coercion', async () => {
    responder = (response) =>
      response.end(JSON.stringify({ schemaVersion: 1 }));
    await expect(
      createClient().courseFeed(TENANT, 'correlation', { mode: 'incremental' }),
    ).rejects.toMatchObject({ code: 'SOURCE_SCHEMA_INVALID' });

    responder = (response) =>
      response.end(
        JSON.stringify({ ...courseFeed(), sourceTenantId: 'another-tenant' }),
      );
    await expect(
      createClient().courseFeed(TENANT, 'correlation', { mode: 'incremental' }),
    ).rejects.toMatchObject({ code: 'SOURCE_TENANT_MISMATCH' });
  });

  it.each([
    [401, 'INTEGRATION_AUTHENTICATION_FAILED', false],
    [403, 'INTEGRATION_TENANT_FORBIDDEN', false],
    [429, 'INTEGRATION_RATE_LIMITED', true],
    [503, 'INTEGRATION_NOT_CONFIGURED', false],
  ] as const)(
    'maps source status %s to stable retry semantics',
    async (status, code, retryable) => {
      responder = (response) => {
        response.statusCode = status;
        response.end(
          JSON.stringify({
            statusCode: status,
            code,
            message: 'Safe source error.',
            timestamp: '2026-08-11T12:00:00.000Z',
            path: '/api/v1/integrations/academico/courses',
            correlationId: 'correlation',
          }),
        );
      };
      const error = await createClient()
        .courseFeed(TENANT, 'correlation', { mode: 'incremental' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EduPayIntegrationError);
      expect(error).toMatchObject({ code, retryable });
      expect(requests).toHaveLength(1);
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    },
  );

  it('aborts a slow request within the configured bound', async () => {
    responder = () => undefined;
    await expect(
      createClient(100).courseFeed(TENANT, 'correlation', {
        mode: 'incremental',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT', retryable: true });
  });

  it('rejects redirects and never follows an arbitrary source location', async () => {
    responder = (response) => {
      response.statusCode = 302;
      response.setHeader('Location', 'https://example.invalid/untrusted');
      response.end();
    };
    await expect(
      createClient().courseFeed(TENANT, 'correlation', { mode: 'incremental' }),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(requests).toHaveLength(1);
  });

  it('treats an unstructured temporary 5xx as retryable without retaining its body', async () => {
    responder = (response) => {
      response.statusCode = 503;
      response.end('temporary upstream failure with no contract body');
    };
    await expect(
      createClient().courseFeed(TENANT, 'correlation', { mode: 'incremental' }),
    ).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      retryable: true,
      sourceUnavailable: true,
    });
  });

  function createClient(timeout = 1_000): EduPayIntegrationClient {
    const values: Record<string, unknown> = {
      EDUPAY_INTEGRATION_BASE_URL: baseUrl,
      EDUPAY_INTEGRATION_TOKEN: TOKEN,
      EDUPAY_INTEGRATION_TIMEOUT_MS: timeout,
      EDUPAY_SYNC_PAGE_SIZE: 100,
    };
    return new EduPayIntegrationClient({
      get: (key: string, fallback: unknown) => values[key] ?? fallback,
      getOrThrow: (key: string) => {
        const value = values[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      },
    } as never);
  }
});

function courseFeed() {
  return {
    schemaVersion: '1',
    sourceTenantId: TENANT,
    entity: 'COURSE',
    mode: 'incremental',
    items: [
      {
        integrationId: COURSE_ID,
        sourceTenantId: TENANT,
        name: 'Primero A',
        updatedAt: '2026-08-11T12:00:00.000Z',
        deletedAt: null,
      },
    ],
    conflicts: [],
    page: {
      limit: 100,
      scannedCount: 1,
      itemCount: 1,
      conflictCount: 0,
      nextCursor: null,
      complete: true,
    },
    watermark: { next: 'opaque-terminal-watermark', available: true },
    run: {
      runId: RUN_ID,
      capturedAt: '2026-08-11T12:00:00.000Z',
    },
  };
}
