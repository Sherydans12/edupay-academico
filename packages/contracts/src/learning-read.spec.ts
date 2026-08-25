// The contract package is exercised by the workspace Vitest runner owned by the API.
// @ts-expect-error Vitest is intentionally not a production contract dependency.
import { describe, expect, it } from 'vitest';

import {
  courseSubjectLearningRouteSchema,
  studentCourseSubjectLearningRouteSchema,
  teacherCourseSubjectLearningRouteSchema,
  teacherLearnerPreviewQuerySchema,
  teacherLearnerPreviewRouteSchema,
} from './index.js';

const ids = {
  course: '10000000-0000-4000-8000-000000000001',
  subject: '10000000-0000-4000-8000-000000000002',
  courseSubject: '10000000-0000-4000-8000-000000000003',
  unit: '10000000-0000-4000-8000-000000000004',
  item: '10000000-0000-4000-8000-000000000005',
};
const timestamp = '2026-08-24T12:00:00.000Z';

const studentRoute = {
  courseSubject: {
    id: ids.courseSubject,
    courseId: ids.course,
    subjectId: ids.subject,
  },
  units: [
    {
      id: ids.unit,
      title: 'Unidad',
      description: null,
      sortOrder: 0,
      startAt: null,
      endAt: null,
      items: [
        {
          id: ids.item,
          learningUnitId: ids.unit,
          type: 'MATERIAL',
          title: 'Live',
          description: null,
          content: 'Visible',
          instructions: null,
          body: null,
          sortOrder: 0,
          dueAt: null,
        },
      ],
    },
  ],
} as const;

describe('learning read contracts', () => {
  it('C-01/C-02 rejects authoring and publication fields in Student', () => {
    const item = studentRoute.units[0].items[0];
    expect(
      studentCourseSubjectLearningRouteSchema.safeParse({
        ...studentRoute,
        units: [
          {
            ...studentRoute.units[0],
            items: [{ ...item, workingDraft: null }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      studentCourseSubjectLearningRouteSchema.safeParse({
        ...studentRoute,
        units: [
          {
            ...studentRoute.units[0],
            items: [{ ...item, publicationStatus: 'DRAFT' }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('C-03 accepts Teacher working-draft metadata without candidate body', () => {
    const result = teacherCourseSubjectLearningRouteSchema.safeParse({
      courseSubject: { ...studentRoute.courseSubject, status: 'ACTIVE' },
      units: [
        {
          ...studentRoute.units[0],
          courseSubjectId: ids.courseSubject,
          status: 'ACTIVE',
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          learnerVisibleNow: true,
          items: [
            {
              ...studentRoute.units[0].items[0],
              courseSubjectId: ids.courseSubject,
              publicationStatus: 'PUBLISHED',
              publishAt: null,
              publishedAt: timestamp,
              version: 2,
              createdAt: timestamp,
              updatedAt: timestamp,
              workingDraft: {
                present: true,
                basedOnVersion: 2,
                updatedAt: timestamp,
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('C-04 uses the exact Student schema for preview', () => {
    expect(teacherLearnerPreviewRouteSchema.parse(studentRoute)).toEqual(
      studentRoute,
    );
    expect(teacherLearnerPreviewRouteSchema).toBe(
      studentCourseSubjectLearningRouteSchema,
    );
  });

  it('C-05 rejects unknown preview selectors and unknown visibility keys', () => {
    expect(
      teacherLearnerPreviewQuerySchema.safeParse({ studentId: ids.item })
        .success,
    ).toBe(false);
    expect(
      studentCourseSubjectLearningRouteSchema.safeParse({
        ...studentRoute,
        learnerVisibleNow: true,
      }).success,
    ).toBe(false);
  });

  it('C-06 preserves the legacy flag-OFF schema', () => {
    expect(
      courseSubjectLearningRouteSchema.safeParse({
        courseSubjectId: ids.courseSubject,
        units: [],
      }).success,
    ).toBe(true);
  });
});
