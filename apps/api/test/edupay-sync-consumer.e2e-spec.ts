import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/persistence/prisma.service';
import { EDUPAY_SOURCE } from '../src/sync/sync.constants';
import {
  configureEduPaySync,
  SyncConfigurationConflictError,
} from '../src/sync/sync-configuration';
import { SyncItemApplicationService } from '../src/sync/sync-item-application.service';
import { EduPaySyncService } from '../src/sync/sync.service';
import { EduPaySourceFixture } from './support/edupay-source.fixture';
import { IdentityInternalFixture } from './support/identity-internal.fixture';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';
const STUDENT_A = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = '2026-08-11T12:00:00.000Z';

describe
  .runIf(testDatabaseUrl)
  .sequential('EduPay synchronization consumer (PostgreSQL 15 e2e)', () => {
    const identity = new IdentityJwksFixture();
    const identityInternal = new IdentityInternalFixture();
    const source = new EduPaySourceFixture();
    let application: INestApplication;
    let prisma: PrismaService;
    let sync: EduPaySyncService;
    let syncItems: SyncItemApplicationService;
    let academicYearId: string;

    beforeAll(async () => {
      await Promise.all([
        identity.start(),
        identityInternal.start(),
        source.start(),
      ]);
      for (const [key, value] of Object.entries({
        ...identity.environment(),
        ...identityInternal.environment(),
        ...source.environment(),
        DATABASE_URL: testDatabaseUrl as string,
      })) {
        vi.stubEnv(key, value);
      }
      const { AppModule } = await import('../src/app.module');
      const testingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      application = testingModule.createNestApplication();
      configureApplication(application);
      await application.init();
      prisma = application.get(PrismaService);
      sync = application.get(EduPaySyncService);
      syncItems = application.get(SyncItemApplicationService);
    });

    beforeEach(async () => {
      source.reset();
      identityInternal.reset();
      await cleanDatabase();
      await prisma.tenant.createMany({
        data: [{ id: TENANT_A }, { id: TENANT_B }],
      });
      const year = await prisma.academicYear.create({
        data: {
          tenantId: TENANT_A,
          label: '2026',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-12-20T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
      academicYearId = year.id;
      await configureEduPaySync(prisma, {
        tenantId: TENANT_A,
        sourceTenantId: source.sourceTenantId,
        academicYearId,
        enabled: true,
      });
      setDefaultSourceRows();
    });

    afterAll(async () => {
      await application.close();
      await Promise.all([
        identity.close(),
        identityInternal.close(),
        source.close(),
      ]);
      vi.unstubAllEnvs();
    });

    it('configures an explicit compatible mapping without persisting a secret', async () => {
      const rerun = await configureEduPaySync(prisma, {
        tenantId: TENANT_A,
        sourceTenantId: source.sourceTenantId,
        academicYearId,
        enabled: true,
      });
      expect(rerun.created).toBe(false);
      const configuration = await prisma.syncConfiguration.findUniqueOrThrow({
        where: {
          tenantId_source: { tenantId: TENANT_A, source: EDUPAY_SOURCE },
        },
      });
      expect(configuration).toMatchObject({
        tenantId: TENANT_A,
        sourceTenantId: source.sourceTenantId,
        academicYearId,
        enabled: true,
      });
      expect(JSON.stringify(configuration)).not.toContain(source.token);

      const wrongTenantYear = await prisma.academicYear.create({
        data: {
          tenantId: TENANT_B,
          label: '2026',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-12-20T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
      await expect(
        configureEduPaySync(prisma, {
          tenantId: TENANT_A,
          sourceTenantId: 'wrong-source',
          academicYearId: wrongTenantYear.id,
          enabled: true,
        }),
      ).rejects.toBeInstanceOf(SyncConfigurationConflictError);
    });

    it('does not apply or checkpoint an entity when a continuation page is interrupted', async () => {
      source.failNextCursorEntity = 'COURSE';
      const result = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');

      expect(result).toMatchObject({
        status: 'SOURCE_UNAVAILABLE',
        retryable: true,
      });
      expect(await prisma.course.count({ where: { tenantId: TENANT_A } })).toBe(
        0,
      );
      expect(
        await prisma.student.count({ where: { tenantId: TENANT_A } }),
      ).toBe(0);
      expect(
        await prisma.syncState.count({ where: { tenantId: TENANT_A } }),
      ).toBe(0);
      const run = await prisma.syncRun.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT_A, id: result.runId } },
      });
      expect(run).toMatchObject({
        errorCode: 'INTEGRATION_RATE_LIMITED',
        watermarkAdvanced: false,
      });
      expect(JSON.stringify(run)).not.toContain(source.token);
      expect(JSON.stringify(run)).not.toContain('Primero A');
    });

    it('runs multipage Course-before-Student incremental sync with terminal watermarks and replay safety', async () => {
      const manualCourse = await prisma.course.create({
        data: {
          tenantId: TENANT_A,
          academicYearId,
          source: 'MANUAL',
          label: 'Primero A',
          status: 'ACTIVE',
        },
      });
      const manualStudent = await prisma.student.create({
        data: {
          tenantId: TENANT_A,
          firstName: 'Ana',
          lastName: 'Pérez',
        },
      });

      const first = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(first.status).toBe('SUCCEEDED');
      expect(first.counts).toMatchObject({ createdCount: 3, failedCount: 0 });
      const sourceCourses = await prisma.course.findMany({
        where: { tenantId: TENANT_A, source: EDUPAY_SOURCE },
      });
      expect(sourceCourses).toHaveLength(2);
      expect(
        sourceCourses.some((course) => course.id === manualCourse.id),
      ).toBe(false);
      const student = await prisma.student.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: STUDENT_A,
          },
        },
      });
      expect(student.email).toBeNull();
      expect(student.id).not.toBe(manualStudent.id);
      expect(
        await prisma.student.count({ where: { tenantId: TENANT_A } }),
      ).toBe(2);
      expect(
        await prisma.courseEnrollment.count({
          where: {
            tenantId: TENANT_A,
            studentId: student.id,
            source: EDUPAY_SOURCE,
            status: 'ACTIVE',
          },
        }),
      ).toBe(1);

      const states = await prisma.syncState.findMany({
        where: { tenantId: TENANT_A, source: EDUPAY_SOURCE },
      });
      expect(states).toHaveLength(2);
      expect(
        states.every((state) => state.watermark?.startsWith('watermark:')),
      ).toBe(true);
      const courseRequest = source.requests.findIndex((entry) =>
        entry.url.includes('/courses'),
      );
      const studentRequest = source.requests.findIndex((entry) =>
        entry.url.includes('/students'),
      );
      expect(courseRequest).toBeGreaterThanOrEqual(0);
      expect(studentRequest).toBeGreaterThan(courseRequest);
      expect(
        source.requests.every(
          (entry) =>
            entry.authorization === `Bearer ${source.token}` &&
            entry.sourceTenantId === source.sourceTenantId &&
            Boolean(entry.correlationId),
        ),
      ).toBe(true);

      source.requests.length = 0;
      const replay = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(replay.status).toBe('SUCCEEDED');
      expect(replay.counts.unchangedCount).toBe(3);
      expect(await prisma.course.count({ where: { tenantId: TENANT_A } })).toBe(
        3,
      );
      expect(
        await prisma.student.count({ where: { tenantId: TENANT_A } }),
      ).toBe(2);
      expect(source.requests[0]?.url).toContain('watermark=');
      expect(states.some((state) => state.watermark?.includes('eyJ'))).toBe(
        false,
      );
    });

    it('preserves local identity/email and pedagogical history across moves, tombstones, and restoration', async () => {
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      const student = await prisma.student.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: STUDENT_A,
          },
        },
      });
      await prisma.student.update({
        where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
        data: {
          identityUserId: 'identity-student-a',
          email: 'local@example.test',
        },
      });
      const targetCourseB = await sourceCourse(COURSE_B);
      const subject = await prisma.subject.create({
        data: { tenantId: TENANT_A, name: 'Lenguaje' },
      });
      const courseSubject = await prisma.courseSubject.create({
        data: {
          tenantId: TENANT_A,
          courseId: targetCourseB.id,
          subjectId: subject.id,
        },
      });
      const unit = await prisma.learningUnit.create({
        data: {
          tenantId: TENANT_A,
          courseSubjectId: courseSubject.id,
          title: 'Unidad histórica',
        },
      });
      const item = await prisma.learningItem.create({
        data: {
          tenantId: TENANT_A,
          courseSubjectId: courseSubject.id,
          learningUnitId: unit.id,
          type: 'ASSIGNMENT',
          title: 'Trabajo histórico',
          instructions: 'Conservar esta evidencia histórica.',
          dueAt: new Date('2026-11-30T18:00:00.000Z'),
          createdByIdentityUserId: 'teacher-a',
        },
      });
      const submission = await prisma.submission.create({
        data: {
          tenantId: TENANT_A,
          studentId: student.id,
          learningItemId: item.id,
          status: 'SUBMITTED',
        },
      });

      source.students[0] = {
        ...source.students[0]!,
        firstName: 'Ana María',
        courseIntegrationId: COURSE_B,
        updatedAt: '2026-08-11T13:00:00.000Z',
      };
      source.courses[1] = {
        ...source.courses[1]!,
        name: 'Segundo B renombrado',
        updatedAt: '2026-08-11T13:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      const moved = await prisma.student.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
      });
      expect(moved).toMatchObject({
        firstName: 'Ana María',
        identityUserId: 'identity-student-a',
        email: 'local@example.test',
      });
      expect((await sourceCourse(COURSE_B)).label).toBe('Segundo B renombrado');
      const enrollmentHistory = await prisma.courseEnrollment.findMany({
        where: {
          tenantId: TENANT_A,
          studentId: student.id,
          source: EDUPAY_SOURCE,
        },
      });
      expect(enrollmentHistory).toHaveLength(2);
      expect(
        enrollmentHistory.filter((entry) => entry.status === 'ACTIVE'),
      ).toHaveLength(1);

      source.courses[1] = {
        ...source.courses[1]!,
        deletedAt: '2026-08-11T14:00:00.000Z',
        updatedAt: '2026-08-11T14:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect((await sourceCourse(COURSE_B)).status).toBe('ARCHIVED');
      expect(
        await prisma.courseEnrollment.count({
          where: {
            tenantId: TENANT_A,
            courseId: targetCourseB.id,
            status: 'ACTIVE',
          },
        }),
      ).toBe(0);
      expect(
        await prisma.courseSubject.count({ where: { id: courseSubject.id } }),
      ).toBe(1);
      expect(await prisma.learningItem.count({ where: { id: item.id } })).toBe(
        1,
      );
      expect(
        await prisma.submission.count({ where: { id: submission.id } }),
      ).toBe(1);

      source.courses[1] = {
        ...source.courses[1]!,
        deletedAt: null,
        updatedAt: '2026-08-11T15:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect((await sourceCourse(COURSE_B)).status).toBe('ACTIVE');

      source.students[0] = {
        ...source.students[0]!,
        status: 'GRADUATED',
        updatedAt: '2026-08-11T16:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(
        await prisma.student.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
        }),
      ).toMatchObject({
        id: student.id,
        identityUserId: 'identity-student-a',
        email: 'local@example.test',
        status: 'INACTIVE',
        sourceStatus: 'GRADUATED',
      });
      expect(await activeSourceEnrollmentCount(student.id)).toBe(0);

      source.students[0] = {
        ...source.students[0]!,
        status: 'ACTIVE',
        updatedAt: '2026-08-11T17:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(await activeSourceEnrollmentCount(student.id)).toBe(1);

      source.students[0] = {
        ...source.students[0]!,
        deletedAt: '2026-08-11T18:00:00.000Z',
        updatedAt: '2026-08-11T18:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(
        await prisma.student.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
        }),
      ).toMatchObject({ id: student.id, status: 'INACTIVE' });
      expect(await activeSourceEnrollmentCount(student.id)).toBe(0);

      source.students[0] = {
        ...source.students[0]!,
        deletedAt: null,
        updatedAt: '2026-08-11T19:00:00.000Z',
      };
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(
        await prisma.student.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
        }),
      ).toMatchObject({ id: student.id, status: 'ACTIVE' });
      expect(await activeSourceEnrollmentCount(student.id)).toBe(1);
    });

    it('advances source-declared conflicts but quarantines target mapping failures atomically', async () => {
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      const student = await prisma.student.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: STUDENT_A,
          },
        },
      });
      source.conflicts = [
        {
          code: 'STUDENT_STRUCTURED_NAME_MISSING',
          entity: 'STUDENT',
          integrationId: '44444444-4444-4444-8444-444444444444',
          sourceTenantId: source.sourceTenantId,
          updatedAt: '2026-08-11T13:00:00.000Z',
          deletedAt: null,
        },
      ];
      const full = await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      expect(full.status).toBe('SUCCEEDED');
      const fullRun = await prisma.syncRun.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT_A, id: full.runId } },
      });
      expect(fullRun).toMatchObject({
        snapshotComplete: true,
        watermarkAdvanced: true,
        conflictedCount: 1,
        failedCount: 0,
      });
      expect(
        await prisma.syncItemResult.count({
          where: {
            tenantId: TENANT_A,
            code: 'STUDENT_STRUCTURED_NAME_MISSING',
            targetId: null,
          },
        }),
      ).toBe(1);

      source.conflicts = [];
      const studentWatermark = await prisma.syncState.findUniqueOrThrow({
        where: {
          tenantId_source_entity: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            entity: 'STUDENT',
          },
        },
      });
      source.students[0] = {
        ...source.students[0]!,
        firstName: 'Must not apply',
        courseIntegrationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-11T14:00:00.000Z',
      };
      const missingCourse = await sync.execute(
        TENANT_A,
        'INCREMENTAL',
        'MANUAL',
      );
      expect(missingCourse.status).toBe('PARTIAL');
      expect(
        await prisma.student.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
        }),
      ).toMatchObject({
        firstName: 'Ana',
        sourceUpdatedAt: new Date(UPDATED_AT),
      });
      expect(
        await prisma.syncState.findUniqueOrThrow({
          where: {
            tenantId_source_entity: {
              tenantId: TENANT_A,
              source: EDUPAY_SOURCE,
              entity: 'STUDENT',
            },
          },
        }),
      ).toMatchObject({ watermark: studentWatermark.watermark });
      expect(
        await prisma.syncItemResult.count({
          where: {
            tenantId: TENANT_A,
            code: 'SOURCE_COURSE_MAPPING_MISSING',
            resolvedAt: null,
          },
        }),
      ).toBe(1);
    });

    it('rejects wrong item tenant scope and consumer-detected duplicate identities without checkpointing', async () => {
      source.courses[0] = {
        ...source.courses[0]!,
        sourceTenantId: 'wrong-source-tenant',
      };
      const wrongTenant = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(wrongTenant.status).toBe('FAILED');
      expect(await prisma.course.count({ where: { tenantId: TENANT_A } })).toBe(
        0,
      );
      expect(
        await prisma.syncState.count({ where: { tenantId: TENANT_A } }),
      ).toBe(0);

      source.courses = [
        courseItem(COURSE_A, 'Primero A'),
        courseItem(COURSE_A, 'Duplicado'),
      ];
      const duplicate = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(duplicate.status).toBe('PARTIAL');
      expect(
        await prisma.syncItemResult.count({
          where: {
            tenantId: TENANT_A,
            code: 'SOURCE_DUPLICATE_INTEGRATION_ID',
          },
        }),
      ).toBe(2);
      expect(
        await prisma.syncState.count({
          where: { tenantId: TENANT_A, entity: 'COURSE' },
        }),
      ).toBe(0);
      expect(await prisma.course.count({ where: { tenantId: TENANT_A } })).toBe(
        0,
      );
    });

    it('requires two complete full reconciliations for absence and ignores incomplete snapshots', async () => {
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      const student = await prisma.student.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: STUDENT_A,
          },
        },
      });

      source.rejectSnapshotCompletion = true;
      source.courses = source.courses.filter(
        (entry) => entry.integrationId !== COURSE_A,
      );
      source.students = [];
      const incomplete = await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      expect(incomplete.status).toBe('FAILED');
      expect((await sourceCourse(COURSE_A)).consecutiveAbsences).toBe(0);
      expect(
        (
          await prisma.student.findUniqueOrThrow({
            where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
          })
        ).consecutiveAbsences,
      ).toBe(0);

      source.rejectSnapshotCompletion = false;
      const first = await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      expect(first.status).toBe('SUCCEEDED');
      expect((await sourceCourse(COURSE_A)).status).toBe('ACTIVE');
      expect((await sourceCourse(COURSE_A)).consecutiveAbsences).toBe(1);

      source.courses.push(courseItem(COURSE_A, 'Primero A'));
      source.students.push(studentItem(STUDENT_A, COURSE_A));
      await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      expect((await sourceCourse(COURSE_A)).consecutiveAbsences).toBe(0);

      source.courses = source.courses.filter(
        (entry) => entry.integrationId !== COURSE_A,
      );
      source.students = [];
      await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      await sync.execute(TENANT_A, 'FULL', 'MANUAL');
      expect((await sourceCourse(COURSE_A)).status).toBe('ARCHIVED');
      const absentStudent = await prisma.student.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT_A, id: student.id } },
      });
      expect(absentStudent.status).toBe('INACTIVE');
      expect(
        source.requests.some((entry) =>
          entry.url.includes('/snapshot/complete'),
        ),
      ).toBe(true);
    });

    it('quarantines mapping/manual conflicts, protects source-owned edits, and isolates status', async () => {
      await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      const student = await prisma.student.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: STUDENT_A,
          },
        },
      });
      await prisma.courseEnrollment.updateMany({
        where: {
          tenantId: TENANT_A,
          studentId: student.id,
          source: EDUPAY_SOURCE,
        },
        data: { status: 'INACTIVE' },
      });
      const manualCourse = await prisma.course.create({
        data: {
          tenantId: TENANT_A,
          academicYearId,
          label: 'Manual separado',
          status: 'ACTIVE',
        },
      });
      const manualEnrollment = await prisma.courseEnrollment.create({
        data: {
          tenantId: TENANT_A,
          studentId: student.id,
          courseId: manualCourse.id,
          source: 'MANUAL',
        },
      });
      const result = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
      expect(result.status).toBe('PARTIAL');
      expect(
        await prisma.syncItemResult.count({
          where: {
            tenantId: TENANT_A,
            code: 'MANUAL_ENROLLMENT_CONFLICT',
            resolvedAt: null,
          },
        }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.courseEnrollment.findUnique({
          where: {
            tenantId_id: { tenantId: TENANT_A, id: manualEnrollment.id },
          },
        }),
      ).toMatchObject({ status: 'ACTIVE', source: 'MANUAL' });

      const admin = await token(TENANT_A, 'admin-a', ['TENANT_ADMIN']);
      const sourceCourseRecord = await sourceCourse(COURSE_A);
      const courseEdit = await api(admin)
        .patch(`/api/v1/courses/${sourceCourseRecord.id}`)
        .send({ label: 'Cambio local prohibido' })
        .expect(409);
      expect(courseEdit.body.error.code).toBe('SOURCE_MANAGED_FIELD_CONFLICT');
      const studentEdit = await api(admin)
        .patch(`/api/v1/students/${student.id}`)
        .send({ firstName: 'Cambio local' })
        .expect(409);
      expect(studentEdit.body.error.code).toBe('SOURCE_MANAGED_FIELD_CONFLICT');
      await api(admin)
        .post(`/api/v1/students/${student.id}/inactivate`)
        .expect(409)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'SOURCE_MANAGED_FIELD_CONFLICT',
          );
        });
      await api(admin)
        .patch(`/api/v1/courses/${manualCourse.id}`)
        .send({ label: 'Manual editable' })
        .expect(200);
      await api(admin)
        .patch(`/api/v1/students/${student.id}`)
        .send({ email: 'owned-locally@example.test' })
        .expect(200);
      const status = await api(admin).get('/api/v1/sync/status').expect(200);
      expect(status.body).toMatchObject({
        source: EDUPAY_SOURCE,
        configured: true,
        configuration: { sourceTenantId: source.sourceTenantId },
      });
      expect(JSON.stringify(status.body)).not.toContain(source.token);
      expect(JSON.stringify(status.body)).not.toContain('watermark:');

      const otherAdmin = await token(TENANT_B, 'admin-b', ['TENANT_ADMIN']);
      const otherStatus = await api(otherAdmin)
        .get('/api/v1/sync/status')
        .expect(200);
      expect(otherStatus.body.configured).toBe(false);
      const systemAdmin = await token(TENANT_A, 'system', ['SYSTEM_ADMIN']);
      await api(systemAdmin).get('/api/v1/sync/status').expect(403);
    });

    it('uses a tenant/source database lease while allowing a different tenant lease', async () => {
      const privateSync = sync as unknown as {
        acquireLease(tenantId: string, runId: string): Promise<boolean>;
        releaseLease(tenantId: string, runId: string): Promise<void>;
      };
      const firstRun = randomUUID();
      const overlappingRun = randomUUID();
      const otherTenantRun = randomUUID();
      expect(await privateSync.acquireLease(TENANT_A, firstRun)).toBe(true);
      expect(await privateSync.acquireLease(TENANT_A, overlappingRun)).toBe(
        false,
      );
      expect(await privateSync.acquireLease(TENANT_B, otherTenantRun)).toBe(
        true,
      );
      await privateSync.releaseLease(TENANT_A, firstRun);
      await privateSync.releaseLease(TENANT_B, otherTenantRun);
    });

    it('renews the database lease by elapsed time while applying buffered items', async () => {
      const privateSync = sync as unknown as {
        acquireLease(tenantId: string, runId: string): Promise<boolean>;
        heartbeatNow(): number;
      };
      let monotonicMs = 0;
      const clock = vi
        .spyOn(privateSync, 'heartbeatNow')
        .mockImplementation(() => monotonicMs);
      const originalApplyCourse = syncItems.applyCourse.bind(syncItems);
      let applicationCount = 0;
      let competingLeaseAcquired: boolean | undefined;
      const apply = vi
        .spyOn(syncItems, 'applyCourse')
        .mockImplementation(async (context, item) => {
          if (applicationCount === 1) {
            const lease = await prisma.syncLease.findUniqueOrThrow({
              where: {
                tenantId_source: {
                  tenantId: TENANT_A,
                  source: EDUPAY_SOURCE,
                },
              },
            });
            expect(lease.lockedUntil.getTime() - Date.now()).toBeGreaterThan(
              45_000,
            );
            competingLeaseAcquired = await privateSync.acquireLease(
              TENANT_A,
              randomUUID(),
            );
          }
          const result = await originalApplyCourse(context, item);
          applicationCount += 1;
          if (applicationCount === 1) {
            await prisma.syncLease.update({
              where: {
                tenantId_source: {
                  tenantId: TENANT_A,
                  source: EDUPAY_SOURCE,
                },
              },
              data: { lockedUntil: new Date(Date.now() + 5_000) },
            });
            monotonicMs += 21_000;
          }
          return result;
        });

      try {
        const result = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
        expect(result.status).toBe('SUCCEEDED');
        expect(applicationCount).toBe(2);
        expect(competingLeaseAcquired).toBe(false);
        expect(
          await prisma.syncState.count({ where: { tenantId: TENANT_A } }),
        ).toBe(2);
      } finally {
        apply.mockRestore();
        clock.mockRestore();
      }
    });

    it('fails closed without a checkpoint when lease ownership is lost during item application', async () => {
      source.courses = [courseItem(COURSE_A, 'Primero A')];
      source.students = [];
      const privateSync = sync as unknown as { heartbeatNow(): number };
      let monotonicMs = 0;
      const clock = vi
        .spyOn(privateSync, 'heartbeatNow')
        .mockImplementation(() => monotonicMs);
      const originalApplyCourse = syncItems.applyCourse.bind(syncItems);
      const stolenRunId = randomUUID();
      const apply = vi
        .spyOn(syncItems, 'applyCourse')
        .mockImplementation(async (context, item) => {
          const result = await originalApplyCourse(context, item);
          await prisma.syncLease.update({
            where: {
              tenantId_source: {
                tenantId: TENANT_A,
                source: EDUPAY_SOURCE,
              },
            },
            data: {
              ownerRunId: stolenRunId,
              lockedUntil: new Date(Date.now() + 60_000),
            },
          });
          monotonicMs += 21_000;
          return result;
        });

      try {
        const result = await sync.execute(TENANT_A, 'INCREMENTAL', 'MANUAL');
        expect(result.status).toBe('FAILED');
        expect(
          await prisma.course.count({ where: { tenantId: TENANT_A } }),
        ).toBe(1);
        expect(
          await prisma.syncState.count({ where: { tenantId: TENANT_A } }),
        ).toBe(0);
        await expect(
          prisma.syncRun.findUniqueOrThrow({
            where: { tenantId_id: { tenantId: TENANT_A, id: result.runId } },
          }),
        ).resolves.toMatchObject({
          errorCode: 'SYNC_LEASE_LOST',
          watermarkAdvanced: false,
        });
      } finally {
        apply.mockRestore();
        clock.mockRestore();
      }
    });

    function setDefaultSourceRows(): void {
      source.courses = [
        courseItem(COURSE_A, 'Primero A'),
        courseItem(COURSE_B, 'Segundo B'),
      ];
      source.students = [studentItem(STUDENT_A, COURSE_A)];
    }

    async function sourceCourse(integrationId: string) {
      return prisma.course.findUniqueOrThrow({
        where: {
          tenantId_source_externalReference: {
            tenantId: TENANT_A,
            source: EDUPAY_SOURCE,
            externalReference: integrationId,
          },
        },
      });
    }

    function api(accessToken: string) {
      const server = application.getHttpServer();
      return {
        get: (path: string) =>
          request(server).get(path).auth(accessToken, { type: 'bearer' }),
        patch: (path: string) =>
          request(server).patch(path).auth(accessToken, { type: 'bearer' }),
        post: (path: string) =>
          request(server).post(path).auth(accessToken, { type: 'bearer' }),
      };
    }

    async function activeSourceEnrollmentCount(studentId: string) {
      return prisma.courseEnrollment.count({
        where: {
          tenantId: TENANT_A,
          studentId,
          source: EDUPAY_SOURCE,
          status: 'ACTIVE',
        },
      });
    }

    async function token(
      tenantId: string,
      identityUserId: string,
      roles: Array<'SYSTEM_ADMIN' | 'TENANT_ADMIN'>,
    ): Promise<string> {
      return identity.sign({
        membership_id: `membership-${identityUserId}`,
        roles,
        sid: `session-${identityUserId}`,
        sub: identityUserId,
        tenant_id: tenantId,
      });
    }

    async function cleanDatabase(): Promise<void> {
      await prisma.syncFullPresence.deleteMany();
      await prisma.syncItemResult.deleteMany();
      await prisma.syncLease.deleteMany();
      await prisma.syncRun.deleteMany();
      await prisma.syncState.deleteMany();
      await prisma.syncConfiguration.deleteMany();
      await prisma.inAppNotification.deleteMany();
      await prisma.notificationDelivery.deleteMany();
      await prisma.notificationEvent.deleteMany();
      await prisma.review.deleteMany();
      await prisma.fileReference.deleteMany();
      await prisma.fileObject.deleteMany();
      await prisma.uploadIntent.deleteMany();
      await prisma.blobDerivative.deleteMany();
      await prisma.submissionRevision.deleteMany();
      await prisma.submission.deleteMany();
      await prisma.storedBlob.deleteMany();
      await prisma.storageUsageAccount.deleteMany();
      await prisma.storageQuotaPolicy.deleteMany();
      await prisma.learningItem.deleteMany();
      await prisma.learningUnit.deleteMany();
      await prisma.courseSubjectTeacher.deleteMany();
      await prisma.studentSubjectEnrollment.deleteMany();
      await prisma.courseEnrollment.deleteMany();
      await prisma.courseSubject.deleteMany();
      await prisma.subject.deleteMany();
      await prisma.teacher.deleteMany();
      await prisma.student.deleteMany();
      await prisma.course.deleteMany();
      await prisma.academicYear.deleteMany();
      await prisma.tenant.deleteMany();
    }
  });

function courseItem(integrationId: string, name: string) {
  return {
    integrationId,
    sourceTenantId: 'colegio-conquistadores',
    name,
    updatedAt: UPDATED_AT,
    deletedAt: null,
  };
}

function studentItem(integrationId: string, courseIntegrationId: string) {
  return {
    integrationId,
    sourceTenantId: 'colegio-conquistadores',
    firstName: 'Ana',
    lastName: 'Pérez',
    status: 'ACTIVE' as const,
    courseIntegrationId,
    updatedAt: UPDATED_AT,
    deletedAt: null,
  };
}
