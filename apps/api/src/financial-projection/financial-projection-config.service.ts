import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { Environment } from '../config/environment';

const credentialSchema = z
  .object({
    keyId: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/),
    token: z.string().min(32).max(512).regex(/^\S+$/),
    canonicalTenantId: z.string().uuid(),
  })
  .strict();

const credentialsSchema = z
  .array(credentialSchema)
  .max(200)
  .superRefine((credentials, context) => {
    const keyIds = new Set<string>();
    for (const [index, credential] of credentials.entries()) {
      if (keyIds.has(credential.keyId)) {
        context.addIssue({
          code: 'custom',
          message: 'keyId values must be unique during a credential rotation',
          path: [index, 'keyId'],
        });
      }
      keyIds.add(credential.keyId);
    }
  });

export type FinancialProjectionServiceCredential = z.infer<
  typeof credentialSchema
>;

@Injectable()
export class FinancialProjectionConfigService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  enabled(): boolean {
    return this.config.getOrThrow('ACADEMIC_FINANCIAL_PROJECTION_ENABLED');
  }

  requireInboundCredentials(): FinancialProjectionServiceCredential[] {
    if (!this.enabled()) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection is disabled.',
      );
    }
    const raw = this.config.getOrThrow(
      'ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS',
    );
    const parsed = this.parseCredentials(raw);
    if (parsed.length === 0) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection service authentication is not configured.',
      );
    }
    return parsed;
  }

  cursorSecret(): string {
    const secret = this.config.getOrThrow(
      'ACADEMIC_FINANCIAL_PROJECTION_CURSOR_SECRET',
    );
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection cursor protection is not configured.',
      );
    }
    return secret;
  }

  snapshotTtlMilliseconds(): number {
    return (
      this.config.getOrThrow(
        'ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_TTL_SECONDS',
      ) * 1_000
    );
  }

  publisherEnabled(): boolean {
    return this.config.getOrThrow(
      'ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED',
    );
  }

  publisherConfiguration(canonicalTenantId?: string): {
    readonly baseUrl: string;
    readonly keyId: string;
    readonly token: string;
    readonly timeoutMs: number;
    readonly maxAttempts: number;
    readonly retryScheduleSeconds: readonly number[];
  } {
    if (!this.publisherEnabled()) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection publisher is disabled.',
      );
    }
    const baseUrl = this.config.getOrThrow('BL_FINANCIAL_PROJECTION_BASE_URL');
    const keyId = this.config.getOrThrow(
      'BL_FINANCIAL_PROJECTION_SERVICE_KEY_ID',
    );
    const token = this.config.getOrThrow(
      'BL_FINANCIAL_PROJECTION_SERVICE_TOKEN',
    );
    if (!baseUrl || !keyId || !token) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection publisher is not configured.',
      );
    }
    const dedicated = canonicalTenantId
      ? this.parseCredentials(this.config.getOrThrow('ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS')).find((credential) => credential.canonicalTenantId === canonicalTenantId)
      : undefined;
    return {
      baseUrl,
      keyId: dedicated?.keyId ?? keyId,
      token: dedicated?.token ?? token,
      timeoutMs: this.config.getOrThrow('BL_FINANCIAL_PROJECTION_TIMEOUT_MS'),
      maxAttempts: this.config.getOrThrow(
        'BL_FINANCIAL_PROJECTION_MAX_ATTEMPTS',
      ),
      retryScheduleSeconds: this.config.getOrThrow(
        'BL_FINANCIAL_PROJECTION_RETRY_SCHEDULE_SECONDS',
      ),
    };
  }

  private parseCredentials(
    raw: string | undefined,
  ): FinancialProjectionServiceCredential[] {
    if (!raw) return [];
    try {
      return credentialsSchema.parse(JSON.parse(raw));
    } catch {
      throw new HttpException(
        'Academic Financial Projection service authentication is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
