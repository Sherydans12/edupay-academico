import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const JSON_CONTENT_TYPE = /^application\/(?:[A-Za-z0-9!#$&^_.+-]+\+)?json\b/i;

export class IdentityInternalHttpResponseError extends Error {
  constructor(readonly status: number) {
    super('Identity verification was rejected.');
    this.name = 'IdentityInternalHttpResponseError';
  }
}

@Injectable()
export class IdentityInternalHttpClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config.get('IDENTITY_INTERNAL_BASE_URL', { infer: true });
    this.serviceToken = config.get('IDENTITY_INTERNAL_SERVICE_TOKEN', {
      infer: true,
    });
    this.timeoutMs = config.get('IDENTITY_INTERNAL_TIMEOUT_MS', {
      infer: true,
    });
  }

  get(path: string, correlationId: string): Promise<unknown> {
    return this.request('GET', path, correlationId);
  }

  post(path: string, correlationId: string, body: object): Promise<unknown> {
    return this.request('POST', path, correlationId, body);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    correlationId: string,
    body?: object,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        new URL(path, `${this.baseUrl}/`).toString(),
        {
          method,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.serviceToken}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
            'x-request-id': SAFE_CORRELATION_ID.test(correlationId)
              ? correlationId
              : 'unavailable',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: 'error',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new IdentityInternalHttpResponseError(response.status);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
        throw this.unavailable();
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (error instanceof IdentityInternalHttpResponseError) {
        throw error;
      }
      throw this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Identity verification is temporarily unavailable.',
    );
  }
}
