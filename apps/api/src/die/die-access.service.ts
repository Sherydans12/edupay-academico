import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AcademicRequestContext } from '../academic/academic-context';
import { CurrentIdentityStatusService } from '../identity/current-identity-status.service';
import { PrismaService } from '../persistence/prisma.service';

export type DieAccess = {
  readonly isTenantAdmin: boolean;
  readonly member: {
    readonly id: string;
    readonly role: 'MEMBER' | 'COORDINATOR';
  } | null;
};

@Injectable()
export class DieAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityStatus: CurrentIdentityStatusService,
  ) {}

  async require(context: AcademicRequestContext): Promise<DieAccess> {
    await this.identityStatus.requireCurrentActiveContext(
      context.principal,
      context.tenant,
      context.requestId,
    );
    const isTenantAdmin = context.principal.roles.includes('TENANT_ADMIN');
    const member = await this.prisma.dieMemberAssignment.findFirst({
      where: {
        tenantId: context.tenant.tenantId,
        identityUserId: context.principal.identityUserId,
        removedAt: null,
      },
      select: { id: true, role: true },
    });
    if (!isTenantAdmin && !member) this.deny();
    return { isTenantAdmin, member };
  }

  requireCoordinator(access: DieAccess): void {
    if (!access.isTenantAdmin && access.member?.role !== 'COORDINATOR') {
      this.deny();
    }
  }

  requireTenantAdmin(access: DieAccess): void {
    if (!access.isTenantAdmin) this.deny();
  }

  private deny(): never {
    throw new ForbiddenException('The requested action is not authorized.');
  }
}
