import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/persistence/prisma.service';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service';
import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../src/academic/academic-audit.port';
import {
  IDENTITY_SESSION_STATUS_ADAPTER,
  type IdentitySessionStatusAdapter,
} from '../src/identity/identity-adapter.port';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(testDatabaseUrl)('Academic notifications (PostgreSQL e2e)', () => {
  const fixture = new IdentityJwksFixture();
  const audit: AcademicAuditPort = { record: () => Promise.resolve() };
  const identityStatus: IdentitySessionStatusAdapter = {
    checkSessionStatus(input) {
      return Promise.resolve({
        active: true,
        identityUserId: input.identityUserId,
        membershipActive: true,
        membershipId: input.membershipId,
        sessionActive: true,
        sessionId: input.sessionId,
        tenantId: input.tenantId,
      });
    },
  };
  let application: INestApplication;
  let prisma: PrismaService;
  let worker: NotificationWorkerService;

  beforeAll(async () => {
    await fixture.start();
    for (const [key, value] of Object.entries(fixture.environment())) vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);
    const { AppModule } = await import('../src/app.module');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACADEMIC_AUDIT_PORT)
      .useValue(audit)
      .overrideProvider(IDENTITY_SESSION_STATUS_ADAPTER)
      .useValue(identityStatus)
      .compile();
    application = testingModule.createNestApplication();
    configureApplication(application);
    await application.init();
    prisma = application.get(PrismaService);
    worker = application.get(NotificationWorkerService);
  });

  beforeEach(async () => {
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
    await prisma.contentRevision.deleteMany();
    await prisma.learningItemDraft.deleteMany();
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
    await prisma.syncFullPresence.deleteMany();
    await prisma.syncItemResult.deleteMany();
    await prisma.syncLease.deleteMany();
    await prisma.syncRun.deleteMany();
    await prisma.syncState.deleteMany();
    await prisma.syncConfiguration.deleteMany();
    await prisma.academicYear.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await application?.close();
    await fixture.close();
    vi.unstubAllEnvs();
  });

  it('creates tenant-isolated publication intents, handles scheduled delivery once, and exposes current-user API state', async () => {
    const tenantId = 'notifications-a';
    const admin = await token(tenantId, 'admin', ['TENANT_ADMIN']);
    const structure = await createStructure(admin, '5° A', 'Lenguaje');
    const teacher = await post(admin, '/api/v1/teachers', {
      firstName: 'Camila',
      lastName: 'Docente',
      email: 'camila@example.test',
    });
    const enrolled = await post(admin, '/api/v1/students', {
      firstName: 'Sofía',
      lastName: 'Inscrita',
      email: 'sofia@example.test',
    });
    const direct = await post(admin, '/api/v1/students', {
      firstName: 'Diego',
      lastName: 'Directo',
      email: 'diego@example.test',
    });
    const unrelated = await post(admin, '/api/v1/students', {
      firstName: 'No',
      lastName: 'Inscrito',
      email: 'no@example.test',
    });
    await prisma.teacher.update({
      where: { tenantId_id: { tenantId, id: teacher.id } },
      data: { identityUserId: 'teacher-notifications' },
    });
    await prisma.student.update({
      where: { tenantId_id: { tenantId, id: enrolled.id } },
      data: { identityUserId: 'student-enrolled' },
    });
    await prisma.student.update({
      where: { tenantId_id: { tenantId, id: direct.id } },
      data: { identityUserId: 'student-direct' },
    });
    await prisma.student.update({
      where: { tenantId_id: { tenantId, id: unrelated.id } },
      data: { identityUserId: 'student-unrelated' },
    });
    await post(admin, '/api/v1/course-subject-teachers', {
      courseSubjectId: structure.courseSubject.id,
      teacherIds: [teacher.id],
    });
    await post(admin, '/api/v1/course-enrollments', {
      studentId: enrolled.id,
      courseId: structure.course.id,
    });

    const directSubject = await post(admin, '/api/v1/subjects', { name: 'Apoyo' });
    const directCourseSubject = await post(admin, '/api/v1/course-subjects', {
      courseId: structure.course.id,
      subjectId: directSubject.id,
      defaultForCourse: false,
    });
    await post(admin, '/api/v1/course-subject-teachers', {
      courseSubjectId: directCourseSubject.id,
      teacherIds: [teacher.id],
    });
    await post(admin, '/api/v1/student-subject-enrollments', {
      studentId: direct.id,
      courseSubjectId: directCourseSubject.id,
    });

    const teacherToken = await token(tenantId, 'teacher-notifications', ['TEACHER']);
    const studentToken = await token(tenantId, 'student-enrolled', ['STUDENT']);
    const unit = await post(teacherToken, '/api/v1/learning-units', {
      courseSubjectId: structure.courseSubject.id,
      title: 'Unidad',
    });
    await patch(teacherToken, `/api/v1/learning-units/${unit.id}`, { status: 'ACTIVE' });
    const assignment = await post(teacherToken, `/api/v1/learning-units/${unit.id}/items`, {
      type: 'ASSIGNMENT',
      title: 'Ensayo',
      instructions: 'Sube tu trabajo.',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await post(teacherToken, `/api/v1/learning-items/${assignment.id}/publish`, {});

    const directUnit = await post(teacherToken, '/api/v1/learning-units', {
      courseSubjectId: directCourseSubject.id,
      title: 'Apoyo',
    });
    await patch(teacherToken, `/api/v1/learning-units/${directUnit.id}`, { status: 'ACTIVE' });
    const directAssignment = await post(teacherToken, `/api/v1/learning-units/${directUnit.id}/items`, {
      type: 'ASSIGNMENT',
      title: 'Trabajo directo',
      instructions: 'Entrega el documento.',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await post(teacherToken, `/api/v1/learning-items/${directAssignment.id}/publish`, {});

    expect(await prisma.notificationEvent.count({ where: { tenantId } })).toBe(2);
    expect(await prisma.notificationDelivery.count({ where: { tenantId, channel: 'EMAIL' } })).toBe(2);
    expect(await prisma.inAppNotification.count({ where: { tenantId } })).toBe(2);
    expect((await api(studentToken).get('/api/v1/notifications?limit=1').expect(200)).body.items).toHaveLength(1);
    const page = await api(studentToken).get('/api/v1/notifications?limit=10').expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].type).toBe('ASSIGNMENT_PUBLISHED');
    expect(page.body.items[0].targetPath).toBe(
      `/estudiante/asignaturas/${structure.courseSubject.id}/items/${assignment.id}`,
    );

    const emailBefore = await prisma.notificationDelivery.count({ where: { tenantId, channel: 'EMAIL', status: 'PENDING' } });
    expect(emailBefore).toBe(2);
    const concurrentRuns = await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(concurrentRuns.reduce((total, result) => total + result.claimed, 0)).toBe(2);
    expect(await prisma.notificationDelivery.count({ where: { tenantId, channel: 'EMAIL', status: 'DELIVERED' } })).toBe(2);

    const notificationId = page.body.items[0].id as string;
    await api(studentToken).patch(`/api/v1/notifications/${notificationId}/read`).expect(200);
    expect((await api(studentToken).get('/api/v1/notifications/unread-count').expect(200)).body.count).toBe(0);
    await api(await token('notifications-b', 'other', ['STUDENT']))
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .expect(404);
    await api(await token(tenantId, 'system', ['SYSTEM_ADMIN']))
      .get('/api/v1/notifications')
      .expect(403);

    const scheduled = await post(teacherToken, `/api/v1/learning-units/${unit.id}/items`, {
      type: 'ASSESSMENT',
      title: 'Prueba programada',
      instructions: 'Responde el documento.',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await post(teacherToken, `/api/v1/learning-items/${scheduled.id}/schedule`, {
      publishAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(await prisma.notificationEvent.count({ where: { tenantId, aggregateId: scheduled.id } })).toBe(0);
    await prisma.learningItem.update({
      where: { tenantId_id: { tenantId, id: scheduled.id } },
      data: { publishAt: new Date(Date.now() - 1_000) },
    });
    await worker.runOnce();
    await worker.runOnce();
    expect(await prisma.notificationEvent.count({ where: { tenantId, aggregateId: scheduled.id } })).toBe(1);
    expect(await prisma.notificationDelivery.count({ where: { tenantId, event: { aggregateId: scheduled.id } } })).toBe(2);
  });

  function api(accessToken: string) {
    const server = application.getHttpServer();
    return {
      get: (path: string) => request(server).get(path).auth(accessToken, { type: 'bearer' }),
      patch: (path: string) => request(server).patch(path).auth(accessToken, { type: 'bearer' }),
      post: (path: string) => request(server).post(path).auth(accessToken, { type: 'bearer' }),
    };
  }

  async function post(accessToken: string, path: string, body: object) {
    return (await api(accessToken).post(path).send(body).expect(201)).body;
  }

  async function patch(accessToken: string, path: string, body: object) {
    return (await api(accessToken).patch(path).send(body).expect(200)).body;
  }

  async function token(
    tenantId: string,
    identityUserId: string,
    roles: Array<'SYSTEM_ADMIN' | 'TENANT_ADMIN' | 'TEACHER' | 'STUDENT'>,
  ): Promise<string> {
    return fixture.sign({
      membership_id: `membership-${tenantId}-${identityUserId}`,
      roles,
      sid: `session-${tenantId}-${identityUserId}`,
      sub: identityUserId,
      tenant_id: tenantId,
    });
  }

  async function createStructure(accessToken: string, courseLabel: string, subjectName: string) {
    const year = await post(accessToken, '/api/v1/academic-years', {
      label: `2026-${courseLabel}`,
      startDate: '2026-03-01',
      endDate: '2026-12-20',
    });
    await patch(accessToken, `/api/v1/academic-years/${year.id}`, { status: 'ACTIVE' });
    const course = await post(accessToken, '/api/v1/courses', {
      academicYearId: year.id,
      label: courseLabel,
      status: 'ACTIVE',
    });
    const subject = await post(accessToken, '/api/v1/subjects', { name: subjectName });
    const courseSubject = await post(accessToken, '/api/v1/course-subjects', {
      courseId: course.id,
      subjectId: subject.id,
      defaultForCourse: true,
    });
    return { course, courseSubject };
  }
});
