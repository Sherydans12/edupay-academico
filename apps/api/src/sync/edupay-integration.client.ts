import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';

import type { Environment } from '../config/environment';
import {
  edupayFullCourseFeedSchema,
  edupayFullStudentFeedSchema,
  edupayIncrementalCourseFeedSchema,
  edupayIncrementalStudentFeedSchema,
  edupaySnapshotCompletionSchema,
  edupaySnapshotStartSchema,
  edupaySourceErrorSchema,
  type EduPayFullCourseFeed,
  type EduPayFullStudentFeed,
  type EduPayIncrementalCourseFeed,
  type EduPayIncrementalStudentFeed,
  type EduPaySnapshotCompletion,
  type EduPaySnapshotStart,
} from './edupay-source.contract';
import { EDUPAY_SCHEMA_VERSION } from './sync.constants';

const MAX_RESPONSE_BYTES = 2_000_000;

export class EduPayIntegrationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly sourceUnavailable: boolean,
    message = 'The EduPay integration request failed.',
  ) {
    super(message);
  }
}

export type EduPayFeedRequest = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly mode: 'incremental' | 'full';
  readonly snapshot?: string | undefined;
  readonly watermark?: string | undefined;
};

@Injectable()
export class EduPayIntegrationClient {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  createSnapshot(
    sourceTenantId: string,
    correlationId: string,
  ): Promise<EduPaySnapshotStart> {
    return this.get(
      '/api/v1/integrations/academico/snapshot',
      {},
      edupaySnapshotStartSchema,
      sourceTenantId,
      correlationId,
    );
  }

  completeSnapshot(
    sourceTenantId: string,
    correlationId: string,
    input: {
      snapshot: string;
      courseWatermark: string;
      studentWatermark: string;
    },
  ): Promise<EduPaySnapshotCompletion> {
    return this.get(
      '/api/v1/integrations/academico/snapshot/complete',
      input,
      edupaySnapshotCompletionSchema,
      sourceTenantId,
      correlationId,
    );
  }

  courseFeed(
    sourceTenantId: string,
    correlationId: string,
    request: EduPayFeedRequest,
  ): Promise<EduPayIncrementalCourseFeed | EduPayFullCourseFeed> {
    if (request.mode === 'full') {
      return this.get(
        '/api/v1/integrations/academico/courses',
        this.feedQuery(request),
        edupayFullCourseFeedSchema,
        sourceTenantId,
        correlationId,
      );
    }
    return this.get(
      '/api/v1/integrations/academico/courses',
      this.feedQuery(request),
      edupayIncrementalCourseFeedSchema,
      sourceTenantId,
      correlationId,
    );
  }

  studentFeed(
    sourceTenantId: string,
    correlationId: string,
    request: EduPayFeedRequest,
  ): Promise<EduPayIncrementalStudentFeed | EduPayFullStudentFeed> {
    if (request.mode === 'full') {
      return this.get(
        '/api/v1/integrations/academico/students',
        this.feedQuery(request),
        edupayFullStudentFeedSchema,
        sourceTenantId,
        correlationId,
      );
    }
    return this.get(
      '/api/v1/integrations/academico/students',
      this.feedQuery(request),
      edupayIncrementalStudentFeedSchema,
      sourceTenantId,
      correlationId,
    );
  }

  private feedQuery(request: EduPayFeedRequest): Record<string, string> {
    return {
      mode: request.mode,
      schemaVersion: EDUPAY_SCHEMA_VERSION,
      limit: String(
        request.limit ?? this.config.get('EDUPAY_SYNC_PAGE_SIZE', 100),
      ),
      ...(request.cursor ? { cursor: request.cursor } : {}),
      ...(request.watermark ? { watermark: request.watermark } : {}),
      ...(request.snapshot ? { snapshot: request.snapshot } : {}),
    };
  }

  private async get<T extends { sourceTenantId: string }>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    sourceTenantId: string,
    correlationId: string,
  ): Promise<T> {
    const baseUrl = this.config.getOrThrow('EDUPAY_INTEGRATION_BASE_URL');
    const url = new URL(path, `${baseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get('EDUPAY_INTEGRATION_TIMEOUT_MS', 5_000),
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.getOrThrow('EDUPAY_INTEGRATION_TOKEN')}`,
          'X-Correlation-ID': correlationId,
          'X-Source-Tenant-ID': sourceTenantId,
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      const timedOut = controller.signal.aborted;
      clearTimeout(timeout);
      throw new EduPayIntegrationError(
        timedOut ? 'SOURCE_TIMEOUT' : 'SOURCE_UNAVAILABLE',
        true,
        true,
      );
    }

    try {
      const declaredLength = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        throw new EduPayIntegrationError(
          'SOURCE_RESPONSE_TOO_LARGE',
          false,
          false,
        );
      }
      const body = await this.readBoundedBody(response);

      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        throw new EduPayIntegrationError(
          response.status >= 500
            ? 'SOURCE_UNAVAILABLE'
            : 'SOURCE_SCHEMA_INVALID',
          response.status >= 500,
          response.status >= 500,
        );
      }

      if (!response.ok) {
        const sourceError = edupaySourceErrorSchema.safeParse(payload);
        if (!sourceError.success) {
          if (response.status >= 500) {
            throw new EduPayIntegrationError('SOURCE_UNAVAILABLE', true, true);
          }
          throw new EduPayIntegrationError(
            'SOURCE_ERROR_SCHEMA_INVALID',
            false,
            false,
          );
        }
        const sourceConfigurationInvalid =
          sourceError.data.code === 'INTEGRATION_NOT_CONFIGURED';
        const retryable =
          response.status === 429 ||
          (response.status >= 500 && !sourceConfigurationInvalid);
        throw new EduPayIntegrationError(
          sourceError.data.code,
          retryable,
          response.status >= 500 && !sourceConfigurationInvalid,
        );
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success || parsed.data.sourceTenantId !== sourceTenantId) {
        throw new EduPayIntegrationError(
          parsed.success ? 'SOURCE_TENANT_MISMATCH' : 'SOURCE_SCHEMA_INVALID',
          false,
          false,
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof EduPayIntegrationError) throw error;
      throw new EduPayIntegrationError(
        controller.signal.aborted ? 'SOURCE_TIMEOUT' : 'SOURCE_UNAVAILABLE',
        true,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readBoundedBody(response: Response): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new EduPayIntegrationError(
            'SOURCE_RESPONSE_TOO_LARGE',
            false,
            false,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
