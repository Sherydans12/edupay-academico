import { describe, expect, it } from 'vitest';

import {
  parseSyncConfigurationArguments,
  SyncConfigurationUsageError,
} from './sync-configuration';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('parseSyncConfigurationArguments', () => {
  it('accepts an explicit safe tenant, source tenant, and AcademicYear mapping', () => {
    expect(
      parseSyncConfigurationArguments([
        '--tenant-id',
        TENANT_ID,
        '--source-tenant-id',
        'colegio-conquistadores',
        '--academic-year-id',
        ACADEMIC_YEAR_ID,
      ]),
    ).toEqual({
      tenantId: TENANT_ID,
      sourceTenantId: 'colegio-conquistadores',
      academicYearId: ACADEMIC_YEAR_ID,
      enabled: true,
    });
  });

  it('supports explicit disable and rejects ambiguous or unsafe arguments', () => {
    expect(
      parseSyncConfigurationArguments([
        '--tenant-id',
        TENANT_ID,
        '--source-tenant-id',
        'colegio-conquistadores',
        '--academic-year-id',
        ACADEMIC_YEAR_ID,
        '--disable',
      ]),
    ).toMatchObject({ enabled: false });
    expect(() =>
      parseSyncConfigurationArguments([
        '--tenant-id',
        TENANT_ID,
        '--source-tenant-id',
        'unsafe source tenant',
        '--academic-year-id',
        ACADEMIC_YEAR_ID,
      ]),
    ).toThrow(SyncConfigurationUsageError);
    expect(() =>
      parseSyncConfigurationArguments([
        '--tenant-id',
        TENANT_ID,
        '--source-tenant-id',
        'colegio-conquistadores',
        '--academic-year-id',
        ACADEMIC_YEAR_ID,
        '--enable',
        '--disable',
      ]),
    ).toThrow(SyncConfigurationUsageError);
  });
});
