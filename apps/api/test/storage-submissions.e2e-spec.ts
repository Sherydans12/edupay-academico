import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { MAX_FILE_SIZE_BYTES } from '../src/storage/file-validation';
import {
  FAKE_INFECTED_MARKER,
  FAKE_TIMEOUT_MARKER,
} from '../src/storage/fake-malware-scanner.adapter';
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
    storageRoot = await mkdtemp(join(tmpdir(), 'edupay-storage-e2e-'));
    for (const [key, value] of Object.entries(fixture.environment())) vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);
    vi.stubEnv('STORAGE_ROOT', storageRoot);
    vi.stubEnv('STORAGE_TEMP_ROOT', join(storageRoot, 'tmp'));
    vi.stubEnv('STORAGE_MIN_FREE_BYTES', '0');
    vi.stubEnv('STORAGE_MIN_FREE_PERCENTAGE', '0');
    vi.stubEnv('ACADEMIC_MALWARE_SCANNER', 'fake');
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
    await application.close();
    await fixture.close();
    await rm(storageRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('uses metadata-only intents, bounded multipart transfer, quota conversion, and private tenant-local deduplication', async () => {
    const admin = await token('storage-a', 'admin', ['TENANT_ADMIN']);
    const setup = await createDeliverable(admin, 'storage-a', 'teacher-storage', 'student-storage');
    const bytes = Buffer.from('%PDF-storage-evidence');
    const base64Body = {
      parentType: 'LEARNING_ITEM',
      parentId: setup.item.id,
      category: 'ASSIGNMENT_SOURCE',
      filename: 'guide.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      contentBase64: bytes.toString('base64'),
    };
    await api(setup.teacherToken)
      .post('/api/v1/file-upload-intents')
      .send(base64Body)
      .expect(400);

    const intent = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'guide.pdf',
      bytes,
    );
    const reservedBeforeTransfer = await prisma.storageUsageAccount.findUniqueOrThrow({
      where: { scopeKey: 'TENANT:storage-a' },
    });
    expect(reservedBeforeTransfer.reservedBytes).toBe(BigInt(bytes.length));
    expect(reservedBeforeTransfer.usedBytes).toBe(0n);

    const first = await transfer(setup.teacherToken, intent.id, 'guide.pdf', bytes);
    const afterTransfer = await prisma.storageUsageAccount.findUniqueOrThrow({
      where: { scopeKey: 'TENANT:storage-a' },
    });
    expect(afterTransfer.reservedBytes).toBe(0n);
    expect(afterTransfer.usedBytes).toBe(BigInt(bytes.length));
    const firstBlob = await prisma.storedBlob.findFirstOrThrow({
      where: { tenantId: 'storage-a' },
    });
    expect(firstBlob.scanStatus).toBe('CLEAR');
    await prisma.storedBlob.update({
      where: { tenantId_id: { tenantId: 'storage-a', id: firstBlob.id } },
      data: { scanStatus: 'NOT_SCANNED' },
    });
    await api(setup.studentToken).get(`/api/v1/files/${first.id}/download`).expect(403);
    await prisma.storedBlob.update({
      where: { tenantId_id: { tenantId: 'storage-a', id: firstBlob.id } },
      data: { scanStatus: 'CLEAR' },
    });

    const secondIntent = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'guide-copy.pdf',
      bytes,
    );
    const second = await transfer(setup.teacherToken, secondIntent.id, 'guide-copy.pdf', bytes);
    expect(first.id).not.toBe(second.id);
    expect(await prisma.storedBlob.count({ where: { tenantId: 'storage-a' } })).toBe(1);
    expect(await prisma.fileObject.count({ where: { tenantId: 'storage-a' } })).toBe(2);
    await api(setup.studentToken).get(`/api/v1/files/${first.id}/download`).expect(200);

    const otherActor = await token('storage-a', 'unassigned-teacher', ['TEACHER']);
    const actorIntent = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'actor.pdf',
      bytes,
    );
    await api(otherActor)
      .post(`/api/v1/file-upload-intents/${actorIntent.id}/content`)
      .attach('file', bytes, { filename: 'actor.pdf', contentType: 'application/pdf' })
      .expect(403);
    await api(await token('storage-b', 'other', ['TENANT_ADMIN']))
      .post(`/api/v1/file-upload-intents/${actorIntent.id}/content`)
      .attach('file', bytes, { filename: 'actor.pdf', contentType: 'application/pdf' })
      .expect(403);
    await transfer(setup.teacherToken, actorIntent.id, 'actor.pdf', bytes);

    await prisma.storageQuotaPolicy.updateMany({
      where: { scopeKey: { in: ['GLOBAL', 'TENANT:storage-a'] } },
      data: { quotaBytes: 1n },
    });
    await api(setup.teacherToken)
      .post('/api/v1/file-upload-intents')
      .send({
        parentType: 'LEARNING_ITEM',
        parentId: setup.item.id,
        category: 'ASSIGNMENT_SOURCE',
        filename: 'quota.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
      })
      .expect(400);
  });

  it('expires intents, rejects oversized multipart payloads, and cleans failed transfer staging', async () => {
    const admin = await token('hardening-a', 'admin', ['TENANT_ADMIN']);
    const setup = await createDeliverable(admin, 'hardening-a', 'teacher-hardening', 'student-hardening');
    const bytes = Buffer.from('%PDF-hardening');
    const expired = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'expired.pdf',
      bytes,
    );
    await prisma.uploadIntent.update({
      where: { tenantId_id: { tenantId: 'hardening-a', id: expired.id } },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await api(setup.teacherToken)
      .post(`/api/v1/file-upload-intents/${expired.id}/content`)
      .attach('file', bytes, { filename: 'expired.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect((await prisma.uploadIntent.findUniqueOrThrow({ where: { tenantId_id: { tenantId: 'hardening-a', id: expired.id } } })).status).toBe('EXPIRED');
    expect((await prisma.storageUsageAccount.findUniqueOrThrow({ where: { scopeKey: 'TENANT:hardening-a' } })).reservedBytes).toBe(0n);

    const oversized = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'oversized.pdf',
      bytes,
    );
    const oversizedBytes = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 65);
    Buffer.from('%PDF-').copy(oversizedBytes);
    await api(setup.teacherToken)
      .post(`/api/v1/file-upload-intents/${oversized.id}/content`)
      .attach('file', oversizedBytes, { filename: 'oversized.pdf', contentType: 'application/pdf' })
      .expect(413);
    expect((await prisma.uploadIntent.findUniqueOrThrow({ where: { tenantId_id: { tenantId: 'hardening-a', id: oversized.id } } })).status).toBe('FAILED');
    expect((await prisma.storageUsageAccount.findUniqueOrThrow({ where: { scopeKey: 'TENANT:hardening-a' } })).reservedBytes).toBe(0n);

    const invalid = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'invalid.pdf',
      bytes,
    );
    await api(setup.teacherToken)
      .post(`/api/v1/file-upload-intents/${invalid.id}/content`)
      .attach('file', Buffer.from('not a pdf'), { filename: 'invalid.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect((await prisma.uploadIntent.findUniqueOrThrow({ where: { tenantId_id: { tenantId: 'hardening-a', id: invalid.id } } })).status).toBe('FAILED');
    expect((await prisma.storageUsageAccount.findUniqueOrThrow({ where: { scopeKey: 'TENANT:hardening-a' } })).reservedBytes).toBe(0n);
    await expect(readdir(`${storageRoot}\\tmp`)).resolves.toEqual([]);

    const infected = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'infected.pdf',
      Buffer.concat([Buffer.from('%PDF-'), FAKE_INFECTED_MARKER]),
    );
    const infectedResponse = await api(setup.teacherToken)
      .post(`/api/v1/file-upload-intents/${infected.id}/content`)
      .attach(
        'file',
        Buffer.concat([Buffer.from('%PDF-'), FAKE_INFECTED_MARKER]),
        { filename: 'infected.pdf', contentType: 'application/pdf' },
      );
    expect(infectedResponse.status).toBe(400);
    expect(infectedResponse.body.error.code).toBe('MALWARE_DETECTED');
    expect(
      (await prisma.uploadIntent.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: 'hardening-a', id: infected.id } },
      })).status,
    ).toBe('FAILED');
    expect(await prisma.storedBlob.count({ where: { tenantId: 'hardening-a' } })).toBe(0);
    expect(await prisma.fileObject.count({ where: { tenantId: 'hardening-a' } })).toBe(0);

    const timedOutBytes = Buffer.concat([Buffer.from('%PDF-'), FAKE_TIMEOUT_MARKER]);
    const timedOut = await createIntentOnly(
      setup.teacherToken,
      setup.item.id,
      'ASSIGNMENT_SOURCE',
      'timeout.pdf',
      timedOutBytes,
    );
    const timedOutResponse = await api(setup.teacherToken)
      .post(`/api/v1/file-upload-intents/${timedOut.id}/content`)
      .attach('file', timedOutBytes, { filename: 'timeout.pdf', contentType: 'application/pdf' });
    expect(timedOutResponse.status).toBe(503);
    expect(timedOutResponse.body.error.code).toBe('MALWARE_SCAN_TIMEOUT');
    expect(
      (await prisma.storageUsageAccount.findUniqueOrThrow({
        where: { scopeKey: 'TENANT:hardening-a' },
      })).reservedBytes,
    ).toBe(0n);
    await expect(readdir(`${storageRoot}\\tmp`)).resolves.toEqual([]);
  });

  it('accepts only separately finalized authorized student files and preserves immutable revision semantics', async () => {
    const admin = await token('submission-a', 'admin', ['TENANT_ADMIN']);
    const setup = await createDeliverable(admin, 'submission-a', 'teacher-review', 'student-review');
    const pdf = (name: string) => Buffer.from(`%PDF-${name}`);
    const firstFile = await uploadStudentFile(setup.studentToken, setup.item.id, 'first.pdf', pdf('first'));
    const secondFile = await uploadStudentFile(setup.studentToken, setup.item.id, 'second.pdf', pdf('second'));

    const arbitrary = await api(setup.studentToken)
      .post(`/api/v1/learning-items/${setup.item.id}/submission`)
      .send({ fileObjectIds: ['00000000-0000-4000-8000-000000000099'] })
      .expect(403);
    expect(arbitrary.body.error.code).toBe('FORBIDDEN');

    const createdResponse = await api(setup.studentToken)
      .post(`/api/v1/learning-items/${setup.item.id}/submission`)
      .send({ fileObjectIds: [firstFile.id, secondFile.id], studentComment: 'Please review' })
      .expect(201);
    const created = createdResponse.body;
    expect(created.status).toBe('SUBMITTED');
    expect(created.revisions[0].isLate).toBe(true);
    expect(created.revisions[0].files).toHaveLength(2);
    expect(
      await prisma.notificationEvent.count({
        where: { tenantId: 'submission-a', eventType: 'SUBMISSION_RECEIVED' },
      }),
    ).toBe(1);
    expect(
      await prisma.notificationDelivery.count({
        where: {
          tenantId: 'submission-a',
          channel: 'IN_APP',
          status: 'DELIVERED',
          event: { eventType: 'SUBMISSION_RECEIVED' },
        },
      }),
    ).toBe(1);
    const receivedEvent = await prisma.notificationEvent.findFirst({
      where: { tenantId: 'submission-a', eventType: 'SUBMISSION_RECEIVED' },
    });
    expect(receivedEvent?.payload).toMatchObject({
      targetPath: `/docente/revisiones/${created.id}`,
    });

    await api(setup.teacherToken)
      .post(`/api/v1/submission-revisions/${created.revisions[0].id}/reviews`)
      .send({ action: 'COMMENTED', comment: 'A note without state change.' })
      .expect(201);
    expect(
      await prisma.notificationEvent.count({
        where: { tenantId: 'submission-a', aggregateType: 'Review' },
      }),
    ).toBe(0);

    const otherStudent = await post(admin, '/api/v1/students', { firstName: 'Other', lastName: 'Student' });
    await prisma.student.update({
      where: { tenantId_id: { tenantId: 'submission-a', id: otherStudent.id } },
      data: { identityUserId: 'other-student' },
    });
    await post(admin, '/api/v1/course-enrollments', { studentId: otherStudent.id, courseId: setup.course.id });
    const otherStudentToken = await token('submission-a', 'other-student', ['STUDENT']);
    await api(otherStudentToken)
      .post(`/api/v1/learning-items/${setup.item.id}/submission`)
      .send({ fileObjectIds: [firstFile.id] })
      .expect(403);

    await api(setup.teacherToken)
      .post(`/api/v1/submission-revisions/${created.revisions[0].id}/reviews`)
      .send({ action: 'CHANGES_REQUESTED', comment: 'Please correct the document.' })
      .expect(201);
    expect(
      await prisma.notificationEvent.count({
        where: { tenantId: 'submission-a', eventType: 'CHANGES_REQUESTED' },
      }),
    ).toBe(1);
    const changesRequestedEvent = await prisma.notificationEvent.findFirst({
      where: { tenantId: 'submission-a', eventType: 'CHANGES_REQUESTED' },
    });
    expect(changesRequestedEvent?.payload).toMatchObject({
      targetPath: `/estudiante/asignaturas/${setup.item.courseSubjectId}/items/${setup.item.id}`,
    });
    expect(
      await prisma.notificationDelivery.count({
        where: {
          tenantId: 'submission-a',
          channel: 'EMAIL',
          status: 'PENDING',
          event: { eventType: 'CHANGES_REQUESTED' },
        },
      }),
    ).toBe(1);
    const revisedFile = await uploadStudentFile(setup.studentToken, setup.item.id, 'corrected.pdf', pdf('corrected'));
    const revised = (await api(setup.studentToken)
      .post(`/api/v1/submissions/${created.id}/revisions`)
      .send({ fileObjectIds: [revisedFile.id] })
      .expect(201)).body;
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0].files[0].id).not.toBe(revised.revisions[1].files[0].id);
    expect(
      await prisma.notificationEvent.count({
        where: { tenantId: 'submission-a', eventType: 'RESUBMISSION_RECEIVED' },
      }),
    ).toBe(1);
    const resubmissionEvent = await prisma.notificationEvent.findFirst({
      where: { tenantId: 'submission-a', eventType: 'RESUBMISSION_RECEIVED' },
    });
    expect(resubmissionEvent?.payload).toMatchObject({
      targetPath: `/docente/revisiones/${created.id}`,
    });

    await api(setup.teacherToken)
      .post(`/api/v1/submission-revisions/${revised.revisions[1].id}/reviews`)
      .send({ action: 'REVIEWED', comment: 'Reviewed.' })
      .expect(201);
    expect(
      await prisma.notificationEvent.count({
        where: { tenantId: 'submission-a', eventType: 'SUBMISSION_REVIEWED' },
      }),
    ).toBe(1);
    const reviewedEvent = await prisma.notificationEvent.findFirst({
      where: { tenantId: 'submission-a', eventType: 'SUBMISSION_REVIEWED' },
    });
    expect(reviewedEvent?.payload).toMatchObject({
      targetPath: `/estudiante/asignaturas/${setup.item.courseSubjectId}/items/${setup.item.id}`,
    });
    await api(setup.studentToken)
      .post(`/api/v1/submissions/${created.id}/revisions`)
      .send({ fileObjectIds: [revisedFile.id] })
      .expect(409);

    await api(await token('submission-a', 'unrelated-teacher', ['TEACHER']))
      .post('/api/v1/file-upload-intents')
      .send({
        parentType: 'LEARNING_ITEM',
        parentId: setup.item.id,
        category: 'ASSIGNMENT_SOURCE',
        filename: 'unauthorized.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdf('unauthorized').length,
      })
      .expect(403);
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

  async function createIntentOnly(
    accessToken: string,
    learningItemId: string,
    category: 'ASSIGNMENT_SOURCE' | 'STUDENT_SUBMISSION',
    filename: string,
    bytes: Buffer,
  ) {
    return (await api(accessToken)
      .post('/api/v1/file-upload-intents')
      .send({
        parentType: 'LEARNING_ITEM',
        parentId: learningItemId,
        category,
        filename,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
      })
      .expect(201)).body;
  }

  async function transfer(accessToken: string, intentId: string, filename: string, bytes: Buffer) {
    const response = await api(accessToken)
      .post(`/api/v1/file-upload-intents/${intentId}/content`)
      .attach('file', bytes, { filename, contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function uploadStudentFile(accessToken: string, itemId: string, filename: string, bytes: Buffer) {
    const intent = await createIntentOnly(accessToken, itemId, 'STUDENT_SUBMISSION', filename, bytes);
    return transfer(accessToken, intent.id, filename, bytes);
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
    const teacher = await post(admin, '/api/v1/teachers', {
      firstName: 'Teacher',
      lastName: tenantId,
      email: `teacher-${tenantId}@example.test`,
    });
    const student = await post(admin, '/api/v1/students', {
      firstName: 'Student',
      lastName: tenantId,
      email: `student-${tenantId}@example.test`,
    });
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
    return { item, unit, course, teacherToken, studentToken };
  }
});
