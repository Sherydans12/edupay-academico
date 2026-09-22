import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/persistence/prisma.service';
import { IdentityInternalFixture } from './support/identity-internal.fixture';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(testDatabaseUrl)('DIE domain (PostgreSQL e2e)', () => {
  const jwks = new IdentityJwksFixture();
  const identity = new IdentityInternalFixture();
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await jwks.start();
    await identity.start();
    for (const [key, value] of Object.entries({
      ...jwks.environment(),
      ...identity.environment(),
    }))
      vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);
    const { AppModule } = await import('../src/app.module');
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    identity.reset();
    const tenantIds: string[] = ['die-tenant-a', 'die-tenant-b'];
    const withinTestTenants = { tenantId: { in: tenantIds } };
    await prisma.fileReference.deleteMany({ where: withinTestTenants });
    await prisma.fileObject.deleteMany({ where: withinTestTenants });
    await prisma.uploadIntent.deleteMany({ where: withinTestTenants });
    await prisma.storedBlob.deleteMany({ where: withinTestTenants });
    await prisma.dieAuditEvent.deleteMany({ where: withinTestTenants });
    await prisma.dieActionAssignment.deleteMany({ where: withinTestTenants });
    await prisma.dieAction.deleteMany({ where: withinTestTenants });
    await prisma.dieJournalRevision.deleteMany({ where: withinTestTenants });
    await prisma.dieJournalEntry.deleteMany({ where: withinTestTenants });
    await prisma.dieSupportEpisode.deleteMany({ where: withinTestTenants });
    await prisma.dieMemberAssignment.deleteMany({ where: withinTestTenants });
    await prisma.courseEnrollment.deleteMany({ where: withinTestTenants });
    await prisma.teacher.deleteMany({ where: withinTestTenants });
    await prisma.student.deleteMany({ where: withinTestTenants });
    await prisma.course.deleteMany({ where: withinTestTenants });
    await prisma.academicYear.deleteMany({ where: withinTestTenants });
    await prisma.storageUsageAccount.deleteMany({ where: withinTestTenants });
    await prisma.storageQuotaPolicy.deleteMany({ where: withinTestTenants });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await seedTenant('die-tenant-a');
    await seedTenant('die-tenant-b');
    await prisma.storageQuotaPolicy.upsert({
      where: { scopeKey: 'GLOBAL' },
      create: {
        scopeKey: 'GLOBAL',
        scopeType: 'GLOBAL',
        quotaBytes: 20_000_000_000n,
      },
      update: { quotaBytes: 20_000_000_000n },
    });
  });

  afterEach(async () => {
    const withinTestTenants = {
      tenantId: { in: ['die-tenant-a', 'die-tenant-b'] },
    };
    await prisma.fileReference.deleteMany({ where: withinTestTenants });
    await prisma.dieAuditEvent.deleteMany({ where: withinTestTenants });
    await prisma.dieActionAssignment.deleteMany({ where: withinTestTenants });
    await prisma.dieAction.deleteMany({ where: withinTestTenants });
    await prisma.dieJournalRevision.deleteMany({ where: withinTestTenants });
    await prisma.dieJournalEntry.deleteMany({ where: withinTestTenants });
    await prisma.dieSupportEpisode.deleteMany({ where: withinTestTenants });
    await prisma.dieMemberAssignment.deleteMany({ where: withinTestTenants });
  });

  afterAll(async () => {
    await app.close();
    await identity.close();
    await jwks.close();
    vi.unstubAllEnvs();
  });

  it('grants admins automatically, denies ordinary teachers, and lets every DIE member add an ordinary member', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const first = await teacher('die-tenant-a', 'teacher-one', 'Elena', 'Ríos');
    const second = await teacher(
      'die-tenant-a',
      'teacher-two',
      'Mario',
      'Soto',
    );
    const ordinary = await token('die-tenant-a', 'teacher-one', ['TEACHER']);

    await api(admin).get('/api/v1/die/access').expect(200);
    await api(ordinary).get('/api/v1/die/access').expect(403);

    await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: first.id })
      .expect(201);
    await api(ordinary).get('/api/v1/die/access').expect(200);
    await api(ordinary)
      .post('/api/v1/die/members')
      .send({ teacherId: second.id })
      .expect(201);

    expect(
      await prisma.dieMemberAssignment.count({
        where: { tenantId: 'die-tenant-a', removedAt: null },
      }),
    ).toBe(2);
    expect(
      identity.requests.filter(
        (item) => item.url === '/internal/v1/tenant-memberships/verify',
      ),
    ).toHaveLength(2);
  });

  it('keeps coordination tenant-admin-only and never accepts a cross-tenant academic target', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const first = await teacher('die-tenant-a', 'teacher-one', 'Elena', 'Ríos');
    const foreign = await teacher(
      'die-tenant-b',
      'teacher-foreign',
      'Otra',
      'Empresa',
    );
    const created = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: first.id })
      .expect(201);
    const member = await token('die-tenant-a', 'teacher-one', ['TEACHER']);

    await api(member)
      .patch(`/api/v1/die/members/${created.body.id}/role`)
      .send({ role: 'COORDINATOR' })
      .expect(403);
    await api(admin)
      .patch(`/api/v1/die/members/${created.body.id}/role`)
      .send({ role: 'COORDINATOR' })
      .expect(200);
    await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: foreign.id })
      .expect(404);
  });

  it('serializes active support, preserves episode history, and captures course/year at the time of the fact', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const student = await studentRecord('die-tenant-a', 'Ana', 'Pérez');
    const { course } = await academicContext(
      'die-tenant-a',
      student.id,
      '2026',
      '5° A',
    );
    const body = {
      studentId: student.id,
      startDate: '2026-09-01',
      reason: 'Apoyo de acceso curricular.',
    };
    const attempts = await Promise.all([
      api(admin).post('/api/v1/die/support-episodes').send(body),
      api(admin).post('/api/v1/die/support-episodes').send(body),
    ]);
    expect(attempts.map((result) => result.status).sort()).toEqual([201, 409]);
    const episode = attempts.find((result) => result.status === 201)!.body;
    expect(episode.academicContext).toMatchObject({
      courseId: course.id,
      courseLabel: '5° A',
      academicYearLabel: '2026',
    });

    const entry = await api(admin)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.id))
      .expect(201);
    await prisma.courseEnrollment.updateMany({
      where: { tenantId: 'die-tenant-a', studentId: student.id },
      data: { status: 'INACTIVE' },
    });
    await api(admin)
      .post(`/api/v1/die/support-episodes/${episode.id}/finish`)
      .send({ endDate: '2026-09-10', reason: 'Objetivo de período cumplido.' })
      .expect(201);
    await api(admin)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.id))
      .expect(409);
    const resumed = await api(admin)
      .post('/api/v1/die/support-episodes')
      .send({
        ...body,
        startDate: '2026-09-15',
        reason: 'Nueva necesidad observada.',
      })
      .expect(201);
    const history = await api(admin)
      .get(`/api/v1/die/students/${student.id}/support-episodes`)
      .expect(200);

    expect(history.body).toHaveLength(2);
    expect(resumed.body.id).not.toBe(episode.id);
    expect(entry.body.current.academicContext).toMatchObject({
      courseId: course.id,
      courseLabel: '5° A',
    });
  });

  it('versions corrections, preserves original authorship, and restricts correction/void authority', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const authorTeacher = await teacher(
      'die-tenant-a',
      'author-user',
      'Sara',
      'León',
    );
    const otherTeacher = await teacher(
      'die-tenant-a',
      'other-user',
      'Nicolás',
      'Díaz',
    );
    const authorMember = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: authorTeacher.id })
      .expect(201);
    const otherMember = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: otherTeacher.id })
      .expect(201);
    const author = await token('die-tenant-a', 'author-user', ['TEACHER']);
    const other = await token('die-tenant-a', 'other-user', ['TEACHER']);
    const student = await studentRecord('die-tenant-a', 'Lucas', 'Vera');
    const episode = await api(admin)
      .post('/api/v1/die/support-episodes')
      .send({
        studentId: student.id,
        startDate: '2026-09-01',
        reason: 'Acompañamiento.',
      })
      .expect(201);
    const created = await api(author)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.body.id))
      .expect(201);

    await api(other)
      .patch(`/api/v1/die/journal-entries/${created.body.id}`)
      .send({ ...journalCorrection(), reason: 'Corrección de tercero.' })
      .expect(403);
    await api(admin)
      .patch(`/api/v1/die/members/${otherMember.body.id}/role`)
      .send({ role: 'COORDINATOR' })
      .expect(200);
    const corrected = await api(other)
      .patch(`/api/v1/die/journal-entries/${created.body.id}`)
      .send({ ...journalCorrection(), reason: 'Precisa el lugar informado.' })
      .expect(200);
    const voided = await api(other)
      .post(`/api/v1/die/journal-entries/${created.body.id}/void`)
      .send({ reason: 'Registro duplicado confirmado.' })
      .expect(201);

    expect(corrected.body.originalAuthorIdentityUserId).toBe('author-user');
    expect(corrected.body.revisions).toHaveLength(2);
    expect(corrected.body.revisions[1]).toMatchObject({
      correctedByIdentityUserId: 'other-user',
      correctionReason: 'Precisa el lugar informado.',
    });
    expect(voided.body).toMatchObject({
      status: 'VOIDED',
      originalAuthorIdentityUserId: 'author-user',
    });
    expect(authorMember.body.role).toBe('MEMBER');
  });

  it('requires transactional reassignment when removing a member with open actions', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const firstTeacher = await teacher(
      'die-tenant-a',
      'first-user',
      'Pía',
      'Mora',
    );
    const secondTeacher = await teacher(
      'die-tenant-a',
      'second-user',
      'José',
      'Lagos',
    );
    const first = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: firstTeacher.id })
      .expect(201);
    const second = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: secondTeacher.id })
      .expect(201);
    const student = await studentRecord('die-tenant-a', 'Marta', 'Silva');
    const action = await api(admin)
      .post('/api/v1/die/actions')
      .send({
        studentId: student.id,
        title: 'Coordinar adecuación',
        assigneeMemberAssignmentId: first.body.id,
        dueDate: '2026-01-01',
      })
      .expect(201);

    await api(admin)
      .post(`/api/v1/die/members/${first.body.id}/remove`)
      .send({ reason: 'Cambio de funciones.' })
      .expect(409);
    await api(admin)
      .post(`/api/v1/die/members/${first.body.id}/remove`)
      .send({
        reason: 'Cambio de funciones.',
        reassignToMemberAssignmentId: second.body.id,
      })
      .expect(201);

    const stored = await prisma.dieAction.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: 'die-tenant-a', id: action.body.id } },
    });
    expect(stored.assigneeMemberAssignmentId).toBe(second.body.id);
    expect(
      await prisma.dieActionAssignment.count({
        where: { tenantId: 'die-tenant-a', actionId: action.body.id },
      }),
    ).toBe(2);
  });

  it('protects DIE attachments from broader academic access and rejects ZIP for this resource class', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const memberTeacher = await teacher(
      'die-tenant-a',
      'member-user',
      'Inés',
      'Pino',
    );
    await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: memberTeacher.id })
      .expect(201);
    const member = await token('die-tenant-a', 'member-user', ['TEACHER']);
    const outsider = await token('die-tenant-a', 'outsider-user', ['TEACHER']);
    const student = await studentRecord('die-tenant-a', 'Sol', 'Reyes');
    const episode = await api(admin)
      .post('/api/v1/die/support-episodes')
      .send({
        studentId: student.id,
        startDate: '2026-09-01',
        reason: 'Apoyo.',
      })
      .expect(201);
    const entry = await api(member)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.body.id))
      .expect(201);

    await api(member)
      .post(`/api/v1/die/journal-entries/${entry.body.id}/upload-intents`)
      .send({
        filename: 'archivo.zip',
        mimeType: 'application/zip',
        sizeBytes: 8,
      })
      .expect(400);
    const intent = await api(member)
      .post(`/api/v1/die/journal-entries/${entry.body.id}/upload-intents`)
      .send({ filename: 'nota.txt', mimeType: 'text/plain', sizeBytes: 15 })
      .expect(201);
    const uploaded = await api(member)
      .post(`/api/v1/file-upload-intents/${intent.body.id}/content`)
      .attach('file', Buffer.from('contenido seguro'), {
        filename: 'nota.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await api(outsider)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(403);
    const download = await api(member)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(200);
    expect(download.text).toBe('contenido seguro');
    const rejoined = await token(
      'die-tenant-a',
      'member-user',
      ['TEACHER'],
      'replacement-membership',
    );
    await api(rejoined).get('/api/v1/die/access').expect(403);
    await api(rejoined)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(403);
  });

  it('exports an audited PDF and denies cross-tenant export tampering', async () => {
    const adminA = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const adminB = await token('die-tenant-b', 'admin-b', ['TENANT_ADMIN']);
    const student = await studentRecord('die-tenant-a', 'Eva', 'Núñez');
    const episode = await api(adminA)
      .post('/api/v1/die/support-episodes')
      .send({
        studentId: student.id,
        startDate: '2026-09-01',
        reason: 'Apoyo.',
      })
      .expect(201);
    await api(adminA)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.body.id))
      .expect(201);

    const pdf = await api(adminA)
      .get(`/api/v1/die/students/${student.id}/export.pdf?includeVoided=true`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      await prisma.dieAuditEvent.count({
        where: {
          tenantId: 'die-tenant-a',
          action: 'DIE_STUDENT_PDF_EXPORTED',
          resourceId: student.id,
        },
      }),
    ).toBe(1);
    await api(adminB)
      .get(`/api/v1/die/students/${student.id}/export.pdf`)
      .expect(404);
  });

  function api(accessToken: string) {
    const server = app.getHttpServer();
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
    userId: string,
    roles: Array<'TENANT_ADMIN' | 'TEACHER' | 'STUDENT'>,
    membershipId = `membership-${tenantId}-${userId}`,
  ) {
    const context = {
      identityUserId: userId,
      membershipId,
      sessionId: `session-${tenantId}-${userId}`,
      tenantId,
    };
    identity.registerSession(context);
    return jwks.sign({
      membership_id: context.membershipId,
      roles,
      sid: context.sessionId,
      sub: userId,
      tenant_id: tenantId,
    });
  }

  async function seedTenant(tenantId: string) {
    await prisma.tenant.create({ data: { id: tenantId } });
  }
  async function teacher(
    tenantId: string,
    identityUserId: string,
    firstName: string,
    lastName: string,
  ) {
    return prisma.teacher.create({
      data: { tenantId, identityUserId, firstName, lastName },
    });
  }
  async function studentRecord(
    tenantId: string,
    firstName: string,
    lastName: string,
  ) {
    return prisma.student.create({ data: { tenantId, firstName, lastName } });
  }
  async function academicContext(
    tenantId: string,
    studentId: string,
    yearLabel: string,
    courseLabel: string,
  ) {
    const year = await prisma.academicYear.create({
      data: {
        tenantId,
        label: yearLabel,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-12-20'),
        status: 'ACTIVE',
      },
    });
    const course = await prisma.course.create({
      data: {
        tenantId,
        academicYearId: year.id,
        label: courseLabel,
        status: 'ACTIVE',
      },
    });
    await prisma.courseEnrollment.create({
      data: { tenantId, studentId, courseId: course.id, status: 'ACTIVE' },
    });
    return { course, year };
  }
  function journalBody(studentId: string, supportEpisodeId: string) {
    return {
      studentId,
      supportEpisodeId,
      category: 'OBSERVATION',
      eventDate: '2026-09-03',
      eventTime: null,
      eventTimeApproximate: false,
      eventTimeZone: 'America/Santiago',
      place: 'Sala de clases',
      title: 'Observación durante actividad',
      description:
        'El estudiante solicitó instrucciones por escrito y completó la actividad con ese apoyo.',
      immediateAction: 'Se entregó una pauta visual.',
      informationSource: 'WITNESSED',
      thirdPartySource: null,
    };
  }
  function journalCorrection() {
    return {
      category: 'OBSERVATION',
      eventDate: '2026-09-03',
      eventTime: '10:15',
      eventTimeApproximate: true,
      eventTimeZone: 'America/Santiago',
      place: 'Biblioteca',
      title: 'Observación durante actividad',
      description:
        'El estudiante solicitó instrucciones por escrito y completó la actividad con ese apoyo.',
      immediateAction: 'Se entregó una pauta visual.',
      informationSource: 'WITNESSED',
      thirdPartySource: null,
    };
  }
});
