import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditEvent,
  type AcademicAuditPort,
} from '../src/academic/academic-audit.port';
import {
  ACADEMIC_IDENTITY_LINK_VERIFIER,
  type AcademicIdentityLinkVerifier,
} from '../src/academic/identity-link.port';
import { configureApplication } from '../src/bootstrap/configure-application';
import {
  IDENTITY_SESSION_STATUS_ADAPTER,
  type IdentitySessionStatusAdapter,
  type IdentitySessionStatusRequest,
} from '../src/identity/identity-adapter.port';
import { PrismaService } from '../src/persistence/prisma.service';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(testDatabaseUrl)(
  'Academic Structure domain (PostgreSQL e2e)',
  () => {
    const fixture = new IdentityJwksFixture();
    const audit: AcademicAuditPort & { events: AcademicAuditEvent[] } = {
      events: [],
      record(event) {
        this.events.push(event);
        return Promise.resolve();
      },
    };
    const identityLinks: AcademicIdentityLinkVerifier = {
      verifyExactLink: () => Promise.resolve(),
    };
    const identityStatus: IdentitySessionStatusAdapter & { active: boolean } = {
      active: true,
      checkSessionStatus(input: IdentitySessionStatusRequest) {
        return Promise.resolve({
          active: this.active,
          identityUserId: input.identityUserId,
          membershipActive: this.active,
          membershipId: input.membershipId,
          sessionActive: this.active,
          sessionId: input.sessionId,
          tenantId: input.tenantId,
        });
      },
    };
    let application: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      await fixture.start();
      for (const [key, value] of Object.entries(fixture.environment())) {
        vi.stubEnv(key, value);
      }
      vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);

      const { AppModule } = await import('../src/app.module');
      const testingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(ACADEMIC_AUDIT_PORT)
        .useValue(audit)
        .overrideProvider(ACADEMIC_IDENTITY_LINK_VERIFIER)
        .useValue(identityLinks)
        .overrideProvider(IDENTITY_SESSION_STATUS_ADAPTER)
        .useValue(identityStatus)
        .compile();

      application = testingModule.createNestApplication();
      configureApplication(application);
      await application.init();
      prisma = application.get(PrismaService);
    });

    beforeEach(async () => {
      identityStatus.active = true;
      audit.events.length = 0;
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
    });

    afterAll(async () => {
      await application.close();
      await fixture.close();
      vi.unstubAllEnvs();
    });

    it('isolates reads, labels, and every cross-tenant relationship', async () => {
      const adminA = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const adminB = await token('tenant-b', 'admin-b', ['TENANT_ADMIN']);
      const a = await createStructure(
        adminA,
        '2026',
        '6° Básico A',
        'Matemáticas',
      );
      const b = await createStructure(
        adminB,
        '2026',
        '6° Básico A',
        'Matemáticas',
      );
      const studentA = await createStudent(adminA, 'Ana', 'Alba');
      const studentB = await createStudent(adminB, 'Berta', 'Bravo');
      const teacherB = await createTeacher(adminB, 'Tomás', 'Bravo');

      await api(adminA).get(`/api/v1/students/${studentB.id}`).expect(404);
      await api(adminA)
        .post('/api/v1/course-enrollments')
        .send({ studentId: studentA.id, courseId: b.course.id })
        .expect(404);
      await api(adminA)
        .post('/api/v1/course-subjects')
        .send({ courseId: a.course.id, subjectId: b.subject.id })
        .expect(404);
      await api(adminA)
        .post('/api/v1/student-subject-enrollments')
        .send({ studentId: studentB.id, courseSubjectId: a.courseSubject.id })
        .expect(404);
      await api(adminA)
        .post('/api/v1/course-subject-teachers')
        .send({
          courseSubjectId: a.courseSubject.id,
          teacherIds: [teacherB.id],
        })
        .expect(404);

      expect(
        await prisma.academicYear.count({ where: { label: '2026' } }),
      ).toBe(2);
      expect(
        await prisma.subject.count({ where: { name: 'Matemáticas' } }),
      ).toBe(2);
    });

    it('enforces coherent dates and forward-only/read-only year and course lifecycles', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      await api(admin)
        .post('/api/v1/academic-years')
        .send({ label: 'bad', startDate: '2026-12-01', endDate: '2026-03-01' })
        .expect(400);

      const year = await post(admin, '/api/v1/academic-years', {
        label: '2026',
        startDate: '2026-03-01',
        endDate: '2026-12-20',
      });
      await api(admin)
        .post('/api/v1/courses')
        .send({ academicYearId: year.id, label: '5° A', status: 'ACTIVE' })
        .expect(409);
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(admin, '/api/v1/courses', {
        academicYearId: year.id,
        label: '5° A',
        status: 'ACTIVE',
      });
      await api(admin)
        .patch(`/api/v1/academic-years/${year.id}`)
        .send({ label: 'changed' })
        .expect(409);
      await patch(admin, `/api/v1/academic-years/${year.id}`, {
        status: 'CLOSED',
      });
      await api(admin)
        .post('/api/v1/courses')
        .send({ academicYearId: year.id, label: '5° B' })
        .expect(409);
      await api(admin)
        .patch(`/api/v1/academic-years/${year.id}`)
        .send({ status: 'ACTIVE' })
        .expect(409);
      await api(admin)
        .patch(`/api/v1/courses/${course.id}`)
        .send({ status: 'ARCHIVED' })
        .expect(409);
    });

    it('reuses one Subject in multiple independent CourseSubjects', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const first = await createStructure(admin, '2026', '5° A', 'Lenguaje');
      const secondCourse = await post(admin, '/api/v1/courses', {
        academicYearId: first.year.id,
        label: '6° A',
        status: 'ACTIVE',
      });
      const second = await post(admin, '/api/v1/course-subjects', {
        courseId: secondCourse.id,
        subjectId: first.subject.id,
        defaultForCourse: true,
      });

      expect(second.subjectId).toBe(first.subject.id);
      expect(second.courseId).not.toBe(first.courseSubject.courseId);
      expect(
        await prisma.courseSubject.count({
          where: { tenantId: 'tenant-a', subjectId: first.subject.id },
        }),
      ).toBe(2);
    });

    it('resolves default and direct student access once and removes only current access on deactivation', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const base = await createStructure(admin, '2026', '6° A', 'Matemáticas');
      const english = await post(admin, '/api/v1/subjects', { name: 'Inglés' });
      const selective = await post(admin, '/api/v1/course-subjects', {
        courseId: base.course.id,
        subjectId: english.id,
        defaultForCourse: false,
      });
      const student = await createStudent(admin, 'Elena', 'Estévez');
      const enrollment = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: base.course.id,
      });

      expect(await effectiveIds(admin, student.id)).toEqual([
        base.courseSubject.id,
      ]);
      const directSelective = await post(
        admin,
        '/api/v1/student-subject-enrollments',
        {
          studentId: student.id,
          courseSubjectId: selective.id,
        },
      );
      const directDefault = await post(
        admin,
        '/api/v1/student-subject-enrollments',
        {
          studentId: student.id,
          courseSubjectId: base.courseSubject.id,
        },
      );
      expect(new Set(await effectiveIds(admin, student.id))).toEqual(
        new Set([base.courseSubject.id, selective.id]),
      );

      await post(
        admin,
        `/api/v1/course-enrollments/${enrollment.id}/deactivate`,
        {},
      );
      expect(new Set(await effectiveIds(admin, student.id))).toEqual(
        new Set([base.courseSubject.id, selective.id]),
      );
      await post(
        admin,
        `/api/v1/student-subject-enrollments/${directDefault.id}/deactivate`,
        {},
      );
      await post(
        admin,
        `/api/v1/student-subject-enrollments/${directSelective.id}/deactivate`,
        {},
      );
      expect(await effectiveIds(admin, student.id)).toEqual([]);
      expect(await prisma.courseEnrollment.count()).toBe(1);
      expect(await prisma.studentSubjectEnrollment.count()).toBe(2);
    });

    it('limits teachers to active CourseSubject assignments while allowing co-teachers', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const first = await createStructure(admin, '2026', '5° A', 'Matemáticas');
      const language = await post(admin, '/api/v1/subjects', {
        name: 'Lenguaje',
      });
      const second = await post(admin, '/api/v1/course-subjects', {
        courseId: first.course.id,
        subjectId: language.id,
        defaultForCourse: true,
      });
      const teacherA = await createTeacher(admin, 'Andrea', 'Álvarez');
      const teacherB = await createTeacher(admin, 'Bruno', 'Bustos');
      await link(admin, 'teachers', teacherA.id, 'teacher-user-a');
      await link(admin, 'teachers', teacherB.id, 'teacher-user-b');
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: first.courseSubject.id,
        teacherIds: [teacherA.id, teacherB.id],
      });

      const teacherToken = await token('tenant-a', 'teacher-user-a', [
        'TEACHER',
      ]);
      const assigned = await api(teacherToken)
        .get('/api/v1/teacher-context/course-subjects')
        .expect(200);
      expect(assigned.body.map((item: { id: string }) => item.id)).toEqual([
        first.courseSubject.id,
      ]);
      await api(teacherToken)
        .get(`/api/v1/course-subjects/${second.id}/roster`)
        .expect(403);

      const coTeachers = await api(admin)
        .get(`/api/v1/course-subjects/${first.courseSubject.id}/teachers`)
        .expect(200);
      expect(coTeachers.body).toHaveLength(2);
    });

    it('lets an assigned teacher see only the effective roster and deduplicates access paths', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const base = await createStructure(admin, '2026', '5° A', 'Ciencias');
      const teacher = await createTeacher(admin, 'Teresa', 'Torres');
      await link(admin, 'teachers', teacher.id, 'teacher-user');
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: base.courseSubject.id,
        teacherIds: [teacher.id],
      });
      const student = await createStudent(admin, 'Sofía', 'Silva');
      await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: base.course.id,
      });
      await post(admin, '/api/v1/student-subject-enrollments', {
        studentId: student.id,
        courseSubjectId: base.courseSubject.id,
      });

      const teacherToken = await token('tenant-a', 'teacher-user', ['TEACHER']);
      const roster = await api(teacherToken)
        .get(`/api/v1/course-subjects/${base.courseSubject.id}/roster`)
        .expect(200);
      expect(roster.body).toHaveLength(1);
      expect(roster.body[0]).toMatchObject({
        access: ['COURSE_DEFAULT', 'DIRECT'],
        student: { id: student.id },
      });
    });

    it('gives a student only self context and proves an Identity link alone grants no subject access', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const base = await createStructure(admin, '2026', '5° A', 'Historia');
      const student = await createStudent(admin, 'Isidora', 'Ibarra');
      const other = await createStudent(admin, 'Otra', 'Persona');
      await link(admin, 'students', student.id, 'student-user');
      const studentToken = await token('tenant-a', 'student-user', ['STUDENT']);

      const profile = await api(studentToken)
        .get('/api/v1/student-context/profile')
        .expect(200);
      expect(profile.body.id).toBe(student.id);
      await api(studentToken).get(`/api/v1/students/${other.id}`).expect(403);
      const empty = await api(studentToken)
        .get('/api/v1/student-context/course-subjects')
        .expect(200);
      expect(empty.body).toEqual([]);

      await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: base.course.id,
      });
      const effective = await api(studentToken)
        .get('/api/v1/student-context/course-subjects')
        .expect(200);
      expect(effective.body.map((item: { id: string }) => item.id)).toEqual([
        base.courseSubject.id,
      ]);
    });

    it('denies teacher administration, stale link context, and SYSTEM_ADMIN support access', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const student = await createStudent(admin, 'Alicia', 'Auditada');
      const teacherToken = await token('tenant-a', 'teacher-user', ['TEACHER']);
      await api(teacherToken)
        .post('/api/v1/subjects')
        .send({ name: 'Arte' })
        .expect(403);

      identityStatus.active = false;
      await api(admin)
        .put(`/api/v1/students/${student.id}/identity-link`)
        .send({ identityUserId: 'student-user' })
        .expect(403);

      const systemAdmin = await token('tenant-a', 'system-user', [
        'SYSTEM_ADMIN',
      ]);
      await api(systemAdmin).get('/api/v1/students').expect(403);
      expect(
        audit.events.some((event) => event.resourceId === student.id),
      ).toBe(true);
      expect(
        audit.events.every((event) => event.context.requestId.length > 0),
      ).toBe(true);
    });

    it('enforces active uniqueness in PostgreSQL while preserving inactive history', async () => {
      const admin = await token('tenant-a', 'admin-a', ['TENANT_ADMIN']);
      const base = await createStructure(admin, '2026', '5° A', 'Música');
      const student = await createStudent(admin, 'Mario', 'Muñoz');
      const teacher = await createTeacher(admin, 'Tamara', 'Tapia');
      await api(admin)
        .post('/api/v1/course-subjects')
        .send({
          courseId: base.course.id,
          subjectId: base.subject.id,
          defaultForCourse: true,
        })
        .expect(409);
      const first = await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: base.course.id,
      });
      await api(admin)
        .post('/api/v1/course-enrollments')
        .send({ studentId: student.id, courseId: base.course.id })
        .expect(409);
      await post(admin, '/api/v1/student-subject-enrollments', {
        studentId: student.id,
        courseSubjectId: base.courseSubject.id,
      });
      await api(admin)
        .post('/api/v1/student-subject-enrollments')
        .send({
          studentId: student.id,
          courseSubjectId: base.courseSubject.id,
        })
        .expect(409);
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: base.courseSubject.id,
        teacherIds: [teacher.id],
      });
      await api(admin)
        .post('/api/v1/course-subject-teachers')
        .send({
          courseSubjectId: base.courseSubject.id,
          teacherIds: [teacher.id],
        })
        .expect(409);
      await post(
        admin,
        `/api/v1/course-enrollments/${first.id}/deactivate`,
        {},
      );
      await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: base.course.id,
      });
      expect(await prisma.courseEnrollment.count()).toBe(2);
      expect(
        await prisma.courseEnrollment.count({ where: { status: 'ACTIVE' } }),
      ).toBe(1);
    });

    function api(accessToken: string) {
      const server = application.getHttpServer();
      return {
        get: (path: string) =>
          request(server).get(path).auth(accessToken, { type: 'bearer' }),
        patch: (path: string) =>
          request(server).patch(path).auth(accessToken, { type: 'bearer' }),
        post: (path: string) =>
          request(server).post(path).auth(accessToken, { type: 'bearer' }),
        put: (path: string) =>
          request(server).put(path).auth(accessToken, { type: 'bearer' }),
      };
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

    async function post(accessToken: string, path: string, body: object) {
      const response = await api(accessToken).post(path).send(body).expect(201);
      return response.body;
    }

    async function patch(accessToken: string, path: string, body: object) {
      const response = await api(accessToken)
        .patch(path)
        .send(body)
        .expect(200);
      return response.body;
    }

    async function createStudent(
      accessToken: string,
      firstName: string,
      lastName: string,
    ) {
      return post(accessToken, '/api/v1/students', { firstName, lastName });
    }

    async function createTeacher(
      accessToken: string,
      firstName: string,
      lastName: string,
    ) {
      return post(accessToken, '/api/v1/teachers', { firstName, lastName });
    }

    async function createStructure(
      accessToken: string,
      yearLabel: string,
      courseLabel: string,
      subjectName: string,
    ) {
      const year = await post(accessToken, '/api/v1/academic-years', {
        label: yearLabel,
        startDate: '2026-03-01',
        endDate: '2026-12-20',
      });
      await patch(accessToken, `/api/v1/academic-years/${year.id}`, {
        status: 'ACTIVE',
      });
      const course = await post(accessToken, '/api/v1/courses', {
        academicYearId: year.id,
        label: courseLabel,
        status: 'ACTIVE',
      });
      const subject = await post(accessToken, '/api/v1/subjects', {
        name: subjectName,
      });
      const courseSubject = await post(accessToken, '/api/v1/course-subjects', {
        courseId: course.id,
        subjectId: subject.id,
        defaultForCourse: true,
      });
      return { course, courseSubject, subject, year };
    }

    async function effectiveIds(accessToken: string, studentId: string) {
      const response = await api(accessToken)
        .get(`/api/v1/students/${studentId}/effective-course-subjects`)
        .expect(200);
      return response.body.map((item: { id: string }) => item.id as string);
    }

    async function link(
      accessToken: string,
      resource: 'students' | 'teachers',
      id: string,
      identityUserId: string,
    ) {
      const response = await api(accessToken)
        .put(`/api/v1/${resource}/${id}/identity-link`)
        .send({ identityUserId })
        .expect(200);
      return response.body;
    }
  },
);
