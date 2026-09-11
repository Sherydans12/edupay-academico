import { describe, expect, it } from 'vitest';

import { TrustedIdentityPrincipal } from '../../identity/identity.types';
import { TrustedTenantContext } from '../../tenant/trusted-tenant-context';
import {
  mapStudentLearningRoute,
  mapTeacherLearningRoute,
} from './learning-read.mapper';
import type { LearningReadAggregate } from './learning-read.types';

const now = new Date('2026-08-24T12:00:00.000Z');
const principal = TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
  aud: 'academic-api',
  exp: 2_000_000_000,
  iat: 1_999_999_000,
  iss: 'https://identity.example.test',
  jti: 'token-id',
  membership_id: 'membership-a',
  nbf: 1_999_999_000,
  roles: ['TENANT_ADMIN'],
  sid: 'session-a',
  sub: 'identity-a',
  tenant_id: 'tenant-a',
});
const context = {
  principal,
  requestId: 'request-a',
  tenant: TrustedTenantContext.fromPrincipal(principal),
};

const aggregate: LearningReadAggregate = {
  courseSubject: {
    id: '10000000-0000-4000-8000-000000000003',
    tenantId: 'tenant-a',
    courseId: '10000000-0000-4000-8000-000000000001',
    subjectId: '10000000-0000-4000-8000-000000000002',
    status: 'ACTIVE',
    course: { status: 'ACTIVE', academicYear: { status: 'ACTIVE' } },
  },
  units: [
    {
      id: '10000000-0000-4000-8000-000000000004',
      tenantId: 'tenant-a',
      courseSubjectId: '10000000-0000-4000-8000-000000000003',
      title: 'Unidad',
      description: null,
      sortOrder: 0,
      startAt: null,
      endAt: null,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: '10000000-0000-4000-8000-000000000005',
          tenantId: 'tenant-a',
          courseSubjectId: '10000000-0000-4000-8000-000000000003',
          learningUnitId: '10000000-0000-4000-8000-000000000004',
          type: 'MATERIAL',
          title: 'Live title',
          description: null,
          content: 'live body',
          instructions: null,
          body: null,
          sortOrder: 0,
          publicationStatus: 'PUBLISHED',
          publishAt: null,
          publishedAt: now,
          dueAt: null,
          version: 3,
          createdAt: now,
          updatedAt: now,
          draft: { basedOnVersion: 3, updatedAt: now },
        },
      ],
    },
  ],
};

describe('learning read mapper', () => {
  it('D-01/D-02/D-05 maps Student/preview from live rows without draft metadata', () => {
    const result = mapStudentLearningRoute({ aggregate, context, now }, true);
    expect(result.units[0]?.items[0]).toEqual({
      id: aggregate.units[0]!.items[0]!.id,
      learningUnitId: aggregate.units[0]!.id,
      type: 'MATERIAL',
      title: 'Live title',
      description: null,
      content: 'live body',
      bodyDocument: null,
      instructions: null,
      body: null,
      sortOrder: 0,
      dueAt: null,
    });
    expect(JSON.stringify(result)).not.toContain('workingDraft');
    expect(JSON.stringify(result)).not.toContain('basedOnVersion');
    expect(JSON.stringify(result)).not.toContain('draft');
  });

  it('D-03 keeps live fields and adds only Teacher draft metadata', () => {
    const result = mapTeacherLearningRoute({ aggregate, context, now });
    expect(result.units[0]?.items[0]?.title).toBe('Live title');
    expect(result.units[0]?.items[0]?.content).toBe('live body');
    expect(result.units[0]?.items[0]?.workingDraft).toEqual({
      present: true,
      basedOnVersion: 3,
      updatedAt: now.toISOString(),
    });
  });

  it('D-04 maps absent Teacher draft as null', () => {
    const withoutDraft: LearningReadAggregate = {
      ...aggregate,
      units: [
        {
          ...aggregate.units[0]!,
          items: [{ ...aggregate.units[0]!.items[0]!, draft: null }],
        },
      ],
    };
    expect(
      mapTeacherLearningRoute({ aggregate: withoutDraft, context, now })
        .units[0]?.items[0]?.workingDraft,
    ).toBeNull();
  });

  it('S-10..S-13/P-01 filters inactive units and invisible items', () => {
    const filtered: LearningReadAggregate = {
      ...aggregate,
      units: [
        { ...aggregate.units[0]!, status: 'DRAFT' },
        {
          ...aggregate.units[0]!,
          id: '20000000-0000-4000-8000-000000000004',
          items: [
            {
              ...aggregate.units[0]!.items[0]!,
              learningUnitId: '20000000-0000-4000-8000-000000000004',
              publicationStatus: 'SCHEDULED',
              publishAt: new Date(now.getTime() + 1),
            },
          ],
        },
      ],
    };
    const result = mapStudentLearningRoute(
      { aggregate: filtered, context, now },
      true,
    );
    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.items).toEqual([]);
  });

  it('S-14/S-15 omits the learner tree when a parent gate is inactive', () => {
    const inactiveParent: LearningReadAggregate = {
      ...aggregate,
      courseSubject: { ...aggregate.courseSubject, status: 'ARCHIVED' },
    };
    expect(
      mapStudentLearningRoute({ aggregate: inactiveParent, context, now }, true)
        .units,
    ).toEqual([]);
  });
});
