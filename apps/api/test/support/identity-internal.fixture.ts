import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const NO_OVERRIDE = Symbol('NO_OVERRIDE');

interface SessionContext {
  identityUserId: string;
  membershipId: string;
  sessionId: string;
  tenantId: string;
}

export interface IdentityInternalRequest {
  body: unknown;
  headers: IncomingMessage['headers'];
  method: string | undefined;
  url: string | undefined;
}

export class IdentityInternalFixture {
  readonly requests: IdentityInternalRequest[] = [];
  readonly serviceToken =
    'academic_test_service_token_000000000000000000000000';
  delayMs = 0;
  forcedStatus: number | undefined;
  identityLinkResponse: unknown | typeof NO_OVERRIDE = NO_OVERRIDE;
  sessionResponse: unknown | typeof NO_OVERRIDE = NO_OVERRIDE;

  private baseUrlValue!: string;
  private readonly sessions = new Map<string, SessionContext>();
  private readonly server = createServer((request, response) => {
    void this.handle(request, response);
  });

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server.address() as AddressInfo;
    this.baseUrlValue = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  reset(): void {
    this.delayMs = 0;
    this.forcedStatus = undefined;
    this.identityLinkResponse = NO_OVERRIDE;
    this.requests.length = 0;
    this.sessionResponse = NO_OVERRIDE;
    this.sessions.clear();
  }

  registerSession(context: SessionContext): void {
    this.sessions.set(context.sessionId, context);
  }

  environment(timeoutMs = 3_000): Record<string, string> {
    return {
      IDENTITY_INTERNAL_BASE_URL: this.baseUrl,
      IDENTITY_INTERNAL_SERVICE_TOKEN: this.serviceToken,
      IDENTITY_INTERNAL_TIMEOUT_MS: String(timeoutMs),
    };
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(request);
    this.requests.push({
      body,
      headers: request.headers,
      method: request.method,
      url: request.url,
    });

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (request.headers.authorization !== `Bearer ${this.serviceToken}`) {
      this.json(response, 401, { error: { message: 'unauthorized' } });
      return;
    }
    if (this.forcedStatus !== undefined) {
      this.json(response, this.forcedStatus, {
        error: { message: `rejected ${this.serviceToken}` },
      });
      return;
    }

    if (
      request.method === 'GET' &&
      request.url?.startsWith('/internal/v1/sessions/') &&
      request.url.endsWith('/status')
    ) {
      const sessionId = decodeURIComponent(
        request.url.slice('/internal/v1/sessions/'.length, -'/status'.length),
      );
      const context = this.sessions.get(sessionId) ?? {
        identityUserId: 'identity-user-a',
        membershipId: 'membership-a',
        sessionId,
        tenantId: 'tenant-a',
      };
      this.json(
        response,
        200,
        this.sessionResponse === NO_OVERRIDE
          ? {
              active: true,
              identityUserId: context.identityUserId,
              membershipActive: true,
              membershipId: context.membershipId,
              sessionActive: true,
              sessionId: context.sessionId,
              tenantId: context.tenantId,
            }
          : this.sessionResponse,
      );
      return;
    }

    if (
      request.method === 'POST' &&
      request.url === '/internal/v1/identity-users/resolve'
    ) {
      const requestBody = body as {
        actor?: { tenantId?: unknown };
        expectedRole?: unknown;
        targetIdentityUserId?: unknown;
      };
      this.json(
        response,
        200,
        this.identityLinkResponse === NO_OVERRIDE
          ? {
              verified: true,
              identityUserId: requestBody.targetIdentityUserId,
              membershipId: 'target-membership',
              tenantId: requestBody.actor?.tenantId,
              membershipStatus: 'ACTIVE',
              roles: [requestBody.expectedRole],
            }
          : this.identityLinkResponse,
      );
      return;
    }

    this.json(response, 404, { error: { message: 'not found' } });
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    if (response.destroyed) {
      return;
    }
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  }

  private async readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
      return undefined;
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
}
