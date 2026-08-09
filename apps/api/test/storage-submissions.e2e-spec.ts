import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../src/academic/academic-audit.port';
import {
  IDENTITY_SESSION_STATUS_ADAPTER,
  type IdentitySessionStatusAdapter,
} from '../src/identity/identity-adapter.port';
import { PrismaService } from '../src/persistence/prisma.service';
import { configureApplication } from '../src/bootstrap/configure-application';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(testDatabaseUrl)('Storage and submissions (PostgreSQL e2e)', () => {
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
  let storageRoot: string;

  beforeAll(async () => {
    await fixture.start();
    storageRoot = await mkdtemp(`${tmpdir()}\\edupay-storage-e2e-`);
    for (const [key, value] of Object.entries(fixture.environment())) vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);
    vi.stubEnv('STORAGE_ROOT', storageRoot);
    vi.stubEnv('STORAGE_MIN_FREE_BYTES', '0');
    vi.stubEnv('STORAGE_MIN_FREE_PERCENTAGE', '0');
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
  });

  beforeEach(async () => {
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
  });

  afterAll(async () => {
    await application.close();
    await fixture.close();
    await rm(storageRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('keeps storage private, deduplicates only within a tenant, and reauthorizes downloads', async () => {
    const admin = await token('storage-a', 'admin', ['TENANT_ADMIN']);
    const setup = await createDeliverable(admin, 'storage-a', 'teacher-storage', 'student-storage');
    const bytes = Buffer.from('%PDF-storage-evidence');
    const upload = {
      filename: 'guide.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      contentBase64: bytes.toString('base64'),
      purpose: 'ASSIGNMENT_SOURCE',
    };
    const first = await post(setup.teacherToken, `/api/v1/learning-items/${setup.item.id}/attachments`, upload);
    const second = await post(setup.teacherToken, `/api/v1/learning-items/${setup.item.id}/attachments`, {
      ...upload,
      filename: 'guide-copy.pdf',
    });
    expect(first.id).not.toBe(second.id);
    expect(await prisma.storedBlob.count({ where: { tenantId: 'storage-a' } })).toBe(1);
    expect(await prisma.fileObject.count({ where: { tenantId: 'storage-a' } })).toBe(2);
    await api(setup.studentToken).get(`/api/v1/files/${first.id}/download`).expect(200);
    await api(setup.studentToken).post(`/api/v1/learning-items/${setup.item.id}/submission`).send({
      files: [{ filename: 'work.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length, contentBase64: bytes.toString('base64') }],
    }).expect(201);
    const tenantB = await token('storage-b', 'other', ['TENANT_ADMIN']);
    await api(tenantB).get(`/api/v1/files/${first.id}/download`).expect(403);
    await prisma.storageQuotaPolicy.updateMany({
      where: { scopeKey: { in: ['GLOBAL', 'TENANT:storage-a'] } },
      data: { quotaBytes: 1n },
    });
    await api(setup.teacherToken).post(`/api/v1/learning-items/${setup.item.id}/attachments`).send({
      ...upload,
      filename: 'quota.pdf',
    }).expect(400);
    const tenantUsage = await prisma.storageUsageAccount.findUniqueOrThrow({ where: { scopeKey: 'TENANT:storage-a' } });
    expect(tenantUsage.reservedBytes).toBe(0n);
    await api(setup.studentToken).get(`/api/v1/files/${first.id}/download`).expect(200);
    await api(setup.teacherToken).post(`/api/v1/learning-items/${setup.item.id}/attachments`).send({
      ...upload,
      filename: 'bad.pdf',
      mimeType: 'image/png',
    }).expect(400);
  });

  it('preserves late revision evidence, enables only requested corrections, and blocks reviewed resubmission', async () => {
    const admin = await token('submission-a', 'admin', ['TENANT_ADMIN']);
    const setup = await createDeliverable(admin, 'submission-a', 'teacher-review', 'student-review');
    const pdf = (name: string) => {
      const bytes = Buffer.from('%PDF-submission');
      return {
        filename: name,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        contentBase64: bytes.toString('base64'),
      };
    };
    const createdResponse = await api(setup.studentToken)
      .post(`/api/v1/learning-items/${setup.item.id}/submission`)
      .send({ files: [pdf('first.pdf'), pdf('second.pdf')], studentComment: 'Please review' })
      .expect(201);
    const created = createdResponse.body;
    expect(created.status).toBe('SUBMITTED');
    expect(created.revisions[0].isLate).toBe(true);
    expect(created.revisions[0].files).toHaveLength(2);
    await api(admin).get(`/api/v1/learning-items/${setup.item.id}/submissions`).expect(200);
    await api(await token('submission-a', 'unrelated-student', ['STUDENT']))
      .get(`/api/v1/submissions/${created.id}`)
      .expect(403);
    await api(await token('submission-a', 'unrelated-teacher', ['TEACHER']))
      .get(`/api/v1/submissions/${created.id}`)
      .expect(403);
    const dueAt = created.revisions[0].effectiveDueAt;
    await prisma.learningItem.update({
      where: { tenantId_id: { tenantId: 'submission-a', id: setup.item.id } },
      data: { dueAt: new Date(Date.now() + 86_400_000) },
    });
    const unchanged = await api(setup.studentToken).get(`/api/v1/submissions/${created.id}`).expect(200);
    expect(unchanged.body.revisions[0].effectiveDueAt).toBe(dueAt);
    await api(setup.teacherToken)
      .post(`/api/v1/submission-revisions/${created.revisions[0].id}/reviews`)
      .send({ action: 'CHANGES_REQUESTED', comment: 'Please correct the document.' })
      .expect(201);
    const revisedResponse = await api(setup.studentToken)
      .post(`/api/v1/submissions/${created.id}/revisions`)
      .send({ files: [pdf('corrected.pdf')] })
      .expect(201);
    const revised = revisedResponse.body;
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0].files[0].id).not.toBe(revised.revisions[1].files[0].id);
    await api(setup.teacherToken)
      .post(`/api/v1/submission-revisions/${revised.revisions[1].id}/reviews`)
      .send({ action: 'REVIEWED', comment: 'Reviewed.' })
      .expect(201);
    await api(setup.studentToken)
      .post(`/api/v1/submissions/${created.id}/revisions`)
      .send({ files: [pdf('too-late.pdf')] })
      .expect(409);
    const material = await post(setup.teacherToken, `/api/v1/learning-units/${setup.unit.id}/items`, {
      type: 'MATERIAL',
      title: 'Read only',
    });
    await api(setup.teacherToken).post(`/api/v1/learning-items/${material.id}/publish`).send({}).expect(201);
    await api(setup.studentToken)
      .post(`/api/v1/learning-items/${material.id}/submission`)
      .send({ files: [pdf('material.pdf')] })
      .expect(409);
    await api(await token('submission-a', 'system', ['SYSTEM_ADMIN']))
      .get(`/api/v1/submissions/${created.id}`)
      .expect(403);
  });

  function api(accessToken: string) {
    const server = application.getHttpServer();
    return {
      get: (path: string) => request(server).get(path).auth(accessToken, { type: 'bearer' }),
      post: (path: string) => request(server).post(path).auth(accessToken, { type: 'bearer' }),
    };
  }

  async function post(accessToken: string, path: string, body: object) {
    return (await api(accessToken).post(path).send(body).expect(201)).body;
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

  async function createDeliverable(
    admin: string,
    tenantId: string,
    teacherIdentity: string,
    studentIdentity: string,
  ) {
    const year = await post(admin, '/api/v1/academic-years', {
      label: `2026-${tenantId}`,
      startDate: '2026-03-01',
      endDate: '2026-12-20',
    });
    await request(application.getHttpServer()).patch(`/api/v1/academic-years/${year.id}`).auth(admin, { type: 'bearer' }).send({ status: 'ACTIVE' }).expect(200);
    const course = await post(admin, '/api/v1/courses', { academicYearId: year.id, label: `Course ${tenantId}`, status: 'ACTIVE' });
    const subject = await post(admin, '/api/v1/subjects', { name: `Subject ${tenantId}` });
    const courseSubject = await post(admin, '/api/v1/course-subjects', { courseId: course.id, subjectId: subject.id });
    const teacher = await post(admin, '/api/v1/teachers', { firstName: 'Teacher', lastName: tenantId });
    const student = await post(admin, '/api/v1/students', { firstName: 'Student', lastName: tenantId });
    await prisma.teacher.update({ where: { tenantId_id: { tenantId, id: teacher.id } }, data: { identityUserId: teacherIdentity } });
    await prisma.student.update({ where: { tenantId_id: { tenantId, id: student.id } }, data: { identityUserId: studentIdentity } });
    await post(admin, '/api/v1/course-subject-teachers', { courseSubjectId: courseSubject.id, teacherIds: [teacher.id] });
    await post(admin, '/api/v1/course-enrollments', { studentId: student.id, courseId: course.id });
    const teacherToken = await token(tenantId, teacherIdentity, ['TEACHER']);
    const studentToken = await token(tenantId, studentIdentity, ['STUDENT']);
    const unit = await post(teacherToken, '/api/v1/learning-units', { courseSubjectId: courseSubject.id, title: 'Assignments' });
    await request(application.getHttpServer()).patch(`/api/v1/learning-units/${unit.id}`).auth(teacherToken, { type: 'bearer' }).send({ status: 'ACTIVE' }).expect(200);
    const item = await post(teacherToken, `/api/v1/learning-units/${unit.id}/items`, {
      type: 'ASSIGNMENT',
      title: 'Deliverable',
      instructions: 'Upload the work.',
      dueAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await api(teacherToken).post(`/api/v1/learning-items/${item.id}/publish`).send({}).expect(201);
    return { item, unit, teacherToken, studentToken };
  }
});
