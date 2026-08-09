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
  'Learning Content domain (PostgreSQL e2e)',
  () => {
    const fixture = new IdentityJwksFixture();
    const audit: AcademicAuditPort & { events: AcademicAuditEvent[] } = {
      events: [],
      record(event) {
        this.events.push(event);
        return Promise.resolve();
      },
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

    it('allows assigned teachers to collaborate and denies unrelated or cross-tenant teachers', async () => {
      const adminA = await token('learning-a', 'admin-a', ['TENANT_ADMIN']);
      const structureA = await createStructure(adminA, '5° A', 'Matemáticas');
      const teacherOne = await createTeacher(adminA, 'Tania', 'Uno');
      const teacherTwo = await createTeacher(adminA, 'Tomás', 'Dos');
      const unrelated = await createTeacher(adminA, 'Ursula', 'NoAsignada');
      await linkTeacher(teacherOne.id, 'teacher-one', adminA);
      await linkTeacher(teacherTwo.id, 'teacher-two', adminA);
      await linkTeacher(unrelated.id, 'teacher-unrelated', adminA);
      await post(adminA, '/api/v1/course-subject-teachers', {
        courseSubjectId: structureA.courseSubject.id,
        teacherIds: [teacherOne.id, teacherTwo.id],
      });

      const teacherOneToken = await token(
        'learning-a',
        'teacher-one',
        ['TEACHER'],
      );
      const teacherTwoToken = await token(
        'learning-a',
        'teacher-two',
        ['TEACHER'],
      );
      const unrelatedToken = await token(
        'learning-a',
        'teacher-unrelated',
        ['TEACHER'],
      );
      const unit = await post(teacherOneToken, '/api/v1/learning-units', {
        courseSubjectId: structureA.courseSubject.id,
        title: 'Números',
      });
      await post(teacherTwoToken, `/api/v1/learning-units/${unit.id}/items`, {
        type: 'MATERIAL',
        title: 'Material compartido',
        content: 'Contenido',
      });
      await api(unrelatedToken)
        .post('/api/v1/learning-units')
        .send({ courseSubjectId: structureA.courseSubject.id, title: 'No' })
        .expect(403);

      const adminB = await token('learning-b', 'admin-b', ['TENANT_ADMIN']);
      const structureB = await createStructure(adminB, '5° B', 'Matemáticas');
      await api(teacherOneToken)
        .post('/api/v1/learning-units')
        .send({ courseSubjectId: structureB.courseSubject.id, title: 'No tenant' })
        .expect(404);
    });

    it('shows only entitled published content and evaluates elapsed schedules without a worker', async () => {
      const admin = await token('visibility-a', 'admin', ['TENANT_ADMIN']);
      const structure = await createStructure(admin, '5° A', 'Lenguaje');
      const teacher = await createTeacher(admin, 'Valeria', 'Docente');
      await linkTeacher(teacher.id, 'teacher-visibility', admin);
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: structure.courseSubject.id,
        teacherIds: [teacher.id],
      });
      const student = await createStudent(admin, 'Sofía', 'Inscrita');
      await linkStudent(student.id, 'student-visible', admin);
      await post(admin, '/api/v1/course-enrollments', {
        studentId: student.id,
        courseId: structure.course.id,
      });
      const studentToken = await token(
        'visibility-a',
        'student-visible',
        ['STUDENT'],
      );
      const teacherToken = await token(
        'visibility-a',
        'teacher-visibility',
        ['TEACHER'],
      );
      const unit = await post(teacherToken, '/api/v1/learning-units', {
        courseSubjectId: structure.courseSubject.id,
        title: 'Unidad activa',
      });
      await patch(teacherToken, `/api/v1/learning-units/${unit.id}`, {
        status: 'ACTIVE',
      });
      const draft = await post(
        teacherToken,
        `/api/v1/learning-units/${unit.id}/items`,
        { type: 'MATERIAL', title: 'Borrador' },
      );
      const future = await post(
        teacherToken,
        `/api/v1/learning-units/${unit.id}/items`,
        { type: 'MATERIAL', title: 'Programado' },
      );
      await post(teacherToken, `/api/v1/learning-items/${future.id}/schedule`, {
        publishAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const elapsed = await post(
        teacherToken,
        `/api/v1/learning-units/${unit.id}/items`,
        { type: 'MATERIAL', title: 'Programado ya disponible' },
      );
      await prisma.learningItem.update({
        where: { tenantId_id: { tenantId: 'visibility-a', id: elapsed.id } },
        data: {
          publicationStatus: 'SCHEDULED',
          publishAt: new Date(Date.now() - 86_400_000),
        },
      });
      const published = await post(
        teacherToken,
        `/api/v1/learning-units/${unit.id}/items`,
        { type: 'MATERIAL', title: 'Publicado' },
      );
      await post(teacherToken, `/api/v1/learning-items/${published.id}/publish`, {});

      const hidden = await api(studentToken)
        .get(`/api/v1/course-subjects/${structure.courseSubject.id}/learning`)
        .expect(200);
      expect(hidden.body.units[0].items.map((item: { id: string }) => item.id)).toEqual(
        expect.arrayContaining([elapsed.id, published.id]),
      );
      expect(hidden.body.units[0].items.map((item: { id: string }) => item.id)).not.toContain(
        draft.id,
      );
      expect(hidden.body.units[0].items.map((item: { id: string }) => item.id)).not.toContain(
        future.id,
      );

      await post(teacherToken, `/api/v1/learning-items/${published.id}/archive`, {});
      const archivedRoute = await api(studentToken)
        .get(`/api/v1/course-subjects/${structure.courseSubject.id}/learning`)
        .expect(200);
      expect(archivedRoute.body.units[0].items.map((item: { id: string }) => item.id)).not.toContain(
        published.id,
      );
      expect(await prisma.learningItem.count()).toBe(4);
    });

    it('supports direct subject enrollment, requires deliverable deadlines, and keeps archived history', async () => {
      const admin = await token('direct-a', 'admin', ['TENANT_ADMIN']);
      const structure = await createStructure(admin, '6° A', 'Ciencias');
      const student = await createStudent(admin, 'Diego', 'Directo');
      await linkStudent(student.id, 'student-direct', admin);
      const secondSubject = await post(admin, '/api/v1/subjects', {
        name: 'Apoyo',
      });
      const second = await post(admin, '/api/v1/course-subjects', {
        courseId: structure.course.id,
        subjectId: secondSubject.id,
        defaultForCourse: false,
      });
      await post(admin, '/api/v1/student-subject-enrollments', {
        studentId: student.id,
        courseSubjectId: second.id,
      });
      const teacher = await createTeacher(admin, 'Diana', 'Docente');
      await linkTeacher(teacher.id, 'teacher-direct', admin);
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: second.id,
        teacherIds: [teacher.id],
      });
      const teacherToken = await token('direct-a', 'teacher-direct', ['TEACHER']);
      const studentToken = await token('direct-a', 'student-direct', ['STUDENT']);
      const unit = await post(teacherToken, '/api/v1/learning-units', {
        courseSubjectId: second.id,
        title: 'Apoyo directo',
      });
      await patch(teacherToken, `/api/v1/learning-units/${unit.id}`, {
        status: 'ACTIVE',
      });
      await api(teacherToken)
        .post(`/api/v1/learning-units/${unit.id}/items`)
        .send({ type: 'ASSIGNMENT', title: 'Sin fecha', instructions: 'Entrega' })
        .expect(400);
      await api(teacherToken)
        .post(`/api/v1/learning-units/${unit.id}/items`)
        .send({ type: 'ASSESSMENT', title: 'Sin fecha', instructions: 'Documento' })
        .expect(400);
      const material = await post(
        teacherToken,
        `/api/v1/learning-units/${unit.id}/items`,
        { type: 'MATERIAL', title: 'Sin submission behavior' },
      );
      await post(teacherToken, `/api/v1/learning-items/${material.id}/publish`, {});
      const route = await api(studentToken)
        .get(`/api/v1/course-subjects/${second.id}/learning`)
        .expect(200);
      expect(route.body.units[0].items[0]).not.toHaveProperty('submission');

      await post(teacherToken, `/api/v1/learning-units/${unit.id}/archive`, {});
      expect(await prisma.learningUnit.count()).toBe(1);
      expect(await prisma.learningItem.count()).toBe(1);
      expect(
        (await api(studentToken)
          .get(`/api/v1/course-subjects/${second.id}/learning`)
          .expect(200)).body.units,
      ).toHaveLength(0);
    });

    it('rejects unsafe reorders, requires confirmation for sensitive published changes, and denies SYSTEM_ADMIN', async () => {
      const admin = await token('order-a', 'admin', ['TENANT_ADMIN']);
      const structure = await createStructure(admin, '7° A', 'Historia');
      const otherSubject = await post(admin, '/api/v1/subjects', {
        name: 'Geografía',
      });
      const other = await post(admin, '/api/v1/course-subjects', {
        courseId: structure.course.id,
        subjectId: otherSubject.id,
      });
      const teacher = await createTeacher(admin, 'Olga', 'Orden');
      await linkTeacher(teacher.id, 'teacher-order', admin);
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: structure.courseSubject.id,
        teacherIds: [teacher.id],
      });
      const teacherToken = await token('order-a', 'teacher-order', ['TEACHER']);
      const first = await post(teacherToken, '/api/v1/learning-units', {
        courseSubjectId: structure.courseSubject.id,
        title: 'Primera',
      });
      const second = await post(teacherToken, '/api/v1/learning-units', {
        courseSubjectId: structure.courseSubject.id,
        title: 'Segunda',
      });
      const otherUnit = await post(admin, '/api/v1/learning-units', {
        courseSubjectId: other.id,
        title: 'Otra',
      });
      await api(teacherToken)
        .post(`/api/v1/course-subjects/${structure.courseSubject.id}/learning-units/reorder`)
        .send({ orderedIds: [first.id, otherUnit.id] })
        .expect(404);
      await post(teacherToken, `/api/v1/learning-units/${first.id}/items`, {
        type: 'MATERIAL',
        title: 'Publicable',
      });
      const item = (await api(teacherToken)
        .get(`/api/v1/learning-units/${first.id}/items`)
        .expect(200)).body[0];
      await post(teacherToken, `/api/v1/learning-items/${item.id}/publish`, {});
      await api(teacherToken)
        .patch(`/api/v1/learning-items/${item.id}`)
        .send({ instructions: 'Changed' })
        .expect(409);
      await api(teacherToken)
        .patch(`/api/v1/learning-items/${item.id}`)
        .send({ instructions: 'Changed', confirmSensitiveChange: true })
        .expect(200);
      expect(audit.events.some((event) => event.action.includes('CONFIRMED'))).toBe(true);

      const systemAdmin = await token('order-a', 'system', ['SYSTEM_ADMIN']);
      await api(systemAdmin)
        .get(`/api/v1/course-subjects/${structure.courseSubject.id}/learning`)
        .expect(403);
      await post(teacherToken, `/api/v1/learning-units/${second.id}/archive`, {});
      expect(await prisma.learningUnit.count({ where: { status: 'ARCHIVED' } })).toBe(1);
    });

    it('denies an unrelated student even when another student has access', async () => {
      const admin = await token('student-a', 'admin', ['TENANT_ADMIN']);
      const structure = await createStructure(admin, '8° A', 'Inglés');
      const enrolled = await createStudent(admin, 'Tiene', 'Acceso');
      const unrelated = await createStudent(admin, 'NoTiene', 'Acceso');
      await linkStudent(enrolled.id, 'student-enrolled', admin);
      await linkStudent(unrelated.id, 'student-unrelated', admin);
      await post(admin, '/api/v1/course-enrollments', {
        studentId: enrolled.id,
        courseId: structure.course.id,
      });
      const teacher = await createTeacher(admin, 'Pablo', 'Profesor');
      await linkTeacher(teacher.id, 'teacher-student', admin);
      await post(admin, '/api/v1/course-subject-teachers', {
        courseSubjectId: structure.courseSubject.id,
        teacherIds: [teacher.id],
      });
      const teacherToken = await token('student-a', 'teacher-student', ['TEACHER']);
      const unit = await post(teacherToken, '/api/v1/learning-units', {
        courseSubjectId: structure.courseSubject.id,
        title: 'Acceso',
      });
      await patch(teacherToken, `/api/v1/learning-units/${unit.id}`, {
        status: 'ACTIVE',
      });
      const item = await post(teacherToken, `/api/v1/learning-units/${unit.id}/items`, {
        type: 'MATERIAL',
        title: 'Visible',
      });
      await post(teacherToken, `/api/v1/learning-items/${item.id}/publish`, {});
      const unrelatedToken = await token(
        'student-a',
        'student-unrelated',
        ['STUDENT'],
      );
      await api(unrelatedToken)
        .get(`/api/v1/course-subjects/${structure.courseSubject.id}/learning`)
        .expect(403);
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
      const response = await api(accessToken).patch(path).send(body).expect(200);
      return response.body;
    }

    async function createStructure(
      accessToken: string,
      courseLabel: string,
      subjectName: string,
    ) {
      const year = await post(accessToken, '/api/v1/academic-years', {
        label: `2026-${courseLabel}`,
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
      return { course, courseSubject, subject };
    }

    async function createTeacher(
      accessToken: string,
      firstName: string,
      lastName: string,
    ) {
      return post(accessToken, '/api/v1/teachers', { firstName, lastName });
    }

    async function createStudent(
      accessToken: string,
      firstName: string,
      lastName: string,
    ) {
      return post(accessToken, '/api/v1/students', { firstName, lastName });
    }

    async function linkTeacher(
      id: string,
      identityUserId: string,
      _accessToken: string,
    ) {
      void _accessToken;
      const record = await prisma.teacher.findFirst({ where: { id } });
      if (!record) throw new Error('teacher fixture record not found');
      await prisma.teacher.update({
        where: { tenantId_id: { tenantId: record.tenantId, id } },
        data: { identityUserId },
      });
    }

    async function linkStudent(
      id: string,
      identityUserId: string,
      _accessToken: string,
    ) {
      void _accessToken;
      const record = await prisma.student.findFirst({ where: { id } });
      if (!record) throw new Error('student fixture record not found');
      await prisma.student.update({
        where: { tenantId_id: { tenantId: record.tenantId, id } },
        data: { identityUserId },
      });
    }
  },
);
