import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcademicRequestContext } from '../../academic/academic-context';
import { AuthorizationService } from '../../authorization/authorization.service';
import {
  TrustedIdentityPrincipal,
  type IdentityRole,
} from '../../identity/identity.types';
import type { CurrentIdentityStatusService } from '../../identity/current-identity-status.service';
import type { PrismaService } from '../../persistence/prisma.service';
import { TrustedTenantContext } from '../../tenant/trusted-tenant-context';
import type { LearningReadClock } from './learning-read.constants';
import { LearningReadService } from './learning-read.service';

const now = new Date('2026-08-24T12:00:00.000Z');
const ids = {
  course: '10000000-0000-4000-8000-000000000001',
  subject: '10000000-0000-4000-8000-000000000002',
  courseSubject: '10000000-0000-4000-8000-000000000003',
  unit: '10000000-0000-4000-8000-000000000004',
  item: '10000000-0000-4000-8000-000000000005',
};

const courseSubject = {
  id: ids.courseSubject,
  tenantId: 'tenant-a',
  courseId: ids.course,
  subjectId: ids.subject,
  status: 'ACTIVE',
  course: { status: 'ACTIVE', academicYear: { status: 'ACTIVE' } },
};

const item = {
  id: ids.item,
  tenantId: 'tenant-a',
  courseSubjectId: ids.courseSubject,
  learningUnitId: ids.unit,
  type: 'MATERIAL',
  title: 'Live',
  description: null,
  content: 'live',
  instructions: null,
  body: null,
  sortOrder: 0,
  publicationStatus: 'PUBLISHED',
  publishAt: null,
  publishedAt: now,
  dueAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const unit = {
  id: ids.unit,
  tenantId: 'tenant-a',
  courseSubjectId: ids.courseSubject,
  title: 'Unidad',
  description: null,
  sortOrder: 0,
  startAt: null,
  endAt: null,
  status: 'ACTIVE',
  version: 1,
  createdAt: now,
  updatedAt: now,
  items: [item],
};

function principal(
  roles: IdentityRole[],
  identityUserId = `identity-${roles.join('-').toLowerCase()}`,
  tenantId: string | undefined = 'tenant-a',
) {
  return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
    aud: 'academic-api',
    exp: 2_000_000_000,
    iat: 1_999_999_000,
    iss: 'https://identity.example.test',
    jti: `token-${identityUserId}`,
    membership_id: tenantId ? `membership-${identityUserId}` : undefined,
    nbf: 1_999_999_000,
    roles,
    sid: `session-${identityUserId}`,
    sub: identityUserId,
    tenant_id: tenantId,
  });
}

function context(roles: IdentityRole[]): AcademicRequestContext {
  const actor = principal(roles);
  return {
    principal: actor,
    requestId: 'request-a',
    tenant: TrustedTenantContext.fromPrincipal(actor),
  };
}

describe('LearningReadService', () => {
  let enabled: boolean;
  let prisma: {
    courseSubject: { findUnique: ReturnType<typeof vi.fn> };
    student: { findFirst: ReturnType<typeof vi.fn> };
    courseEnrollment: { findFirst: ReturnType<typeof vi.fn> };
    studentSubjectEnrollment: { findFirst: ReturnType<typeof vi.fn> };
    teacher: { findFirst: ReturnType<typeof vi.fn> };
    courseSubjectTeacher: { findFirst: ReturnType<typeof vi.fn> };
    learningUnit: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: LearningReadService;
  let requireCurrentActiveContext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    enabled = true;
    prisma = {
      courseSubject: { findUnique: vi.fn().mockResolvedValue(courseSubject) },
      student: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'student-a',
          tenantId: 'tenant-a',
          status: 'ACTIVE',
        }),
      },
      courseEnrollment: {
        findFirst: vi.fn().mockResolvedValue({
          tenantId: 'tenant-a',
          courseId: ids.course,
          status: 'ACTIVE',
        }),
      },
      studentSubjectEnrollment: { findFirst: vi.fn().mockResolvedValue(null) },
      teacher: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'teacher-a', status: 'ACTIVE' }),
      },
      courseSubjectTeacher: {
        findFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      learningUnit: { findMany: vi.fn().mockResolvedValue([unit]) },
    };
    const config = {
      get: vi.fn(() => (enabled ? 'true' : undefined)),
    } as unknown as ConfigService;
    const clock: LearningReadClock = { now: () => new Date(now) };
    requireCurrentActiveContext = vi.fn().mockResolvedValue(undefined);
    service = new LearningReadService(
      prisma as unknown as PrismaService,
      new AuthorizationService(),
      {
        requireCurrentActiveContext,
      } as unknown as CurrentIdentityStatusService,
      config,
      clock,
    );
  });

  it('F-01/D-06 returns the untouched legacy route while the flag is OFF', async () => {
    enabled = false;
    const legacy = { courseSubjectId: ids.courseSubject, units: [] };
    const legacyRead = vi.fn().mockResolvedValue(legacy);
    await expect(
      service.read(
        undefined,
        { audience: 'STUDENT', courseSubjectId: ids.courseSubject },
        legacyRead,
      ),
    ).resolves.toEqual(legacy);
    expect(legacyRead).toHaveBeenCalledOnce();
    expect(prisma.courseSubject.findUnique).not.toHaveBeenCalled();
  });

  it('F-02/F-03 switches new policy on and rolls back without persisted changes', async () => {
    const studentContext = context(['STUDENT']);
    await expect(
      service.read(studentContext, {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).resolves.toMatchObject({ courseSubject: { id: ids.courseSubject } });

    enabled = false;
    const legacyRead = vi.fn().mockResolvedValue({ legacy: true });
    await expect(
      service.read(
        studentContext,
        {
          audience: 'STUDENT',
          courseSubjectId: ids.courseSubject,
        },
        legacyRead,
      ),
    ).resolves.toEqual({ legacy: true });
  });

  it('T-01 returns 401 without a principal when V2 is ON', async () => {
    await expect(
      service.read(undefined, {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('T-02/T-03/T-08 scopes the lookup to the trusted tenant and returns safe 404', async () => {
    prisma.courseSubject.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.courseSubject.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_id: { tenantId: 'tenant-a', id: ids.courseSubject },
        },
      }),
    );
    expect(prisma.learningUnit.findMany).not.toHaveBeenCalled();
  });

  it('T-06 rejects a stale principal/context pairing before loading resources', async () => {
    const actor = principal(['TEACHER'], 'identity-current');
    const staleActor = principal(['TEACHER'], 'identity-stale');
    const staleContext: AcademicRequestContext = {
      principal: actor,
      requestId: 'request-stale',
      tenant: TrustedTenantContext.fromPrincipal(staleActor),
    };
    await expect(
      service.read(staleContext, {
        audience: 'TEACHER_AUTHORING',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.courseSubject.findUnique).not.toHaveBeenCalled();
  });

  it('T-06 rejects a session revoked between requests without cached authority', async () => {
    requireCurrentActiveContext.mockRejectedValueOnce(
      new ForbiddenException('The current Identity context is not authorized.'),
    );
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.courseSubject.findUnique).not.toHaveBeenCalled();
  });

  it('T-07/F-04 does not degrade actors into the other projection', async () => {
    await expect(
      service.read(context(['TEACHER']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'TEACHER_AUTHORING',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('S-01 reads Student by active course enrollment and never selects drafts', async () => {
    const result = await service.read(context(['STUDENT']), {
      audience: 'STUDENT',
      courseSubjectId: ids.courseSubject,
    });
    expect(result).toMatchObject({
      units: [{ items: [{ title: 'Live' }] }],
    });
    const select =
      prisma.learningUnit.findMany.mock.calls[0]?.[0].select.items.select;
    expect(select).not.toHaveProperty('draft');
  });

  it('S-02 permits direct active subject enrollment', async () => {
    prisma.courseEnrollment.findFirst.mockResolvedValueOnce(null);
    prisma.studentSubjectEnrollment.findFirst.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      courseSubjectId: ids.courseSubject,
      status: 'ACTIVE',
    });
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).resolves.toMatchObject({ courseSubject: { id: ids.courseSubject } });
  });

  it('S-03..S-06 rejects inactive student or missing exact enrollment', async () => {
    prisma.student.findFirst.mockResolvedValueOnce({
      id: 'student-a',
      tenantId: 'tenant-a',
      status: 'INACTIVE',
    });
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.courseEnrollment.findFirst.mockResolvedValueOnce(null);
    prisma.studentSubjectEnrollment.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('S-07..S-09 returns 404 when the learner parent lifecycle is inactive', async () => {
    prisma.courseSubject.findUnique.mockResolvedValueOnce({
      ...courseSubject,
      course: { status: 'ACTIVE', academicYear: { status: 'ARCHIVED' } },
    });
    await expect(
      service.read(context(['STUDENT']), {
        audience: 'STUDENT',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('W-07/P-01/P-02 uses only the injected server clock for scheduled reads', async () => {
    prisma.learningUnit.findMany.mockResolvedValueOnce([
      {
        ...unit,
        items: [
          {
            ...item,
            publicationStatus: 'SCHEDULED',
            publishAt: new Date(now.getTime() + 1),
          },
          {
            ...item,
            id: '20000000-0000-4000-8000-000000000005',
            publicationStatus: 'SCHEDULED',
            publishAt: now,
          },
        ],
      },
    ]);
    const result = (await service.read(context(['STUDENT']), {
      audience: 'STUDENT',
      courseSubjectId: ids.courseSubject,
    })) as { units: Array<{ items: Array<{ id: string }> }> };
    expect(result.units[0]?.items.map(({ id }) => id)).toEqual([
      '20000000-0000-4000-8000-000000000005',
    ]);
  });

  it('A-01/P-04/D-03 reads Teacher authoring and only draft metadata', async () => {
    prisma.learningUnit.findMany.mockResolvedValueOnce([
      {
        ...unit,
        items: [
          {
            ...item,
            publicationStatus: 'SCHEDULED',
            publishAt: new Date(now.getTime() + 60_000),
            draft: { basedOnVersion: 1, updatedAt: now },
          },
        ],
      },
    ]);
    const result = await service.read(context(['TEACHER']), {
      audience: 'TEACHER_AUTHORING',
      courseSubjectId: ids.courseSubject,
    });
    expect(result).toMatchObject({
      units: [
        {
          items: [
            {
              publicationStatus: 'SCHEDULED',
              workingDraft: { present: true, basedOnVersion: 1 },
            },
          ],
        },
      ],
    });
    const draftSelect =
      prisma.learningUnit.findMany.mock.calls[0]?.[0].select.items.select.draft
        .select;
    expect(draftSelect).toEqual({ basedOnVersion: true, updatedAt: true });
  });

  it('A-02/A-03 rejects an inactive or missing assignment on the next read', async () => {
    prisma.courseSubjectTeacher.findFirst.mockResolvedValueOnce({
      status: 'INACTIVE',
    });
    await expect(
      service.read(context(['TEACHER']), {
        audience: 'TEACHER_AUTHORING',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.learningUnit.findMany).not.toHaveBeenCalled();
  });

  it('A-04 permits tenant admin authoring without a teacher assignment', async () => {
    await expect(
      service.read(context(['TENANT_ADMIN']), {
        audience: 'TEACHER_AUTHORING',
        courseSubjectId: ids.courseSubject,
      }),
    ).resolves.toMatchObject({ courseSubject: { status: 'ACTIVE' } });
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });

  it('T-04/T-05 permits SYSTEM_ADMIN only with the trusted support context', async () => {
    const system = principal(['SYSTEM_ADMIN'], 'support-user', undefined);
    await expect(
      service.read(
        {
          principal: system,
          requestId: 'request-support',
          tenant: {} as TrustedTenantContext,
        },
        { audience: 'TEACHER_AUTHORING', courseSubjectId: ids.courseSubject },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const approvedTenant = context(['TENANT_ADMIN']).tenant;
    await expect(
      service.read(
        {
          principal: system,
          requestId: 'request-support',
          tenant: approvedTenant,
        },
        { audience: 'TEACHER_AUTHORING', courseSubjectId: ids.courseSubject },
      ),
    ).resolves.toMatchObject({ courseSubject: { id: ids.courseSubject } });
  });

  it('A-05/P-05/P-06 returns Student preview without enrollment or drafts', async () => {
    prisma.learningUnit.findMany.mockResolvedValue([
      {
        ...unit,
        items: [
          { ...item, draft: { basedOnVersion: 1, updatedAt: now } },
          {
            ...item,
            id: '20000000-0000-4000-8000-000000000005',
            publicationStatus: 'SCHEDULED',
            publishAt: new Date(now.getTime() + 1),
          },
        ],
      },
    ]);

    const studentResult = await service.read(context(['STUDENT']), {
      audience: 'STUDENT',
      courseSubjectId: ids.courseSubject,
    });
    prisma.student.findFirst.mockClear();

    const previewResult = await service.read(context(['TEACHER']), {
      audience: 'TEACHER_PREVIEW',
      courseSubjectId: ids.courseSubject,
    });
    expect(previewResult).toEqual(studentResult);
    expect(previewResult).toMatchObject({
      units: [{ items: [{ id: ids.item }] }],
    });
    expect(JSON.stringify(previewResult)).not.toContain('workingDraft');
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it('A-06 rejects studentId in preview before any database lookup', async () => {
    await expect(
      service.read(context(['TEACHER']), {
        audience: 'TEACHER_PREVIEW',
        courseSubjectId: ids.courseSubject,
        studentId: 'student-a',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.courseSubject.findUnique).not.toHaveBeenCalled();
  });

  it('A-07 rejects preview from an unassigned Teacher', async () => {
    prisma.courseSubjectTeacher.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.read(context(['TEACHER']), {
        audience: 'TEACHER_PREVIEW',
        courseSubjectId: ids.courseSubject,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('A-08 gives two active assigned Teachers the same authoring snapshot', async () => {
    const first = await service.read(context(['TEACHER']), {
      audience: 'TEACHER_AUTHORING',
      courseSubjectId: ids.courseSubject,
    });
    const second = await service.read(context(['TEACHER']), {
      audience: 'TEACHER_AUTHORING',
      courseSubjectId: ids.courseSubject,
    });
    expect(second).toEqual(first);
    expect(prisma.courseSubjectTeacher.findFirst).toHaveBeenCalledTimes(2);
  });
});
