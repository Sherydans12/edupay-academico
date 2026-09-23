import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
  let storageRoot: string;

  beforeAll(async () => {
    await jwks.start();
    await identity.start();
    storageRoot = await mkdtemp(join(tmpdir(), 'edupay-die-storage-e2e-'));
    for (const [key, value] of Object.entries({
      ...jwks.environment(),
      ...identity.environment(),
    }))
      vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', testDatabaseUrl as string);
    vi.stubEnv('STORAGE_ROOT', storageRoot);
    vi.stubEnv('STORAGE_TEMP_ROOT', join(storageRoot, 'tmp'));
    vi.stubEnv('STORAGE_MIN_FREE_BYTES', '0');
    vi.stubEnv('STORAGE_MIN_FREE_PERCENTAGE', '0');
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
    await prisma.tenantOperationalProfileRevision.deleteMany({
      where: withinTestTenants,
    });
    await prisma.tenantOperationalProfile.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.learningItem.deleteMany({ where: withinTestTenants });
    await prisma.learningUnit.deleteMany({ where: withinTestTenants });
    await prisma.courseSubjectTeacher.deleteMany({ where: withinTestTenants });
    await prisma.courseSubject.deleteMany({ where: withinTestTenants });
    await prisma.subject.deleteMany({ where: withinTestTenants });
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
    await prisma.tenantOperationalProfileRevision.deleteMany({
      where: withinTestTenants,
    });
    await prisma.tenantOperationalProfile.deleteMany({
      where: withinTestTenants,
    });
  });

  afterAll(async () => {
    await app.close();
    await identity.close();
    await jwks.close();
    await rm(storageRoot, { force: true, recursive: true });
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
    const studentActor = await token('die-tenant-a', 'student-user', [
      'STUDENT',
    ]);

    await api(admin).get('/api/v1/die/access').expect(200);
    await api(ordinary).get('/api/v1/die/access').expect(403);
    await api(studentActor).get('/api/v1/die/access').expect(403);

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

  it('keeps the operational profile tenant-scoped, admin-only for writes, and durably audited', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const teacherActor = await token('die-tenant-a', 'teacher-a', ['TEACHER']);

    const initial = await api(teacherActor)
      .get('/api/v1/tenant/operational-profile')
      .expect(200);
    expect(initial.body).toMatchObject({
      institutionDisplayName: 'Institución sintética die-tenant-a',
      timeZone: 'America/Santiago',
      version: 1,
      complete: true,
    });
    await api(teacherActor)
      .patch('/api/v1/tenant/operational-profile')
      .send({ institutionDisplayName: 'No autorizado', expectedVersion: 1 })
      .expect(403);
    const changed = await api(admin)
      .patch('/api/v1/tenant/operational-profile')
      .send({
        institutionDisplayName: 'Colegio Sintético Ágora',
        timeZone: 'America/New_York',
        expectedVersion: 1,
      })
      .expect(200);
    expect(changed.body).toMatchObject({
      institutionDisplayName: 'Colegio Sintético Ágora',
      timeZone: 'America/New_York',
      version: 2,
    });
    expect(
      await prisma.tenantOperationalProfileRevision.count({
        where: { tenantId: 'die-tenant-a', version: 2 },
      }),
    ).toBe(1);
    expect(
      await prisma.tenantOperationalProfile.findUniqueOrThrow({
        where: { tenantId: 'die-tenant-b' },
      }),
    ).toMatchObject({
      institutionDisplayName: 'Institución sintética die-tenant-b',
      version: 1,
    });
  });

  it('allows date-only facts without a tenant zone and snapshots zones for facts with time', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const student = await studentRecord('die-tenant-a', 'Luz', 'Pérez');
    const episode = await api(admin)
      .post('/api/v1/die/support-episodes')
      .send({
        studentId: student.id,
        startDate: '2026-09-01',
        reason: 'Apoyo sintético.',
      })
      .expect(201);
    await api(admin)
      .patch('/api/v1/tenant/operational-profile')
      .send({ timeZone: null, expectedVersion: 1 })
      .expect(200);
    const responsibleTeacher = await teacher(
      'die-tenant-a',
      'time-test-member',
      'Zona',
      'Sintética',
    );
    const responsible = await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: responsibleTeacher.id })
      .expect(201);
    const actionWithoutZone = await api(admin)
      .post('/api/v1/die/actions')
      .send({
        studentId: student.id,
        title: 'Vencimiento sin zona',
        assigneeMemberAssignmentId: responsible.body.id,
        dueDate: '2026-09-02',
      })
      .expect(201);
    expect(actionWithoutZone.body.overdue).toBeNull();
    await api(admin).get('/api/v1/die/actions?overdue=true').expect(409);
    await api(admin)
      .post('/api/v1/die/journal-entries')
      .send(journalBody(student.id, episode.body.id))
      .expect(201);
    await api(admin)
      .post('/api/v1/die/journal-entries')
      .send({
        ...journalBody(student.id, episode.body.id),
        eventTime: '09:30',
      })
      .expect(409);
    await api(admin)
      .patch('/api/v1/tenant/operational-profile')
      .send({ timeZone: 'America/Santiago', expectedVersion: 2 })
      .expect(200);
    const timed = await api(admin)
      .post('/api/v1/die/journal-entries')
      .send({
        ...journalBody(student.id, episode.body.id),
        eventTime: '10:15',
      })
      .expect(201);
    expect(timed.body.current.eventTimeZone).toBe('America/Santiago');
    await api(admin)
      .patch('/api/v1/tenant/operational-profile')
      .send({ timeZone: 'America/New_York', expectedVersion: 3 })
      .expect(200);
    const sameTime = await api(admin)
      .patch(`/api/v1/die/journal-entries/${timed.body.id}`)
      .send(journalCorrection())
      .expect(200);
    expect(sameTime.body.current.eventTimeZone).toBe('America/Santiago');
    const changedTime = await api(admin)
      .patch(`/api/v1/die/journal-entries/${timed.body.id}`)
      .send({ ...journalCorrection(), eventTime: '10:20' })
      .expect(200);
    expect(changedTime.body.current.eventTimeZone).toBe('America/New_York');
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

  it('rejects a same-tenant target when its Identity membership contains an excluded role', async () => {
    const admin = await token('die-tenant-a', 'admin-a', ['TENANT_ADMIN']);
    const target = await teacher(
      'die-tenant-a',
      'student-only-user',
      'Identidad',
      'Excluida',
    );
    identity.membershipVerificationResponse = {
      verified: true,
      identityUserId: 'student-only-user',
      membershipId: 'student-only-membership',
      tenantId: 'die-tenant-a',
      membershipStatus: 'ACTIVE',
      roles: ['STUDENT'],
    };

    await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: target.id })
      .expect(403);
    identity.membershipVerificationResponse = {
      verified: true,
      identityUserId: 'student-only-user',
      membershipId: 'mixed-membership',
      tenantId: 'die-tenant-a',
      membershipStatus: 'ACTIVE',
      roles: ['TEACHER', 'STUDENT'],
    };
    await api(admin)
      .post('/api/v1/die/members')
      .send({ teacherId: target.id })
      .expect(403);
    expect(
      await prisma.dieMemberAssignment.count({
        where: { tenantId: 'die-tenant-a' },
      }),
    ).toBe(0);
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
      .get(`/api/v1/die/students/${student.id}/journal`)
      .expect(200);
    await api(admin)
      .get(`/api/v1/die/students/${student.id}/export.pdf`)
      .expect(200);
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
    const episode = await api(admin)
      .post('/api/v1/die/support-episodes')
      .send({
        studentId: student.id,
        startDate: '2026-09-01',
        reason: 'Acompañamiento sintético.',
        responsibleMemberAssignmentId: first.body.id,
      })
      .expect(201);
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
      await prisma.dieSupportEpisode.findUniqueOrThrow({
        where: {
          tenantId_id: {
            tenantId: 'die-tenant-a',
            id: episode.body.id,
          },
        },
      }),
    ).toMatchObject({ responsibleMemberAssignmentId: second.body.id });
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
    const outsiderTeacher = await teacher(
      'die-tenant-a',
      'outsider-user',
      'Docente',
      'Sin DIE',
    );
    const outsider = await token('die-tenant-a', 'outsider-user', ['TEACHER']);
    const student = await studentRecord('die-tenant-a', 'Sol', 'Reyes');
    const { course } = await academicContext(
      'die-tenant-a',
      student.id,
      '2026',
      '6° B',
    );
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
      .send({ filename: 'nota.txt', mimeType: 'text/plain', sizeBytes: 16 })
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

    const subject = await prisma.subject.create({
      data: { tenantId: 'die-tenant-a', name: 'Lenguaje' },
    });
    const courseSubject = await prisma.courseSubject.create({
      data: {
        tenantId: 'die-tenant-a',
        courseId: course.id,
        subjectId: subject.id,
      },
    });
    await prisma.courseSubjectTeacher.create({
      data: {
        tenantId: 'die-tenant-a',
        teacherId: outsiderTeacher.id,
        courseSubjectId: courseSubject.id,
      },
    });
    const unit = await prisma.learningUnit.create({
      data: {
        tenantId: 'die-tenant-a',
        courseSubjectId: courseSubject.id,
        title: 'Unidad visible al docente',
        status: 'ACTIVE',
      },
    });
    const learningItem = await prisma.learningItem.create({
      data: {
        tenantId: 'die-tenant-a',
        courseSubjectId: courseSubject.id,
        learningUnitId: unit.id,
        type: 'MATERIAL',
        title: 'Recurso académico',
        publicationStatus: 'PUBLISHED',
        publishedAt: new Date(),
        publishedByIdentityUserId: 'admin-a',
        createdByIdentityUserId: 'admin-a',
      },
    });
    await prisma.fileReference.create({
      data: {
        tenantId: 'die-tenant-a',
        fileObjectId: uploaded.body.id,
        referenceType: 'LEARNING_ITEM',
        category: 'LEARNING_MATERIAL',
        learningItemId: learningItem.id,
        createdByIdentityUserId: 'admin-a',
      },
    });

    // A DIE reference dominates every broader academic reference on the same
    // immutable file, so a teacher cannot bypass DIE through storage routes.
    await api(outsider)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(403);
    const download = await api(member)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(200);
    expect(download.text).toBe('contenido seguro');
    identity.sessionResponse = {
      active: false,
      identityUserId: 'member-user',
      membershipActive: false,
      membershipId: 'membership-die-tenant-a-member-user',
      sessionActive: true,
      sessionId: 'session-die-tenant-a-member-user',
      tenantId: 'die-tenant-a',
    };
    await api(member)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(403);
    await api(member)
      .get(`/api/v1/die/students/${student.id}/export.pdf`)
      .expect(403);
    identity.sessionResponse = {
      active: true,
      identityUserId: 'member-user',
      membershipActive: true,
      membershipId: 'membership-die-tenant-a-member-user',
      sessionActive: true,
      sessionId: 'session-die-tenant-a-member-user',
      tenantId: 'die-tenant-a',
    };
    const assignment = await prisma.dieMemberAssignment.findFirstOrThrow({
      where: {
        tenantId: 'die-tenant-a',
        identityUserId: 'member-user',
        removedAt: null,
      },
    });
    identity.sessionResponse = {
      active: true,
      identityUserId: 'admin-a',
      membershipActive: true,
      membershipId: 'membership-die-tenant-a-admin-a',
      sessionActive: true,
      sessionId: 'session-die-tenant-a-admin-a',
      tenantId: 'die-tenant-a',
    };
    await api(admin)
      .post(`/api/v1/die/members/${assignment.id}/remove`)
      .send({ reason: 'Salida sintética del equipo.' })
      .expect(201);
    await api(member)
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .expect(403);
    await api(member)
      .get(`/api/v1/die/students/${student.id}/export.pdf`)
      .expect(403);
    const rejoined = await token(
      'die-tenant-a',
      'member-user',
      ['TEACHER'],
      'replacement-membership',
    );
    identity.sessionResponse = {
      active: true,
      identityUserId: 'member-user',
      membershipActive: true,
      membershipId: 'replacement-membership',
      sessionActive: true,
      sessionId: 'session-die-tenant-a-member-user',
      tenantId: 'die-tenant-a',
    };
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
      .patch('/api/v1/tenant/operational-profile')
      .send({ institutionDisplayName: null, expectedVersion: 1 })
      .expect(200);
    await api(adminA)
      .get(`/api/v1/die/students/${student.id}/export.pdf`)
      .expect(409);
    await api(adminA)
      .patch('/api/v1/tenant/operational-profile')
      .send({
        institutionDisplayName: 'Colegio Sintético de Revisión',
        expectedVersion: 2,
      })
      .expect(200);
    const entries: Array<{ id: string }> = [];
    for (let index = 0; index < 14; index += 1) {
      entries.push(
        (
          await api(adminA)
            .post('/api/v1/die/journal-entries')
            .send({
              ...journalBody(student.id, episode.body.id),
              eventDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
              title: `Observación sintética ${index + 1}: acentos, inclusión y acompañamiento`,
              description:
                'Descripción objetiva extensa con información completamente sintética. '.repeat(
                  12,
                ),
            })
            .expect(201)
        ).body,
      );
    }
    await api(adminA)
      .post(`/api/v1/die/journal-entries/${entries[3]!.id}/void`)
      .send({ reason: 'Anulación sintética para validar la marca visual.' })
      .expect(201);
    const responsibleTeacher = await teacher(
      'die-tenant-a',
      'responsible-user',
      'José',
      'Álvarez',
    );
    const responsibleMember = await api(adminA)
      .post('/api/v1/die/members')
      .send({ teacherId: responsibleTeacher.id })
      .expect(201);
    await api(adminA)
      .post('/api/v1/die/actions')
      .send({
        studentId: student.id,
        journalEntryId: entries[0]!.id,
        title: 'Revisar adecuación de acceso sintética',
        description: 'Acción de evidencia con acentos y estado pendiente.',
        assigneeMemberAssignmentId: responsibleMember.body.id,
        dueDate: '2026-10-01',
      })
      .expect(201);

    const pdf = await api(adminA)
      .get(
        `/api/v1/die/students/${student.id}/export.pdf?includeVoided=true&from=2026-09-01&to=2026-09-14&category=OBSERVATION&authorIdentityUserId=admin-a`,
      )
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.body.length).toBeGreaterThan(10_000);
    const evidencePath = process.env.DIE_PDF_EVIDENCE_PATH;
    if (evidencePath) {
      await mkdir(dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, pdf.body);
    }
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
    await prisma.tenantOperationalProfile.create({
      data: {
        tenantId,
        institutionDisplayName: `Institución sintética ${tenantId}`,
        timeZone: 'America/Santiago',
        updatedByIdentityUserId: 'synthetic-test-setup',
      },
    });
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
      place: 'Biblioteca',
      title: 'Observación durante actividad',
      description:
        'El estudiante solicitó instrucciones por escrito y completó la actividad con ese apoyo.',
      immediateAction: 'Se entregó una pauta visual.',
      informationSource: 'WITNESSED',
      thirdPartySource: null,
      reason: null,
    };
  }
});
