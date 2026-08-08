import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { TrustedIdentityPrincipal } from './identity.types';
import {
  IDENTITY_SESSION_STATUS_ADAPTER,
  type IdentitySessionStatusAdapter,
} from './identity-adapter.port';
import type { TrustedTenantContext } from '../tenant/trusted-tenant-context';

@Injectable()
export class CurrentIdentityStatusService {
  constructor(
    @Inject(IDENTITY_SESSION_STATUS_ADAPTER)
    private readonly adapter: IdentitySessionStatusAdapter,
  ) {}

  async requireCurrentActiveContext(
    principal: TrustedIdentityPrincipal,
    tenant: TrustedTenantContext,
    correlationId: string,
  ): Promise<void> {
    const status = await this.adapter.checkSessionStatus({
      correlationId,
      identityUserId: principal.identityUserId,
      membershipId: tenant.membershipId,
      sessionId: principal.sessionId,
      tenantId: tenant.tenantId,
    });

    if (
      !status.active ||
      !status.sessionActive ||
      !status.membershipActive ||
      status.identityUserId !== principal.identityUserId ||
      status.sessionId !== principal.sessionId ||
      status.tenantId !== tenant.tenantId ||
      status.membershipId !== tenant.membershipId
    ) {
      throw new ForbiddenException(
        'The current Identity context is not authorized.',
      );
    }
  }
}
