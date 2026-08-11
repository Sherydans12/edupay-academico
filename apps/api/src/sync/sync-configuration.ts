import { randomUUID } from 'node:crypto';

import type { PrismaService } from '../persistence/prisma.service';
import { EDUPAY_SOURCE } from './sync.constants';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_TENANT_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export const SYNC_CONFIGURE_USAGE =
  'Usage: pnpm sync:configure -- --tenant-id <canonical-uuid> --source-tenant-id <source-tenant> --academic-year-id <uuid> [--disable]';

export type SyncConfigurationInput = {
  readonly academicYearId: string;
  readonly enabled: boolean;
  readonly sourceTenantId: string;
  readonly tenantId: string;
};

export class SyncConfigurationConflictError extends Error {}
export class SyncConfigurationUsageError extends Error {}

export function parseSyncConfigurationArguments(
  args: readonly string[],
): SyncConfigurationInput | { readonly help: true } {
  let tenantId: string | undefined;
  let sourceTenantId: string | undefined;
  let academicYearId: string | undefined;
  let enabled = true;
  let enabledSpecified = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--disable' || argument === '--enable') {
      if (enabledSpecified) {
        throw new SyncConfigurationUsageError(
          'Specify at most one of --enable and --disable.',
        );
      }
      enabled = argument === '--enable';
      enabledSpecified = true;
      continue;
    }
    if (
      argument !== '--tenant-id' &&
      argument !== '--source-tenant-id' &&
      argument !== '--academic-year-id'
    ) {
      throw new SyncConfigurationUsageError(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new SyncConfigurationUsageError(`Missing value for ${argument}.`);
    }
    index += 1;
    if (argument === '--tenant-id') {
      if (tenantId) {
        throw new SyncConfigurationUsageError('Specify --tenant-id once.');
      }
      tenantId = value.toLowerCase();
    } else if (argument === '--source-tenant-id') {
      if (sourceTenantId) {
        throw new SyncConfigurationUsageError(
          'Specify --source-tenant-id once.',
        );
      }
      sourceTenantId = value;
    } else {
      if (academicYearId) {
        throw new SyncConfigurationUsageError(
          'Specify --academic-year-id once.',
        );
      }
      academicYearId = value.toLowerCase();
    }
  }

  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    throw new SyncConfigurationUsageError(
      '--tenant-id must be a canonical UUID.',
    );
  }
  if (!sourceTenantId || !SOURCE_TENANT_PATTERN.test(sourceTenantId)) {
    throw new SyncConfigurationUsageError(
      '--source-tenant-id must be a safe source tenant identifier.',
    );
  }
  if (!academicYearId || !UUID_PATTERN.test(academicYearId)) {
    throw new SyncConfigurationUsageError('--academic-year-id must be a UUID.');
  }
  return { tenantId, sourceTenantId, academicYearId, enabled };
}

export async function configureEduPaySync(
  prisma: PrismaService,
  input: SyncConfigurationInput,
): Promise<{
  readonly academicYearId: string;
  readonly created: boolean;
  readonly enabled: boolean;
  readonly source: typeof EDUPAY_SOURCE;
  readonly sourceTenantId: string;
  readonly tenantId: string;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new SyncConfigurationConflictError(
      'The canonical Académico tenant does not exist.',
    );
  }
  const academicYear = await prisma.academicYear.findUnique({
    where: {
      tenantId_id: {
        tenantId: input.tenantId,
        id: input.academicYearId,
      },
    },
    select: { id: true, status: true },
  });
  if (!academicYear) {
    throw new SyncConfigurationConflictError(
      'The AcademicYear does not exist in the requested tenant.',
    );
  }
  if (input.enabled && academicYear.status !== 'ACTIVE') {
    throw new SyncConfigurationConflictError(
      'The configured AcademicYear must be ACTIVE.',
    );
  }

  const [byTenant, bySourceTenant] = await Promise.all([
    prisma.syncConfiguration.findUnique({
      where: {
        tenantId_source: { tenantId: input.tenantId, source: EDUPAY_SOURCE },
      },
    }),
    prisma.syncConfiguration.findUnique({
      where: {
        source_sourceTenantId: {
          source: EDUPAY_SOURCE,
          sourceTenantId: input.sourceTenantId,
        },
      },
    }),
  ]);
  if (
    bySourceTenant &&
    (bySourceTenant.tenantId !== input.tenantId ||
      bySourceTenant.academicYearId !== input.academicYearId)
  ) {
    throw new SyncConfigurationConflictError(
      'The EduPay source tenant is already mapped incompatibly.',
    );
  }
  if (
    byTenant &&
    (byTenant.sourceTenantId !== input.sourceTenantId ||
      byTenant.academicYearId !== input.academicYearId)
  ) {
    throw new SyncConfigurationConflictError(
      'The Académico tenant already has an incompatible EduPay mapping.',
    );
  }

  const now = new Date();
  const existing = byTenant ?? bySourceTenant;
  if (existing) {
    await prisma.syncConfiguration.update({
      where: {
        tenantId_id: { tenantId: existing.tenantId, id: existing.id },
      },
      data: {
        enabled: input.enabled,
        ...(input.enabled && !existing.enabled
          ? { nextIncrementalAt: now, nextFullAt: now }
          : {}),
      },
    });
  } else {
    await prisma.syncConfiguration.create({
      data: {
        id: randomUUID(),
        tenantId: input.tenantId,
        source: EDUPAY_SOURCE,
        sourceTenantId: input.sourceTenantId,
        academicYearId: input.academicYearId,
        enabled: input.enabled,
      },
    });
  }
  return {
    academicYearId: input.academicYearId,
    created: !existing,
    enabled: input.enabled,
    source: EDUPAY_SOURCE,
    sourceTenantId: input.sourceTenantId,
    tenantId: input.tenantId,
  };
}
