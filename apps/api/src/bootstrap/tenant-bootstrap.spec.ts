import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../persistence/prisma.service';
import {
  DEFAULT_TENANT_QUOTA_BYTES,
  TenantBootstrapConflictError,
  bootstrapAcademicTenant,
  parseTenantBootstrapArguments,
} from './tenant-bootstrap';

const tenantId = '11111111-1111-4111-8111-111111111111';

type Policy = {
  scopeKey: string;
  scopeType: 'GLOBAL' | 'TENANT';
  tenantId: string | null;
  quotaBytes: bigint;
};

type Account = {
  scopeKey: string;
  scopeType: 'GLOBAL' | 'TENANT';
  tenantId: string | null;
  usedBytes: bigint;
  reservedBytes: bigint;
  fileCount: number;
  blobCount: number;
  version: number;
};

function fakePrisma(): PrismaService {
  let tenant: { id: string } | undefined;
  const policies = new Map<string, Policy>();
  const accounts = new Map<string, Account>();
  const transaction = {
    tenant: {
      findUnique: async () => tenant,
      create: async ({ data }: { data: { id: string } }) => {
        tenant = { id: data.id };
        return tenant;
      },
    },
    storageQuotaPolicy: {
      findUnique: async ({ where }: { where: { scopeKey: string } }) =>
        policies.get(where.scopeKey),
      create: async ({
        data,
      }: {
        data: {
          scopeKey: string;
          scopeType: 'GLOBAL' | 'TENANT';
          tenantId?: string | null;
          quotaBytes: bigint;
        };
      }) => {
        const policy: Policy = {
          scopeKey: data.scopeKey,
          scopeType: data.scopeType,
          tenantId: data.tenantId ?? null,
          quotaBytes: data.quotaBytes,
        };
        policies.set(policy.scopeKey, policy);
        return policy;
      },
    },
    storageUsageAccount: {
      findUnique: async ({ where }: { where: { scopeKey: string } }) =>
        accounts.get(where.scopeKey),
      create: async ({
        data,
      }: {
        data: {
          scopeKey: string;
          scopeType: 'GLOBAL' | 'TENANT';
          tenantId?: string | null;
        };
      }) => {
        const account: Account = {
          scopeKey: data.scopeKey,
          scopeType: data.scopeType,
          tenantId: data.tenantId ?? null,
          usedBytes: 0n,
          reservedBytes: 0n,
          fileCount: 0,
          blobCount: 0,
          version: 1,
        };
        accounts.set(account.scopeKey, account);
        return account;
      },
    },
  };
  return {
    $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
}

describe('Academic tenant bootstrap', () => {
  it('requires a canonical UUID and applies the 20 GB pilot default', () => {
    expect(parseTenantBootstrapArguments(['--tenant-id', tenantId])).toMatchObject({
      tenantId,
      quotaBytes: DEFAULT_TENANT_QUOTA_BYTES,
    });
    expect(() => parseTenantBootstrapArguments(['--tenant-id', 'demo-tenant'])).toThrow(
      'canonical UUID',
    );
  });

  it('is idempotent and refuses an incompatible quota', async () => {
    const prisma = fakePrisma();
    const input = {
      tenantId,
      quotaBytes: DEFAULT_TENANT_QUOTA_BYTES,
      requestId: 'test-bootstrap',
    };

    await expect(bootstrapAcademicTenant(prisma, input)).resolves.toMatchObject({
      tenantCreated: true,
      tenantQuotaPolicyCreated: true,
      tenantUsageAccountCreated: true,
    });
    await expect(bootstrapAcademicTenant(prisma, input)).resolves.toMatchObject({
      tenantCreated: false,
      globalQuotaPolicyCreated: false,
      globalUsageAccountCreated: false,
      tenantQuotaPolicyCreated: false,
      tenantUsageAccountCreated: false,
    });
    await expect(
      bootstrapAcademicTenant(prisma, { ...input, quotaBytes: 10_000_000_000 }),
    ).rejects.toBeInstanceOf(TenantBootstrapConflictError);
  });
});
