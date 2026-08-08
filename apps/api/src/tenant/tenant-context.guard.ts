import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  SUPPORT_CONTEXT_POLICY,
  type SupportContextPolicy,
} from '../authorization/support-context.policy';
import { REQUIRES_TENANT_CONTEXT } from './tenant-context.constants';
import { TrustedTenantContext } from './trusted-tenant-context';

const TENANT_SELECTOR_KEYS = new Set(['tenantId', 'tenant_id']);
const MEMBERSHIP_SELECTOR_KEYS = new Set(['membershipId', 'membership_id']);

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SUPPORT_CONTEXT_POLICY)
    private readonly supportContextPolicy: SupportContextPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresTenantContext = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_TENANT_CONTEXT,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresTenantContext) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.principal) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    const tenantContext = await this.resolveTenantContext(request);
    this.rejectConflictingClientSelectors(request, tenantContext);
    request.tenantContext = tenantContext;
    return true;
  }

  private async resolveTenantContext(
    request: Request,
  ): Promise<TrustedTenantContext> {
    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    const hasTenantRole = principal.roles.some(
      (role) => role !== 'SYSTEM_ADMIN',
    );
    if (hasTenantRole) {
      return TrustedTenantContext.fromPrincipal(principal);
    }

    const supportContext =
      await this.supportContextPolicy.resolveApprovedContext({
        principal,
        requestId: request.requestId ?? 'unavailable',
      });
    if (!TrustedTenantContext.isTrusted(supportContext)) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }
    return supportContext;
  }

  private rejectConflictingClientSelectors(
    request: Request,
    context: TrustedTenantContext,
  ): void {
    const tenantSelectors: unknown[] = [
      request.header('x-tenant-id'),
      request.header('tenant-id'),
    ];
    const membershipSelectors: unknown[] = [
      request.header('x-membership-id'),
      request.header('membership-id'),
    ];

    this.collectSelectors(
      request.params,
      tenantSelectors,
      membershipSelectors,
      new WeakSet<object>(),
    );
    this.collectSelectors(
      request.query,
      tenantSelectors,
      membershipSelectors,
      new WeakSet<object>(),
    );
    this.collectSelectors(
      request.body,
      tenantSelectors,
      membershipSelectors,
      new WeakSet<object>(),
    );

    if (
      this.hasConflict(tenantSelectors, context.tenantId) ||
      this.hasConflict(membershipSelectors, context.membershipId)
    ) {
      throw new ForbiddenException(
        'The requested tenant context is not authorized.',
      );
    }
  }

  private collectSelectors(
    value: unknown,
    tenantSelectors: unknown[],
    membershipSelectors: unknown[],
    visited: WeakSet<object>,
  ): void {
    if (typeof value !== 'object' || value === null || visited.has(value)) {
      return;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectSelectors(
          item,
          tenantSelectors,
          membershipSelectors,
          visited,
        );
      }
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      if (TENANT_SELECTOR_KEYS.has(key)) {
        tenantSelectors.push(item);
      } else if (MEMBERSHIP_SELECTOR_KEYS.has(key)) {
        membershipSelectors.push(item);
      }
      this.collectSelectors(
        item,
        tenantSelectors,
        membershipSelectors,
        visited,
      );
    }
  }

  private hasConflict(values: unknown[], trustedValue: string): boolean {
    return values.some((value) => {
      if (value === undefined) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.some((item) => item !== trustedValue);
      }
      return value !== trustedValue;
    });
  }
}
