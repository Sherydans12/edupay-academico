import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import { TrustedTenantContext } from './trusted-tenant-context';

@Injectable({ scope: Scope.REQUEST })
export class CurrentRequestContext {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  principal(): TrustedIdentityPrincipal {
    if (!this.request.principal) {
      throw new UnauthorizedException('A valid access token is required.');
    }
    return this.request.principal;
  }

  tenant(): TrustedTenantContext {
    if (!TrustedTenantContext.isTrusted(this.request.tenantContext)) {
      throw new ForbiddenException('Trusted tenant context is required.');
    }
    return this.request.tenantContext;
  }

  requestId(): string {
    return this.request.requestId ?? 'unavailable';
  }
}
