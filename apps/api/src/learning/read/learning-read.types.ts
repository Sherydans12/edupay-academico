import type { LearningReadAudience } from '@edupay/contracts';

import type { AcademicRequestContext } from '../../academic/academic-context';

export type AcademicLifecycleStatus = 'ACTIVE' | string;
export type CourseSubjectLifecycleStatus = 'ACTIVE' | 'ARCHIVED';
export type LearningUnitLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type LearningItemLifecycleStatus =
  'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface LearningReadRequest {
  readonly audience: LearningReadAudience;
  readonly courseSubjectId: string;
}

export interface LearningReadCourseSubjectRow {
  readonly id: string;
  readonly tenantId: string;
  readonly courseId: string;
  readonly subjectId: string;
  readonly status: CourseSubjectLifecycleStatus;
  readonly course: {
    readonly status: AcademicLifecycleStatus;
    readonly academicYear: { readonly status: AcademicLifecycleStatus };
  };
}

export interface LearningReadDraftMetadataRow {
  readonly basedOnVersion: number;
  readonly updatedAt: Date;
}

export interface LearningReadItemRow {
  readonly id: string;
  readonly tenantId: string;
  readonly courseSubjectId: string;
  readonly learningUnitId: string;
  readonly type: 'MATERIAL' | 'ASSIGNMENT' | 'ASSESSMENT' | 'ANNOUNCEMENT';
  readonly title: string;
  readonly description: string | null;
  readonly content: string | null;
  readonly instructions: string | null;
  readonly body: string | null;
  readonly bodyDocument?: unknown;
  readonly sortOrder: number;
  readonly publicationStatus: LearningItemLifecycleStatus;
  readonly publishAt: Date | null;
  readonly publishedAt: Date | null;
  readonly dueAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly draft?: LearningReadDraftMetadataRow | null;
}

export interface LearningReadUnitRow {
  readonly id: string;
  readonly tenantId: string;
  readonly courseSubjectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly startAt: Date | null;
  readonly endAt: Date | null;
  readonly status: LearningUnitLifecycleStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: readonly LearningReadItemRow[];
}

export interface LearningReadAggregate {
  readonly courseSubject: LearningReadCourseSubjectRow;
  readonly units: readonly LearningReadUnitRow[];
}

export interface StudentReadEligibility {
  readonly student: {
    readonly tenantId: string;
    readonly status: string;
  };
  readonly courseEnrollment: {
    readonly tenantId: string;
    readonly courseId: string;
    readonly status: string;
  } | null;
  readonly subjectEnrollment: {
    readonly tenantId: string;
    readonly courseSubjectId: string;
    readonly status: string;
  } | null;
}

export interface LearningReadExecutionInput {
  readonly aggregate: LearningReadAggregate;
  readonly context: AcademicRequestContext;
  readonly now: Date;
  readonly studentEligibility?: StudentReadEligibility;
}
