import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AcademicRequestContext } from '../academic/academic-context';
import { CurrentIdentityStatusService } from '../identity/current-identity-status.service';
import { PrismaService } from '../persistence/prisma.service';
import { DieIdentityMembershipVerifier } from './die-identity-membership.verifier';

export type DieAccess = {
  readonly isTenantAdmin: boolean;
  readonly member: {
    readonly id: string;
    readonly role: 'MEMBER' | 'COORDINATOR';
    readonly displayLabelSnapshot: string;
    readonly identityUserId: string;
    readonly identityMembershipId: string;
  } | null;
};

@Injectable()
export class DieAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityStatus: CurrentIdentityStatusService,
    private readonly identityMemberships: DieIdentityMembershipVerifier,
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
        identityMembershipId: context.tenant.membershipId,
        removedAt: null,
      },
      select: {
        id: true,
        role: true,
        displayLabelSnapshot: true,
        identityUserId: true,
        identityMembershipId: true,
      },
    });
    if (member) {
      const verified = await this.identityMemberships.verify(context, member.identityUserId);
      const eligible =
        verified.membershipId === member.identityMembershipId &&
        !verified.roles.some((role) => role === 'STUDENT' || role === 'GUARDIAN') &&
        verified.roles.some((role) => ['STAFF', 'TEACHER', 'TENANT_ADMIN'].includes(role));
      if (!eligible) this.deny();
    }
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
