import { randomUUID } from 'node:crypto';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../persistence/prisma.service';
import {
  COLEGIO_CONQUISTADORES_QUOTA_BYTES,
  GLOBAL_QUOTA_BYTES,
} from '../storage/file-validation';

const GLOBAL_SCOPE_KEY = 'GLOBAL';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const TENANT_BOOTSTRAP_USAGE =
  'Usage: pnpm bootstrap:tenant -- --tenant-id <canonical-tenant-uuid> [--quota-bytes <positive-integer>] [--request-id <operator-request-id>]';

export const DEFAULT_TENANT_QUOTA_BYTES = COLEGIO_CONQUISTADORES_QUOTA_BYTES;

export type TenantBootstrapInput = {
  readonly tenantId: string;
  readonly quotaBytes: number;
  readonly requestId: string;
};

export type TenantBootstrapResult = {
  readonly tenantId: string;
  readonly quotaBytes: number;
  readonly tenantCreated: boolean;
  readonly globalQuotaPolicyCreated: boolean;
  readonly globalUsageAccountCreated: boolean;
  readonly tenantQuotaPolicyCreated: boolean;
  readonly tenantUsageAccountCreated: boolean;
};

export class TenantBootstrapConflictError extends Error {}

export class TenantBootstrapUsageError extends Error {}

export function parseTenantBootstrapArguments(
  args: readonly string[],
): TenantBootstrapInput | { readonly help: true } {
  let tenantId: string | undefined;
  let quotaBytes = DEFAULT_TENANT_QUOTA_BYTES;
  let quotaBytesSpecified = false;
  let requestId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      return { help: true };
    }
    if (
      argument !== '--tenant-id' &&
      argument !== '--quota-bytes' &&
      argument !== '--request-id'
    ) {
      throw new TenantBootstrapUsageError(`Unknown option: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new TenantBootstrapUsageError(`Missing value for ${argument}.`);
    }
    index += 1;

    if (argument === '--tenant-id') {
      if (tenantId) throw new TenantBootstrapUsageError('Specify --tenant-id once.');
      if (!UUID_PATTERN.test(value)) {
        throw new TenantBootstrapUsageError('--tenant-id must be a canonical UUID.');
      }
      tenantId = value.toLowerCase();
      continue;
    }

    if (argument === '--quota-bytes') {
      if (quotaBytesSpecified) {
        throw new TenantBootstrapUsageError('Specify --quota-bytes once.');
      }
      if (!/^\d+$/.test(value)) {
        throw new TenantBootstrapUsageError('--quota-bytes must be a positive integer.');
      }
      const parsed = Number(value);
      if (
        !Number.isSafeInteger(parsed) ||
        parsed <= 0 ||
        parsed > GLOBAL_QUOTA_BYTES
      ) {
        throw new TenantBootstrapUsageError(
          `--quota-bytes must be between 1 and ${GLOBAL_QUOTA_BYTES}.`,
        );
      }
      quotaBytes = parsed;
      quotaBytesSpecified = true;
      continue;
    }

    if (requestId) throw new TenantBootstrapUsageError('Specify --request-id once.');
    if (!SAFE_REQUEST_ID_PATTERN.test(value)) {
      throw new TenantBootstrapUsageError(
        '--request-id must contain only letters, numbers, dot, underscore, colon, or hyphen.',
      );
    }
    requestId = value;
  }

  if (!tenantId) {
    throw new TenantBootstrapUsageError('--tenant-id is required.');
  }

  return {
    tenantId,
    quotaBytes,
    requestId: requestId ?? `academic-tenant-bootstrap:${randomUUID()}`,
  };
}

type BootstrapTransaction = Prisma.TransactionClient;

type ScopeIdentity = {
  readonly scopeKey: string;
  readonly scopeType: 'GLOBAL' | 'TENANT';
  readonly tenantId: string | null;
};

function assertPolicyCompatible(
  policy: {
    readonly scopeKey: string;
    readonly scopeType: string;
    readonly tenantId: string | null;
    readonly quotaBytes: bigint;
  },
  expected: ScopeIdentity & { readonly quotaBytes: bigint },
): void {
  if (
    policy.scopeKey !== expected.scopeKey ||
    policy.scopeType !== expected.scopeType ||
    policy.tenantId !== expected.tenantId ||
    policy.quotaBytes !== expected.quotaBytes
  ) {
    throw new TenantBootstrapConflictError(
      `Existing storage quota policy "${expected.scopeKey}" is incompatible with the requested bootstrap state.`,
    );
  }
}

function assertUsageAccountCompatible(
  account: {
    readonly scopeKey: string;
    readonly scopeType: string;
    readonly tenantId: string | null;
    readonly usedBytes: bigint;
    readonly reservedBytes: bigint;
    readonly fileCount: number;
    readonly blobCount: number;
    readonly version: number;
  },
  expected: ScopeIdentity,
): void {
  if (
    account.scopeKey !== expected.scopeKey ||
    account.scopeType !== expected.scopeType ||
    account.tenantId !== expected.tenantId ||
    account.usedBytes < 0n ||
    account.reservedBytes < 0n ||
    account.fileCount < 0 ||
    account.blobCount < 0 ||
    account.version < 1
  ) {
    throw new TenantBootstrapConflictError(
      `Existing storage usage account "${expected.scopeKey}" is incompatible with the requested bootstrap state.`,
    );
  }
}

async function ensureQuotaPolicy(
  tx: BootstrapTransaction,
  expected: ScopeIdentity & { readonly quotaBytes: bigint },
): Promise<boolean> {
  const existing = await tx.storageQuotaPolicy.findUnique({
    where: { scopeKey: expected.scopeKey },
  });
  if (existing) {
    assertPolicyCompatible(existing, expected);
    return false;
  }

  await tx.storageQuotaPolicy.create({
    data: {
      scopeKey: expected.scopeKey,
      scopeType: expected.scopeType,
      tenantId: expected.tenantId,
      quotaBytes: expected.quotaBytes,
      auditReason: 'Initial operator tenant bootstrap',
    },
  });
  return true;
}

async function ensureUsageAccount(
  tx: BootstrapTransaction,
  expected: ScopeIdentity,
): Promise<boolean> {
  const existing = await tx.storageUsageAccount.findUnique({
    where: { scopeKey: expected.scopeKey },
  });
  if (existing) {
    assertUsageAccountCompatible(existing, expected);
    return false;
  }

  await tx.storageUsageAccount.create({
    data: {
      scopeKey: expected.scopeKey,
      scopeType: expected.scopeType,
      tenantId: expected.tenantId,
    },
  });
  return true;
}

export async function bootstrapAcademicTenant(
  prisma: PrismaService,
  input: TenantBootstrapInput,
): Promise<TenantBootstrapResult> {
  const tenantScopeKey = `TENANT:${input.tenantId}`;

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    const tenantCreated = !tenant;
    if (!tenant) {
      await tx.tenant.create({ data: { id: input.tenantId } });
    }

    const globalQuotaPolicyCreated = await ensureQuotaPolicy(tx, {
      scopeKey: GLOBAL_SCOPE_KEY,
      scopeType: 'GLOBAL',
      tenantId: null,
      quotaBytes: BigInt(GLOBAL_QUOTA_BYTES),
    });
    const globalUsageAccountCreated = await ensureUsageAccount(tx, {
      scopeKey: GLOBAL_SCOPE_KEY,
      scopeType: 'GLOBAL',
      tenantId: null,
    });
    const tenantQuotaPolicyCreated = await ensureQuotaPolicy(tx, {
      scopeKey: tenantScopeKey,
      scopeType: 'TENANT',
      tenantId: input.tenantId,
      quotaBytes: BigInt(input.quotaBytes),
    });
    const tenantUsageAccountCreated = await ensureUsageAccount(tx, {
      scopeKey: tenantScopeKey,
      scopeType: 'TENANT',
      tenantId: input.tenantId,
    });

    return {
      tenantId: input.tenantId,
      quotaBytes: input.quotaBytes,
      tenantCreated,
      globalQuotaPolicyCreated,
      globalUsageAccountCreated,
      tenantQuotaPolicyCreated,
      tenantUsageAccountCreated,
    };
  });
}
