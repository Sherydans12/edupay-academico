import {
  createParamDecorator,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import { TrustedTenantContext } from './trusted-tenant-context';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TrustedIdentityPrincipal => {
    const principal = context.switchToHttp().getRequest<Request>().principal;
    if (!principal) {
      throw new UnauthorizedException('A valid access token is required.');
    }
    return principal;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TrustedTenantContext => {
    const tenantContext = context
      .switchToHttp()
      .getRequest<Request>().tenantContext;
    if (!TrustedTenantContext.isTrusted(tenantContext)) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }
    return tenantContext;
  },
);
