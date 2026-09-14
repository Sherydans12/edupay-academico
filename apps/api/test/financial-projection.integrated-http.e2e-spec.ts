import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';
import { ACADEMIC_AUDIT_PORT } from '../src/academic/academic-audit.port';
import { FinancialProjectionPublisherService } from '../src/financial-projection/financial-projection-publisher.service';
import { PrismaService } from '../src/persistence/prisma.service';
import { IdentityInternalFixture } from './support/identity-internal.fixture';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const academicUrl = process.env.TEST_ACADEMIC_DATABASE_URL;
const blUrl = process.env.TEST_BL_DATABASE_URL;
const blRoot = process.env.BL002_BACKEND_ROOT;
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const tokenA = 'synthetic-academic-to-bl-tenant-a-token-0001';
const tokenB = 'synthetic-academic-to-bl-tenant-b-token-0002';
const blAdminSecret = 'synthetic-bl-admin-secret-at-least-32-characters';
const blPort = 4101;
const academicPort = 4102;
const academicProxyPort = 4103;

/**
 * This is intentionally a cross-repository gate: both real Nest applications
 * listen on loopback and the Academic publisher uses fetch against BL's HTTP
 * controller. It is skipped unless the runner supplies isolated PG URLs.
 */
describe.runIf(Boolean(academicUrl && blUrl && blRoot))(
  'Phase 1 Academic -> BL financial projection over real HTTP',
  () => {
    const jwks = new IdentityJwksFixture();
    const internal = new IdentityInternalFixture();
    let academic: INestApplication;
    let blProcess: ChildProcess | undefined;
    let blProcessEnv: NodeJS.ProcessEnv = {};
    let academicProxy: Server | undefined;
    let academicConfig: ConfigService;
    let blSuperAdminId: string;
    let failAfterFirstSnapshotPage = false;
    let snapshotPageRequests = 0;
    let academicPrisma: PrismaService;
    let blPrisma: any;
    let blPool: { end(): Promise<void> } | undefined;
    let publisher: FinancialProjectionPublisherService;
    let blBaseUrl: string;

    beforeAll(async () => {
      await jwks.start();
      await internal.start();

      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: blUrl,
        JWT_SECRET: blAdminSecret,
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'true',
        ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS: JSON.stringify([
          { keyId: 'academic-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'academic-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS: JSON.stringify([
          { keyId: 'academic-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'academic-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_BASE_URL: `http://127.0.0.1:${academicProxyPort}`,
      });
      blBaseUrl = `http://127.0.0.1:${blPort}`;
      blProcessEnv = { ...process.env, PORT: String(blPort) };
      await startBl();
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      const [blClient, blAdapter, blPg] = await Promise.all([
        import(
          pathToFileURL(
            path.join(
              blRoot!,
              'node_modules',
              '@prisma',
              'client',
              'default.js',
            ),
          ).href
        ),
        import(
          pathToFileURL(
            path.join(
              blRoot!,
              'node_modules',
              '@prisma',
              'adapter-pg',
              'dist',
              'index.js',
            ),
          ).href
        ),
        import(
          pathToFileURL(
            path.join(blRoot!, 'node_modules', 'pg', 'lib', 'index.js'),
          ).href
        ),
      ]);
      blPool = new blPg.Pool({ connectionString: blUrl });
      blPrisma = new blClient.PrismaClient({
        adapter: new blAdapter.PrismaPg(blPool),
      });

      Object.assign(process.env, {
        ...jwks.environment(),
        ...internal.environment(),
        DATABASE_URL: academicUrl,
        ACADEMIC_TRUSTED_WEB_ORIGINS: 'http://localhost:3000',
        ACADEMIC_MALWARE_SCANNER: 'fake',
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'true',
        ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS: JSON.stringify([
          { keyId: 'academic-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'academic-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_CURSOR_SECRET:
          'synthetic-financial-projection-cursor-secret-0001',
        ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED: 'true',
        BL_FINANCIAL_PROJECTION_BASE_URL: blBaseUrl,
        BL_FINANCIAL_PROJECTION_SERVICE_KEY_ID: 'academic-a',
        BL_FINANCIAL_PROJECTION_SERVICE_TOKEN: tokenA,
        BL_FINANCIAL_PROJECTION_RETRY_SCHEDULE_SECONDS: '1',
      });
      const { AppModule } = await import('../src/app.module');
      const academicTesting = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(ACADEMIC_AUDIT_PORT)
        .useValue({ record: () => Promise.resolve() })
        .compile();
      academic = academicTesting.createNestApplication();
      configureApplication(academic);
      await academic.listen(academicPort, '127.0.0.1');
      academicPrisma = academic.get(PrismaService);
      publisher = academic.get(FinancialProjectionPublisherService);
      academicConfig = academic.get(ConfigService);
      academicProxy = await startAcademicProxy();

      await academicPrisma.$executeRawUnsafe(
        'TRUNCATE TABLE financial_projection_outbox_events, financial_projection_snapshot_items, financial_projection_snapshots, course_enrollments, students, courses, academic_years, tenants CASCADE',
      );
      await blPrisma.$executeRawUnsafe(
        'TRUNCATE TABLE academic_financial_projections, academic_financial_projection_consumed_events, academic_financial_projection_quarantine, academic_financial_projection_snapshots, tenant_canonical_mappings, tenants CASCADE',
      );
      const mappingRole = await blPrisma.role.upsert({
        where: { name: 'HTTP_GATE_MAPPING_ADMIN' },
        update: {},
        create: {
          name: 'HTTP_GATE_MAPPING_ADMIN',
          description: 'synthetic HTTP gate only',
        },
      });
      const mappingUser = await blPrisma.user.upsert({
        where: { email: 'http-gate-mapping-admin@example.test' },
        update: { roleId: mappingRole.id },
        create: {
          email: 'http-gate-mapping-admin@example.test',
          password: 'not-a-production-secret',
          name: 'HTTP gate mapping admin',
          roleId: mappingRole.id,
        },
      });
      const superAdminRole = await blPrisma.role.upsert({
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: {
          name: 'SUPER_ADMIN',
          description: 'synthetic HTTP gate only',
        },
      });
      const superAdmin = await blPrisma.user.upsert({
        where: { email: 'http-gate-super-admin@example.test' },
        update: { roleId: superAdminRole.id, isActive: true, tenantId: null },
        create: {
          email: 'http-gate-super-admin@example.test',
          password: 'not-a-production-secret',
          name: 'HTTP gate super admin',
          roleId: superAdminRole.id,
          tenantId: null,
        },
      });
      blSuperAdminId = superAdmin.id;
      for (const [tenantId, name] of [
        [tenantA, 'Synthetic A'],
        [tenantB, 'Synthetic B'],
      ] as const) {
        await blPrisma.tenant.create({
          data: { id: tenantId, slug: `synthetic-${name.at(-1)}`, name },
        });
        await blPrisma.tenantCanonicalMapping.create({
          data: {
            tenantId,
            canonicalTenantId: tenantId,
            assignedByUserId: mappingUser.id,
            correlationId: 'http-gate',
            reason: 'synthetic gate',
          },
        });
      }
    });

    afterAll(async () => {
      await closeAcademicProxy();
      await academic?.close();
      await stopBl();
      await blPrisma?.$disconnect();
      await blPool?.end();
      await internal.close();
      await jwks.close();
      vi.unstubAllEnvs();
    });

    it('projects an HTTP-created enrollment through outbox and publisher without financial writes', async () => {
      const admin = await accessToken(tenantA, 'admin-a');
      const year = await post(admin, '/api/v1/academic-years', {
        label: '2026',
        startDate: '2026-03-01',
        endDate: '2026-12-20',
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: 'A',
        status: 'ACTIVE',
      });
      const student = await post(admin, '/api/v1/students', {
        firstName: 'Synthetic',
        lastName: 'A',
      });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: course.id,
      });
      expect(await academicPrisma.financialProjectionOutboxEvent.count()).toBe(
        1,
      );
      expect(await publisher.publishPending()).toEqual({
        attempted: 1,
        published: 1,
      });
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { academicEnrollmentId: enrollment.id },
        }),
      ).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);

      const outbox =
        await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow();
      const event = {
        eventId: outbox.id,
        eventType: outbox.eventType,
        schemaVersion: outbox.schemaVersion,
        canonicalTenantId: outbox.tenantId,
        aggregateType: 'ACADEMIC_ENROLLMENT',
        aggregateId: outbox.aggregateId,
        entityVersion: Number(outbox.entityVersion),
        occurredAt: outbox.occurredAt.toISOString(),
        correlationId: outbox.correlationId,
        payload: outbox.payload,
      };
      const duplicate = await fetch(
        `${blBaseUrl}/api/integrations/academic-financial-projection/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenA}`,
            'Content-Type': 'application/json',
            'X-EduPay-Service': 'ACADEMIC_PRODUCER',
            'X-EduPay-Service-Key-Id': 'academic-a',
          },
          body: JSON.stringify(event),
        },
      );
      expect(duplicate.status).toBe(201);
      expect(await duplicate.json()).toMatchObject({
        data: { outcome: 'DUPLICATE' },
      });

      const crossTenant = await fetch(
        `${blBaseUrl}/api/integrations/academic-financial-projection/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenA}`,
            'Content-Type': 'application/json',
            'X-EduPay-Service': 'ACADEMIC_PRODUCER',
            'X-EduPay-Service-Key-Id': 'academic-a',
          },
          body: JSON.stringify({
            ...event,
            canonicalTenantId: tenantB,
            payload: {
              ...(event.payload as object),
              canonicalTenantId: tenantB,
            },
          }),
        },
      );
      expect(crossTenant.status).toBe(403);
    });

    it('retries a temporarily unavailable real HTTP destination without duplicate shadow effects', async () => {
      const admin = await accessToken(tenantA, 'retry-admin');
      const year = await post(admin, '/api/v1/academic-years', {
        label: '2027',
        startDate: '2027-03-01',
        endDate: '2027-12-20',
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: 'Retry',
        status: 'ACTIVE',
      });
      const student = await post(admin, '/api/v1/students', {
        firstName: 'Retry',
        lastName: 'Synthetic',
      });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: course.id,
      });
      const event =
        await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow({
          where: { aggregateId: enrollment.id },
        });

      await stopBl();
      await waitForUnavailable(`${blBaseUrl}/api/v1/health`);
      expect(await publisher.publishPending()).toEqual({
        attempted: 1,
        published: 0,
      });
      expect(
        (
          await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow(
            { where: { id: event.id } },
          )
        ).status,
      ).toBe('RETRY');

      blProcess = spawn(
        process.platform === 'win32' ? 'cmd.exe' : 'npm',
        process.platform === 'win32'
          ? ['/d', '/s', '/c', 'npm run start:dev']
          : ['run', 'start:dev'],
        { cwd: blRoot, env: blProcessEnv, stdio: 'pipe' },
      );
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(await publisher.publishPending()).toEqual({
        attempted: 1,
        published: 1,
      });
      expect(
        (
          await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow(
            { where: { id: event.id } },
          )
        ).status,
      ).toBe('PUBLISHED');
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { academicEnrollmentId: enrollment.id },
        }),
      ).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);
    }, 30_000);

    it('classifies an older delivered enrollment version as STALE without overwriting shadow state', async () => {
      const admin = await accessToken(tenantA, 'late-event-admin');
      const year = await post(admin, '/api/v1/academic-years', {
        label: '2028',
        startDate: '2028-03-01',
        endDate: '2028-12-20',
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: 'Late event',
        status: 'ACTIVE',
      });
      const student = await post(admin, '/api/v1/students', {
        firstName: 'Late',
        lastName: 'Version',
      });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: course.id,
      });
      await post(
        admin,
        `/api/v1/course-enrollments/${enrollment.id}/deactivate`,
        {},
      );
      const [older, newer] =
        await academicPrisma.financialProjectionOutboxEvent.findMany({
          where: { aggregateId: enrollment.id },
          orderBy: { entityVersion: 'asc' },
        });
      expect(older).toBeDefined();
      expect(newer).toBeDefined();
      if (!older || !newer)
        throw new Error('Expected two enrollment outbox versions.');
      expect(older.entityVersion).toBeLessThan(newer.entityVersion);

      expect((await deliver(newer)).data.outcome).toBe('APPLIED');
      const afterNewer =
        await blPrisma.academicFinancialProjection.findFirstOrThrow({
          where: { academicEnrollmentId: enrollment.id },
        });
      expect(Number(afterNewer.version)).toBe(Number(newer.entityVersion));
      expect(afterNewer.enrollmentStatus).toBe('INACTIVE');

      expect((await deliver(older)).data.outcome).toBe('STALE');
      const afterOlder =
        await blPrisma.academicFinancialProjection.findFirstOrThrow({
          where: { academicEnrollmentId: enrollment.id },
        });
      expect(Number(afterOlder.version)).toBe(Number(newer.entityVersion));
      expect(afterOlder.enrollmentStatus).toBe('INACTIVE');
      expect((await deliver(older)).data.outcome).toBe('DUPLICATE');
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { academicEnrollmentId: enrollment.id },
        }),
      ).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);
    });

    it('projects a second tenant through its dedicated real publisher credential and isolates both tenants', async () => {
      const admin = await accessToken(tenantB, 'tenant-b-admin');
      const year = await post(admin, '/api/v1/academic-years', {
        label: '2029',
        startDate: '2029-03-01',
        endDate: '2029-12-20',
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: 'Tenant B',
        status: 'ACTIVE',
      });
      const student = await post(admin, '/api/v1/students', {
        firstName: 'Tenant',
        lastName: 'B',
      });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: course.id,
      });
      const eventB =
        await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow({
          where: { aggregateId: enrollment.id },
        });

      expect((await publisher.publishPending()).published).toBeGreaterThan(0);
      expect(
        (
          await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow(
            { where: { id: eventB.id } },
          )
        ).status,
      ).toBe('PUBLISHED');
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantB, academicEnrollmentId: enrollment.id },
        }),
      ).toBe(1);
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA },
        }),
      ).toBeGreaterThan(0);

      const eventA =
        await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow({
          where: { tenantId: tenantA },
        });
      expect((await deliverWith(tokenA, 'academic-a', eventB)).status).toBe(
        403,
      );
      expect((await deliverWith(tokenB, 'academic-b', eventA)).status).toBe(
        403,
      );
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantB, academicEnrollmentId: enrollment.id },
        }),
      ).toBe(1);
      const bProjection =
        await blPrisma.academicFinancialProjection.findFirstOrThrow({
          where: { tenantId: tenantB, academicEnrollmentId: enrollment.id },
        });
      const aAdmin = await accessToken(tenantA, 'tenant-a-isolation-admin');
      await post(
        aAdmin,
        `/api/v1/course-enrollments/${eventA.aggregateId}/deactivate`,
        {},
      );
      await publisher.publishPending();
      const bAfterAChange =
        await blPrisma.academicFinancialProjection.findFirstOrThrow({
          where: { tenantId: tenantB, academicEnrollmentId: enrollment.id },
        });
      expect(bAfterAChange).toMatchObject({
        version: bProjection.version,
        enrollmentStatus: bProjection.enrollmentStatus,
        academicCourseId: bProjection.academicCourseId,
      });
      expect(await financialCounts()).toEqual(financialBefore);
    });

    it('resumes an interrupted paginated snapshot over HTTP and reconciles without duplicate rows or financial writes', async () => {
      const admin = await accessToken(tenantA, 'snapshot-admin');
      const financialBefore = await financialCounts();
      const year = await post(admin, '/api/v1/academic-years', {
        label: '2030',
        startDate: '2030-03-01',
        endDate: '2030-12-20',
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: 'Snapshot pagination',
        status: 'ACTIVE',
      });
      for (let index = 0; index < 101; index += 1) {
        const student = await post(admin, '/api/v1/students', {
          firstName: `Snapshot-${index}`,
          lastName: 'Synthetic',
        });
        await post(admin, '/api/v1/course-enrollments', {
          studentId: student.id,
          courseId: course.id,
        });
      }
      const sourceEnrollmentCount = await academicPrisma.courseEnrollment.count(
        { where: { tenantId: tenantA } },
      );
      expect(sourceEnrollmentCount).toBeGreaterThan(100);

      snapshotPageRequests = 0;
      failAfterFirstSnapshotPage = true;
      const interrupted = await blAdminRequest(
        'POST',
        `/api/integrations/academic-financial-projection/shadow/tenants/${tenantA}/snapshots`,
      );
      expect(interrupted.status).toBeGreaterThanOrEqual(500);
      expect(snapshotPageRequests).toBe(2);

      const localSnapshot =
        await blPrisma.academicFinancialProjectionSnapshot.findFirstOrThrow({
          where: { tenantId: tenantA },
          orderBy: { startedAt: 'desc' },
        });
      expect(localSnapshot).toMatchObject({
        status: 'INCOMPLETE',
        receivedItemCount: 100,
      });
      expect(localSnapshot.nextCursor).toEqual(expect.any(String));
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA, lastSnapshotId: localSnapshot.id },
        }),
      ).toBe(100);

      const partialReconciliation = await blAdminRequest(
        'GET',
        `/api/integrations/academic-financial-projection/shadow/tenants/${tenantA}/snapshots/${localSnapshot.id}/reconciliation`,
      );
      expect(partialReconciliation.status).toBe(400);
      expect(await financialCounts()).toEqual(financialBefore);

      failAfterFirstSnapshotPage = false;
      const resumed = await blAdminRequest(
        'POST',
        `/api/integrations/academic-financial-projection/shadow/tenants/${tenantA}/snapshots/${localSnapshot.id}/resume`,
      );
      expect(resumed.status).toBe(201);
      expect(resumed.body).toMatchObject({
        data: {
          snapshotId: localSnapshot.id,
          expectedItemCount: sourceEnrollmentCount,
          missing: 0,
          extra: 0,
          reconciled: true,
        },
      });

      const completedSnapshot =
        await blPrisma.academicFinancialProjectionSnapshot.findUniqueOrThrow({
          where: { id: localSnapshot.id },
        });
      expect(completedSnapshot).toMatchObject({
        status: 'RECONCILED',
        receivedItemCount: sourceEnrollmentCount,
        nextCursor: null,
      });
      expect(completedSnapshot.watermark).toMatch(/^outbox-sequence:/);

      const projections = await blPrisma.academicFinancialProjection.findMany({
        where: { tenantId: tenantA },
        select: { academicEnrollmentId: true, lastSnapshotId: true },
      });
      expect(projections).toHaveLength(sourceEnrollmentCount);
      expect(
        new Set(
          projections.map(
            (row: { academicEnrollmentId: string }) => row.academicEnrollmentId,
          ),
        ).size,
      ).toBe(sourceEnrollmentCount);
      expect(
        projections.every(
          (row: { lastSnapshotId: string | null }) =>
            row.lastSnapshotId === localSnapshot.id,
        ),
      ).toBe(true);
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA, operation: 'TOMBSTONE' },
        }),
      ).toBeGreaterThan(0);
      expect(await financialCounts()).toEqual(financialBefore);
    }, 60_000);

    it('keeps normal enrollment operations available while the Academic producer flag is off', async () => {
      const admin = await accessToken(tenantA, 'producer-disabled-admin');
      const outboxBefore =
        await academicPrisma.financialProjectionOutboxEvent.count();
      const shadowBefore = await blPrisma.academicFinancialProjection.count({
        where: { tenantId: tenantA },
      });
      const financialBefore = await financialCounts();
      academicConfig.set('ACADEMIC_FINANCIAL_PROJECTION_ENABLED', false);
      try {
        const { enrollment } = await createEnrollmentFixture(
          admin,
          '2031',
          'Producer disabled',
          'Producer flag off',
        );
        expect(
          await academicPrisma.courseEnrollment.count({
            where: { id: enrollment.id, tenantId: tenantA },
          }),
        ).toBe(1);
        expect(
          await academicPrisma.financialProjectionOutboxEvent.count(),
        ).toBe(outboxBefore);

        const sourceSnapshot = await academicSnapshotRequest('POST');
        expect(sourceSnapshot.status).toBe(503);
        expect(
          await blPrisma.academicFinancialProjection.count({
            where: { tenantId: tenantA },
          }),
        ).toBe(shadowBefore);
        expect(await financialCounts()).toEqual(financialBefore);
      } finally {
        academicConfig.set('ACADEMIC_FINANCIAL_PROJECTION_ENABLED', true);
      }
    });

    it('suppresses publisher delivery independently while preserving the pending outbox event', async () => {
      const admin = await accessToken(tenantA, 'publisher-disabled-admin');
      for (let drain = 0; drain < 10; drain += 1) {
        const result = await publisher.publishPending(100);
        if (result.attempted === 0) break;
      }
      const shadowBefore = await blPrisma.academicFinancialProjection.count({
        where: { tenantId: tenantA },
      });
      const financialBefore = await financialCounts();
      academicConfig.set(
        'ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED',
        false,
      );
      let event: any;
      try {
        const fixture = await createEnrollmentFixture(
          admin,
          '2032',
          'Publisher disabled',
          'Publisher flag off',
        );
        if (!fixture.eventId)
          throw new Error('Producer did not emit an outbox event.');
        event =
          await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow(
            {
              where: { id: fixture.eventId },
            },
          );
        expect(event.status).toBe('PENDING');
        expect(await publisher.publishPending()).toEqual({
          attempted: 0,
          published: 0,
        });
        expect(
          await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow(
            {
              where: { id: event.id },
            },
          ),
        ).toMatchObject({ status: 'PENDING', attemptCount: 0 });
        expect(
          await blPrisma.academicFinancialProjection.count({
            where: { tenantId: tenantA },
          }),
        ).toBe(shadowBefore);
        expect(await financialCounts()).toEqual(financialBefore);
      } finally {
        academicConfig.set(
          'ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED',
          true,
        );
      }
      expect(await publisher.publishPending()).toEqual({
        attempted: 1,
        published: 1,
      });
      expect(
        await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow({
          where: { id: event.id },
        }),
      ).toMatchObject({ status: 'PUBLISHED' });
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA, academicEnrollmentId: event.aggregateId },
        }),
      ).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);
    });

    it('fails closed at the real BL consumer when its flag is off, then accepts the same event after re-enabling', async () => {
      const admin = await accessToken(tenantA, 'consumer-disabled-admin');
      const fixture = await createEnrollmentFixture(
        admin,
        '2033',
        'Consumer disabled',
        'Consumer flag off',
      );
      if (!fixture.eventId)
        throw new Error('Producer did not emit an outbox event.');
      const event =
        await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow({
          where: { id: fixture.eventId },
        });
      const shadowBefore = await blPrisma.academicFinancialProjection.count({
        where: { tenantId: tenantA, academicEnrollmentId: event.aggregateId },
      });
      const consumedBefore =
        await blPrisma.academicFinancialProjectionConsumedEvent.count({
          where: { tenantId: tenantA, aggregateId: event.aggregateId },
        });
      const financialBefore = await financialCounts();

      await stopBl();
      await waitForUnavailable(`${blBaseUrl}/api/v1/health`);
      blProcessEnv = {
        ...blProcessEnv,
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'false',
      };
      await startBl();
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      const disabled = await deliverWith(tokenA, 'academic-a', event);
      expect(disabled.status).toBe(503);
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA, academicEnrollmentId: event.aggregateId },
        }),
      ).toBe(shadowBefore);
      expect(
        await blPrisma.academicFinancialProjectionConsumedEvent.count({
          where: { tenantId: tenantA, aggregateId: event.aggregateId },
        }),
      ).toBe(consumedBefore);
      expect(await financialCounts()).toEqual(financialBefore);

      await stopBl();
      await waitForUnavailable(`${blBaseUrl}/api/v1/health`);
      blProcessEnv = {
        ...blProcessEnv,
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'true',
      };
      await startBl();
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      const enabled = await deliver(event);
      expect(enabled.data.outcome).toBe('APPLIED');
      expect(
        await blPrisma.academicFinancialProjection.count({
          where: { tenantId: tenantA, academicEnrollmentId: event.aggregateId },
        }),
      ).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);
    }, 60_000);

    async function createEnrollmentFixture(
      admin: string,
      yearLabel: string,
      yearName: string,
      studentLastName: string,
    ) {
      const year = await post(admin, '/api/v1/academic-years', {
        label: yearLabel,
        startDate: `${yearLabel}-03-01`,
        endDate: `${yearLabel}-12-20`,
      });
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: yearName,
        status: 'ACTIVE',
      });
      const student = await post(admin, '/api/v1/students', {
        firstName: 'Synthetic',
        lastName: studentLastName,
      });
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: course.id,
      });
      const event =
        await academicPrisma.financialProjectionOutboxEvent.findFirst({
          where: { aggregateId: enrollment.id },
          orderBy: { sequence: 'desc' },
          select: { id: true },
        });
      return { enrollment, eventId: event?.id };
    }

    async function academicSnapshotRequest(method: 'GET' | 'POST') {
      return fetch(
        `http://127.0.0.1:${academicPort}/api/v1/integrations/financial-projection/snapshots`,
        {
          method,
          headers: {
            Authorization: `Bearer ${tokenA}`,
            'X-EduPay-Service': 'BL_SHADOW',
            'X-EduPay-Service-Key-Id': 'academic-a',
            ...(method === 'POST'
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          ...(method === 'POST' ? { body: '{}' } : {}),
        },
      );
    }

    async function blAdminRequest(method: 'GET' | 'POST', url: string) {
      const response = await fetch(`${blBaseUrl}${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${await adminAccessToken()}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // The status is the durable assertion for a controlled upstream stop.
      }
      return { status: response.status, body };
    }

    async function adminAccessToken(): Promise<string> {
      return new SignJWT({ sub: blSuperAdminId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode(blAdminSecret));
    }

    async function startBl() {
      blProcess = spawn(
        process.platform === 'win32' ? 'cmd.exe' : 'npm',
        process.platform === 'win32'
          ? ['/d', '/s', '/c', 'npm run start:dev']
          : ['run', 'start:dev'],
        {
          cwd: blRoot,
          env: blProcessEnv,
          stdio: 'pipe',
        },
      );
    }

    async function startAcademicProxy(): Promise<Server> {
      const server = createServer((incoming, outgoing) => {
        const target = new URL(
          incoming.url ?? '/',
          `http://127.0.0.1:${academicPort}`,
        );
        const isSnapshotPage =
          incoming.method === 'GET' && target.pathname.endsWith('/enrollments');
        if (isSnapshotPage) {
          snapshotPageRequests += 1;
          if (failAfterFirstSnapshotPage && snapshotPageRequests === 2) {
            outgoing.writeHead(503, { 'content-type': 'application/json' });
            outgoing.end(JSON.stringify({ error: 'synthetic interruption' }));
            return;
          }
        }

        const upstream = httpRequest(
          {
            hostname: '127.0.0.1',
            port: academicPort,
            path: `${target.pathname}${target.search}`,
            method: incoming.method,
            headers: { ...incoming.headers, host: `127.0.0.1:${academicPort}` },
          },
          (response) => {
            outgoing.statusCode = response.statusCode ?? 502;
            for (const [name, value] of Object.entries(response.headers)) {
              if (value !== undefined) outgoing.setHeader(name, value);
            }
            response.pipe(outgoing);
          },
        );
        upstream.on('error', () => {
          if (!outgoing.headersSent) {
            outgoing.writeHead(502, { 'content-type': 'application/json' });
            outgoing.end(
              JSON.stringify({ error: 'synthetic proxy upstream failure' }),
            );
          }
        });
        incoming.pipe(upstream);
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(academicProxyPort, '127.0.0.1', resolve);
      });
      return server;
    }

    async function closeAcademicProxy() {
      if (!academicProxy) return;
      await new Promise<void>((resolve, reject) => {
        academicProxy!.close((error) => (error ? reject(error) : resolve()));
      });
      academicProxy = undefined;
    }

    async function post(accessToken: string, url: string, body: object) {
      const response = await request(academic.getHttpServer())
        .post(url)
        .auth(accessToken, { type: 'bearer' })
        .send(body)
        .expect(201);
      return response.body;
    }
    async function patch(accessToken: string, url: string, body: object) {
      const response = await request(academic.getHttpServer())
        .patch(url)
        .auth(accessToken, { type: 'bearer' })
        .send(body)
        .expect(200);
      return response.body;
    }
    async function accessToken(tenantId: string, userId: string) {
      const membershipId = `membership-${tenantId}-${userId}`;
      const sessionId = `session-${tenantId}-${userId}`;
      internal.registerSession({
        identityUserId: userId,
        membershipId,
        sessionId,
        tenantId,
      });
      return jwks.sign({
        sub: userId,
        tenant_id: tenantId,
        membership_id: membershipId,
        sid: sessionId,
        roles: ['TENANT_ADMIN'],
      });
    }
    async function financialCounts() {
      return {
        charges: await blPrisma.charge.count(),
        payments: await blPrisma.payment.count(),
        paymentGroups: await blPrisma.paymentGroup.count(),
        paymentConcepts: await blPrisma.paymentConcept.count(),
      };
    }
    async function deliver(outbox: any) {
      const response = await deliverWith(tokenA, 'academic-a', outbox);
      expect(response.status).toBe(201);
      return response.json();
    }
    async function deliverWith(token: string, keyId: string, outbox: any) {
      return fetch(
        `${blBaseUrl}/api/integrations/academic-financial-projection/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-EduPay-Service': 'ACADEMIC_PRODUCER',
            'X-EduPay-Service-Key-Id': keyId,
          },
          body: JSON.stringify({
            eventId: outbox.id,
            eventType: outbox.eventType,
            schemaVersion: outbox.schemaVersion,
            canonicalTenantId: outbox.tenantId,
            aggregateType: 'ACADEMIC_ENROLLMENT',
            aggregateId: outbox.aggregateId,
            entityVersion: Number(outbox.entityVersion),
            occurredAt: outbox.occurredAt.toISOString(),
            correlationId: outbox.correlationId,
            payload: outbox.payload,
          }),
        },
      );
    }
    async function waitForHealth(url: string) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const response = await fetch(url);
          if (response.ok) return;
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(`BL did not become healthy: ${String(lastError)}`);
    }
    async function waitForUnavailable(url: string) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          await fetch(url);
        } catch {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        'BL remained reachable after its controlled test shutdown.',
      );
    }
    async function stopBl() {
      if (!blProcess?.pid) return;
      const processToStop = blProcess;
      blProcess = undefined;
      if (process.platform !== 'win32') {
        processToStop.kill();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const taskkill = spawn('taskkill.exe', [
          '/pid',
          String(processToStop.pid),
          '/T',
          '/F',
        ]);
        taskkill.once('error', reject);
        taskkill.once('close', (code) =>
          code === 0 || code === 128
            ? resolve()
            : reject(new Error(`taskkill exited ${code}`)),
        );
      });
    }
  },
);
