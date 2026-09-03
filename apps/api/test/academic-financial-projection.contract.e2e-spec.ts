import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import {
  academicFinancialProjectionEnrollmentSchema,
  academicFinancialProjectionEventSchema,
  academicFinancialProjectionSnapshotPageSchema,
  academicFinancialProjectionSnapshotQuerySchema,
  type AcademicFinancialProjectionEnrollment,
} from '@edupay/contracts';

import { configureApplication } from '../src/bootstrap/configure-application';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';
import { FinancialProjectionContractFixture } from './support/financial-projection-contract.fixture';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-09-03T12:00:00.000Z';

const enrollment = (
  overrides: Partial<AcademicFinancialProjectionEnrollment> = {},
): AcademicFinancialProjectionEnrollment =>
  academicFinancialProjectionEnrollmentSchema.parse({
    canonicalTenantId: tenantA,
    academicYearId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    academicStudentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    academicCourseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    academicEnrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    enrollmentStatus: 'ACTIVE',
    effectiveFrom: '2026-03-01T00:00:00.000Z',
    effectiveTo: null,
    version: 1,
    updatedAt: timestamp,
    operation: 'UPSERT',
    ...overrides,
  });

describe('Academic Financial Projection contract', () => {
  const records = [
    enrollment({
      academicEnrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
      academicStudentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12',
      academicCourseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
      academicYearId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14',
    }),
    enrollment({
      academicEnrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',
      academicStudentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12',
      academicCourseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23',
      academicYearId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24',
      effectiveFrom: '2027-03-01T00:00:00.000Z',
    }),
    enrollment({
      academicEnrollmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',
      academicStudentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32',
      academicCourseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
      enrollmentStatus: 'INACTIVE',
      effectiveTo: '2026-06-01T00:00:00.000Z',
      version: 2,
      operation: 'TOMBSTONE',
    }),
    enrollment({
      canonicalTenantId: tenantB,
      academicEnrollmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11',
      academicStudentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb12',
      academicCourseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb13',
      academicYearId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb14',
    }),
  ];

  it('makes a student without Identity valid and rejects PII outside the projection', () => {
    const parsed = enrollment();
    expect(parsed).not.toHaveProperty('identityUserId');
    expect(parsed).not.toHaveProperty('firstName');
    expect(() =>
      academicFinancialProjectionEnrollmentSchema.parse({
        ...parsed,
        firstName: 'No permitido',
      }),
    ).toThrow();
    expect(() =>
      academicFinancialProjectionSnapshotQuerySchema.parse({
        canonicalTenantId: tenantB,
      }),
    ).toThrow();
  });

  it('keeps two tenants isolated, reconstructs a complete snapshot and exposes only its terminal watermark', () => {
    const fixture = new FinancialProjectionContractFixture(records);
    const started = fixture.start(tenantA);
    const first = fixture.page({
      authorizedCanonicalTenantId: tenantA,
      snapshotToken: started.snapshotToken,
      limit: 2,
    });
    const nextCursor = first.page.nextCursor;
    if (!nextCursor) throw new Error('Expected a next cursor in the fixture.');
    const second = fixture.page({
      authorizedCanonicalTenantId: tenantA,
      snapshotToken: started.snapshotToken,
      cursor: nextCursor,
      limit: 2,
    });

    expect(first.watermark.available).toBe(false);
    expect(second.watermark.available).toBe(true);
    expect([...first.items, ...second.items]).toHaveLength(3);
    expect(
      [...first.items, ...second.items].every(
        (item) => item.canonicalTenantId === tenantA,
      ),
    ).toBe(true);
    expect(
      fixture.complete({
        authorizedCanonicalTenantId: tenantA,
        snapshotToken: started.snapshotToken,
      }).watermark,
    ).toBe(second.watermark.value);
    expect(() =>
      fixture.page({
        authorizedCanonicalTenantId: tenantB,
        snapshotToken: started.snapshotToken,
        limit: 2,
      }),
    ).toThrow('INTEGRATION_TENANT_FORBIDDEN');
  });

  it('rejects altered or cross-snapshot cursors and cross-tenant rows in a page', () => {
    const fixture = new FinancialProjectionContractFixture(records);
    const snapshotA = fixture.start(tenantA);
    const firstA = fixture.page({
      authorizedCanonicalTenantId: tenantA,
      snapshotToken: snapshotA.snapshotToken,
      limit: 1,
    });
    const cursorA = firstA.page.nextCursor;
    if (!cursorA) throw new Error('Expected a next cursor in the fixture.');
    const snapshotB = fixture.start(tenantB);

    expect(() =>
      fixture.page({
        authorizedCanonicalTenantId: tenantA,
        snapshotToken: snapshotA.snapshotToken,
        cursor: 'altered',
        limit: 1,
      }),
    ).toThrow('INVALID_CURSOR');
    expect(() =>
      fixture.page({
        authorizedCanonicalTenantId: tenantB,
        snapshotToken: snapshotB.snapshotToken,
        cursor: cursorA,
        limit: 1,
      }),
    ).toThrow('INVALID_CURSOR');
    expect(() =>
      academicFinancialProjectionSnapshotPageSchema.parse({
        ...firstA,
        items: [records[3]!],
        page: { ...firstA.page, itemCount: 1 },
      }),
    ).toThrow();
  });

  it('models tombstones and gives consumers deterministic duplicate and out-of-order handling', () => {
    const fixture = new FinancialProjectionContractFixture(records);
    const versionEight = academicFinancialProjectionEventSchema.parse({
      eventId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc8',
      eventType: 'academic.financial-projection.enrollment.upserted.v1',
      schemaVersion: '1',
      canonicalTenantId: tenantA,
      aggregateType: 'ACADEMIC_ENROLLMENT',
      aggregateId: records[0]!.academicEnrollmentId,
      entityVersion: 8,
      occurredAt: timestamp,
      correlationId: 'contract-test-8',
      payload: { ...records[0]!, version: 8 },
    });
    const versionSeven = academicFinancialProjectionEventSchema.parse({
      ...versionEight,
      eventId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      entityVersion: 7,
      correlationId: 'contract-test-7',
      payload: { ...records[0]!, version: 7 },
    });

    expect(fixture.apply(versionEight)).toBe('APPLIED');
    expect(fixture.apply(versionEight)).toBe('DUPLICATE');
    expect(fixture.apply(versionSeven)).toBe('STALE');
    expect(records[2]!.operation).toBe('TOMBSTONE');
    expect(records[2]!.effectiveTo).not.toBeNull();
  });
});

describe('Academic Financial Projection OpenAPI declaration', () => {
  const identity = new IdentityJwksFixture();
  let application: INestApplication;

  beforeAll(async () => {
    await identity.start();
    for (const [key, value] of Object.entries(identity.environment())) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('ACADEMIC_TRUSTED_WEB_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('ACADEMIC_MALWARE_SCANNER', 'fake');
    const { AppModule } = await import('../src/app.module');
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = testingModule.createNestApplication();
    configureApplication(application);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
    await identity.close();
    vi.unstubAllEnvs();
  });

  it('publishes the v1 shapes in OpenAPI but fails closed for end-user tokens', async () => {
    const openApi = await request(application.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200);
    expect(openApi.body.paths).toHaveProperty(
      '/api/v1/integrations/financial-projection/snapshots',
    );
    expect(
      openApi.body.paths[
        '/api/v1/integrations/financial-projection/snapshots/{snapshotToken}/enrollments'
      ].get,
    ).toBeDefined();

    await request(application.getHttpServer())
      .post('/api/v1/integrations/financial-projection/snapshots')
      .auth(
        await identity.sign({ roles: ['TENANT_ADMIN'], tenant_id: tenantA }),
        { type: 'bearer' },
      )
      .expect(403);
  });
});
