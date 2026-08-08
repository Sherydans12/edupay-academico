import { ForbiddenException } from '@nestjs/common';

import { TrustedTenantContext } from '../tenant/trusted-tenant-context';

/** Runtime-validated scope consumed by future Prisma repository adapters. */
export class TenantQueryScope {
  readonly tenantId: string;

  private constructor(context: TrustedTenantContext) {
    this.tenantId = context.tenantId;
    Object.freeze(this);
  }

  static fromTrustedContext(context: TrustedTenantContext): TenantQueryScope {
    if (!TrustedTenantContext.isTrusted(context)) {
      throw new ForbiddenException('Trusted tenant query scope is required.');
    }
    return new TenantQueryScope(context);
  }
}

export interface TenantScopedRepository<TEntity, TIdentifier = string> {
  findById(
    scope: TenantQueryScope,
    identifier: TIdentifier,
  ): Promise<TEntity | null>;
}
