import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import { REQUIRED_CAPABILITIES } from './authorization.constants';
import { AuthorizationService } from './authorization.service';
import type { TenantCapability } from './authorization.types';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const capabilities = this.reflector.getAllAndOverride<
      readonly TenantCapability[]
    >(REQUIRED_CAPABILITIES, [context.getHandler(), context.getClass()]);
    if (!capabilities) {
      return true;
    }
    if (capabilities.length === 0) {
      throw new ForbiddenException('The requested action is not authorized.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (
      !request.principal ||
      !TrustedTenantContext.isTrusted(request.tenantContext)
    ) {
      throw new ForbiddenException('The requested action is not authorized.');
    }

    for (const capability of capabilities) {
      this.authorization.requireCapability(
        request.principal,
        request.tenantContext,
        capability,
      );
    }
    return true;
  }
}
