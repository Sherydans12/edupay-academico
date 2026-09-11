import type {
  StudentCourseSubjectLearningRoute,
  StudentLearningItemRead,
  TeacherCourseSubjectLearningRoute,
  TeacherLearningItemRead,
} from '@edupay/contracts';

import { parseBodyDocumentForRead } from '../body-document';

import {
  canViewStudentItem,
  unitAvailableNow,
} from './learning-visibility.policy';
import type {
  LearningReadExecutionInput,
  LearningReadItemRow,
} from './learning-read.types';

const timestamp = (value: Date): string => value.toISOString();

function mapStudentItem(item: LearningReadItemRow): StudentLearningItemRead {
  return {
    id: item.id,
    learningUnitId: item.learningUnitId,
    type: item.type,
    title: item.title,
    description: item.description,
    content: item.content,
    instructions: item.instructions,
    body: item.body,
    bodyDocument: parseBodyDocumentForRead(item.bodyDocument),
    sortOrder: item.sortOrder,
    dueAt: item.dueAt ? timestamp(item.dueAt) : null,
  };
}

export function mapStudentLearningRoute(
  input: LearningReadExecutionInput,
  enrollmentAllowed: boolean,
): StudentCourseSubjectLearningRoute {
  const { aggregate, context, now } = input;
  const parentVisible =
    aggregate.courseSubject.tenantId === context.tenant.tenantId &&
    aggregate.courseSubject.course.academicYear.status === 'ACTIVE' &&
    aggregate.courseSubject.course.status === 'ACTIVE' &&
    aggregate.courseSubject.status === 'ACTIVE';
  const units = (parentVisible ? aggregate.units : [])
    .filter((unit) => unitAvailableNow(unit, now))
    .map((unit) => ({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      sortOrder: unit.sortOrder,
      startAt: unit.startAt ? timestamp(unit.startAt) : null,
      endAt: unit.endAt ? timestamp(unit.endAt) : null,
      items: unit.items
        .filter((item) =>
          canViewStudentItem({
            trustedTenantId: context.tenant.tenantId,
            courseSubject: aggregate.courseSubject,
            unit,
            item,
            now,
            enrollmentAllowed,
          }),
        )
        .map(mapStudentItem),
    }));

  return {
    courseSubject: {
      id: aggregate.courseSubject.id,
      courseId: aggregate.courseSubject.courseId,
      subjectId: aggregate.courseSubject.subjectId,
    },
    units,
  };
}

function mapTeacherItem(item: LearningReadItemRow): TeacherLearningItemRead {
  return {
    ...mapStudentItem(item),
    courseSubjectId: item.courseSubjectId,
    publicationStatus: item.publicationStatus,
    publishAt: item.publishAt ? timestamp(item.publishAt) : null,
    publishedAt: item.publishedAt ? timestamp(item.publishedAt) : null,
    version: item.version,
    createdAt: timestamp(item.createdAt),
    updatedAt: timestamp(item.updatedAt),
    workingDraft: item.draft
      ? {
          present: true,
          basedOnVersion: item.draft.basedOnVersion,
          updatedAt: timestamp(item.draft.updatedAt),
        }
      : null,
  };
}

export function mapTeacherLearningRoute(
  input: LearningReadExecutionInput,
): TeacherCourseSubjectLearningRoute {
  const { aggregate, context, now } = input;
  return {
    courseSubject: {
      id: aggregate.courseSubject.id,
      courseId: aggregate.courseSubject.courseId,
      subjectId: aggregate.courseSubject.subjectId,
      status: aggregate.courseSubject.status,
    },
    units: aggregate.units.map((unit) => ({
      id: unit.id,
      courseSubjectId: unit.courseSubjectId,
      title: unit.title,
      description: unit.description,
      sortOrder: unit.sortOrder,
      startAt: unit.startAt ? timestamp(unit.startAt) : null,
      endAt: unit.endAt ? timestamp(unit.endAt) : null,
      status: unit.status,
      version: unit.version,
      createdAt: timestamp(unit.createdAt),
      updatedAt: timestamp(unit.updatedAt),
      learnerVisibleNow:
        unitAvailableNow(unit, now) &&
        unit.items.some((item) =>
          canViewStudentItem({
            trustedTenantId: context.tenant.tenantId,
            courseSubject: aggregate.courseSubject,
            unit,
            item,
            now,
            enrollmentAllowed: true,
          }),
        ),
      items: unit.items.map(mapTeacherItem),
    })),
  };
}
