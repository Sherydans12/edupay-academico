import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { FinancialProjectionConfigService } from './financial-projection-config.service';

export interface FinancialProjectionPrincipal {
  readonly service: 'BL_SHADOW';
  readonly keyId: string;
  readonly canonicalTenantId: string;
}

export type FinancialProjectionRequest = Request & {
  financialProjectionPrincipal?: FinancialProjectionPrincipal;
};

@Injectable()
export class FinancialProjectionServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(
    FinancialProjectionServiceAuthGuard.name,
  );

  constructor(private readonly config: FinancialProjectionConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<FinancialProjectionRequest>();
    const keyId = request.header('x-edupay-service-key-id')?.trim();
    const service = request.header('x-edupay-service')?.trim();
    const token = this.bearer(request.header('authorization'));
    const credential = this.config
      .requireInboundCredentials()
      .find((candidate) => candidate.keyId === keyId);

    if (
      service !== 'BL_SHADOW' ||
      !credential ||
      !token ||
      !this.matches(token, credential.token)
    ) {
      this.logger.warn({
        action: 'FINANCIAL_PROJECTION_S2S_REJECTED',
        service: service ?? null,
        keyId: keyId ?? null,
        requestId: request.requestId ?? null,
      });
      throw new UnauthorizedException(
        'A registered Academic Financial Projection service credential is required.',
      );
    }

    request.financialProjectionPrincipal = {
      service: 'BL_SHADOW',
      keyId: credential.keyId,
      canonicalTenantId: credential.canonicalTenantId,
    };
    this.logger.log({
      action: 'FINANCIAL_PROJECTION_S2S_AUTHENTICATED',
      service: 'BL_SHADOW',
      keyId: credential.keyId,
      canonicalTenantId: credential.canonicalTenantId,
      requestId: request.requestId ?? null,
    });
    return true;
  }

  private bearer(authorization: string | undefined): string | null {
    return authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? null;
  }

  private matches(received: string, configured: string): boolean {
    const left = createHash('sha256').update(received).digest();
    const right = createHash('sha256').update(configured).digest();
    return timingSafeEqual(left, right);
  }
}
