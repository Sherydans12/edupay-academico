import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import { CurrentIdentityStatusService } from './current-identity-status.service';
import { REQUIRES_CURRENT_IDENTITY_STATUS } from './high-risk-identity.constants';

@Injectable()
export class CurrentIdentityStatusGuard implements CanActivate {
  constructor(
    private readonly currentStatus: CurrentIdentityStatusService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresStatus = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_CURRENT_IDENTITY_STATUS,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresStatus) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (
      !request.principal ||
      !TrustedTenantContext.isTrusted(request.tenantContext)
    ) {
      throw new ForbiddenException('The requested action is not authorized.');
    }

    await this.currentStatus.requireCurrentActiveContext(
      request.principal,
      request.tenantContext,
      request.requestId ?? 'unavailable',
    );
    return true;
  }
}
