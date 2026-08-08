import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';

const TEST_KEY_ID = 'identity-test-key';

export class IdentityJwksFixture {
  private attackerPrivateKey!: KeyLike;
  private issuerUrl!: string;
  private privateKey!: KeyLike;
  private publicJwk!: JWK;
  private server = createServer((request, response) => {
    if (request.url !== '/.well-known/jwks.json') {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      'cache-control': 'public, max-age=30',
      'content-type': 'application/json',
    });
    response.end(JSON.stringify({ keys: [this.publicJwk] }));
  });

  get issuer(): string {
    return this.issuerUrl;
  }

  get jwksUri(): string {
    return `${this.issuerUrl}/.well-known/jwks.json`;
  }

  async start(): Promise<void> {
    const trusted = await generateKeyPair('RS256');
    const attacker = await generateKeyPair('RS256');
    this.privateKey = trusted.privateKey;
    this.attackerPrivateKey = attacker.privateKey;
    this.publicJwk = {
      ...(await exportJWK(trusted.publicKey)),
      alg: 'RS256',
      kid: TEST_KEY_ID,
      use: 'sig',
    };

    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server.address() as AddressInfo;
    this.issuerUrl = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  environment(): Record<string, string> {
    return {
      API_HOST: '127.0.0.1',
      API_PORT: '3001',
      DATABASE_URL:
        'postgresql://USER:PASSWORD@localhost:5432/edupay_academico',
      IDENTITY_AUDIENCE: 'edupay-academico-api',
      IDENTITY_CLOCK_SKEW_SECONDS: '30',
      IDENTITY_ISSUER: this.issuer,
      IDENTITY_JWKS_CACHE_MAX_AGE_MS: '30000',
      IDENTITY_JWKS_COOLDOWN_MS: '1000',
      IDENTITY_JWKS_TIMEOUT_MS: '5000',
      IDENTITY_JWKS_URI: this.jwksUri,
      IDENTITY_JWT_ALGORITHMS: 'RS256',
      NODE_ENV: 'test',
    };
  }

  async sign(
    overrides: Record<string, unknown> = {},
    options: { attackerKey?: boolean } = {},
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'edupay-academico-api',
      exp: now + 600,
      iat: now,
      iss: this.issuer,
      jti: 'access-token-a',
      membership_id: 'membership-a',
      nbf: now,
      roles: ['TEACHER'],
      scope: ['academic:use'],
      sid: 'session-a',
      sub: 'identity-user-a',
      tenant_id: 'tenant-a',
      ...overrides,
    };

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: TEST_KEY_ID, typ: 'JWT' })
      .sign(options.attackerKey ? this.attackerPrivateKey : this.privateKey);
  }
}
