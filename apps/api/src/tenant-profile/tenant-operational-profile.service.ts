import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { UpdateTenantOperationalProfile } from '@edupay/contracts';

import type { AcademicRequestContext } from '../academic/academic-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class TenantOperationalProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(context: AcademicRequestContext) {
    const row = await this.prisma.tenantOperationalProfile.findUnique({
      where: { tenantId: context.tenant.tenantId },
    });
    return this.view(row);
  }

  async update(
    context: AcademicRequestContext,
    input: UpdateTenantOperationalProfile,
  ) {
    const institutionDisplayName =
      input.institutionDisplayName === undefined
        ? undefined
        : input.institutionDisplayName;
    const timeZone =
      input.timeZone === undefined
        ? undefined
        : input.timeZone === null
          ? null
          : this.canonicalTimeZone(input.timeZone);
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.tenantOperationalProfile.findUnique({
            where: { tenantId: context.tenant.tenantId },
          });
          const currentVersion = current?.version ?? 0;
          if (currentVersion !== input.expectedVersion) {
            throw new ConflictException(
              'The tenant operational profile changed. Reload it before saving.',
            );
          }
          const nextVersion = currentVersion + 1;
          const values = {
            institutionDisplayName:
              institutionDisplayName === undefined
                ? (current?.institutionDisplayName ?? null)
                : institutionDisplayName,
            timeZone:
              timeZone === undefined ? (current?.timeZone ?? null) : timeZone,
          };
          const saved = current
            ? await tx.tenantOperationalProfile.update({
                where: { tenantId: context.tenant.tenantId },
                data: {
                  ...values,
                  version: nextVersion,
                  updatedByIdentityUserId: context.principal.identityUserId,
                },
              })
            : await tx.tenantOperationalProfile.create({
                data: {
                  tenantId: context.tenant.tenantId,
                  ...values,
                  version: nextVersion,
                  updatedByIdentityUserId: context.principal.identityUserId,
                },
              });
          await tx.tenantOperationalProfileRevision.create({
            data: {
              tenantId: context.tenant.tenantId,
              version: nextVersion,
              ...values,
              actorIdentityUserId: context.principal.identityUserId,
              actorMembershipId: context.tenant.membershipId,
              requestId: context.requestId,
            },
          });
          return saved;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.view(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        throw new ConflictException(
          'The tenant operational profile changed. Reload it before saving.',
        );
      }
      throw error;
    }
  }

  async configuredTimeZone(tenantId: string): Promise<string | null> {
    const row = await this.prisma.tenantOperationalProfile.findUnique({
      where: { tenantId },
      select: { timeZone: true },
    });
    return row?.timeZone ?? null;
  }

  async requireTimeZone(tenantId: string): Promise<string> {
    const timeZone = await this.configuredTimeZone(tenantId);
    if (!timeZone) {
      throw new ConflictException({
        code: 'TENANT_TIME_ZONE_REQUIRED',
        message:
          'Configure the tenant time zone before recording a fact with a time.',
      });
    }
    return timeZone;
  }

  async today(tenantId: string): Promise<string | null> {
    const timeZone = await this.configuredTimeZone(tenantId);
    if (!timeZone) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private canonicalTimeZone(value: string): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: value,
      }).resolvedOptions().timeZone;
    } catch {
      throw new BadRequestException('A valid IANA time zone is required.');
    }
  }

  private view(
    row: {
      institutionDisplayName: string | null;
      timeZone: string | null;
      version: number;
      updatedAt: Date;
    } | null,
  ) {
    const institutionDisplayName = row?.institutionDisplayName ?? null;
    const timeZone = row?.timeZone ?? null;
    const missingFields = [
      ...(!institutionDisplayName ? (['institutionDisplayName'] as const) : []),
      ...(!timeZone ? (['timeZone'] as const) : []),
    ];
    return {
      institutionDisplayName,
      timeZone,
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      complete: missingFields.length === 0,
      missingFields,
    };
  }
}
