import {
  academicYearPageSchema,
  academicYearSchema,
  courseEnrollmentSchema,
  coursePageSchema,
  courseRosterItemSchema,
  courseSchema,
  courseSubjectPageSchema,
  courseSubjectRosterItemSchema,
  courseSubjectSchema,
  courseSubjectTeacherSchema,
  createAcademicYearSchema,
  createCourseSchema,
  createCourseSubjectSchema,
  createCourseEnrollmentSchema,
  createStudentSchema,
  createStudentSubjectEnrollmentSchema,
  createSubjectSchema,
  createTeacherSchema,
  studentPageSchema,
  studentSchema,
  studentSubjectEnrollmentSchema,
  subjectPageSchema,
  subjectSchema,
  teacherPageSchema,
  teacherSchema,
  tenantSchema,
  updateAcademicYearSchema,
  updateCourseSchema,
  updateCourseSubjectSchema,
  updateStudentSchema,
  updateSubjectSchema,
  updateTeacherSchema,
  assignCourseSubjectTeachersSchema,
  courseSubjectLearningRouteSchema,
  createLearningItemSchema,
  createLearningUnitSchema,
  learningItemSchema,
  learningUnitSchema,
  reorderLearningSchema,
  scheduleLearningItemSchema,
  updateLearningItemSchema,
  updateLearningUnitSchema,
  type CreateAcademicYear,
  type CreateCourse,
  type CreateCourseEnrollment,
  type CreateCourseSubject,
  type CreateStudent,
  type CreateStudentSubjectEnrollment,
  type CreateSubject,
  type CreateTeacher,
  type AssignCourseSubjectTeachers,
  type CreateLearningItem,
  type CreateLearningUnit,
  type ReorderLearning,
  type ScheduleLearningItem,
  type UpdateLearningItem,
  type UpdateLearningUnit,
  type UpdateAcademicYear,
  type UpdateCourse,
  type UpdateCourseSubject,
  type UpdateStudent,
  type UpdateSubject,
  type UpdateTeacher,
} from '@edupay/contracts';
import { apiErrorEnvelopeSchema, type ApiErrorDetail } from '@edupay/contracts';
import type { z } from 'zod';

import type { IdentitySessionAdapter } from '@/auth/current-session';

type Schema<T> = z.ZodType<T>;
type FetchLike = typeof fetch;

export interface AcademicApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  sessionAdapter?: IdentitySessionAdapter | null;
}

export class AcademicApiError extends Error {
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly requestId: string;
  readonly status: number;

  constructor({ code, details, message, requestId, status }: {
    code: string;
    details: readonly ApiErrorDetail[];
    message: string;
    requestId: string;
    status: number;
  }) {
    super(message);
    this.name = 'AcademicApiError';
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.status = status;
  }
}

export class UnauthenticatedError extends AcademicApiError {
  constructor(message = 'Tu sesión no está disponible. Vuelve a iniciar sesión en EduPay Identity.') {
    super({ code: 'UNAUTHENTICATED', details: [], message, requestId: 'unavailable', status: 401 });
    this.name = 'UnauthenticatedError';
  }
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export class AcademicApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sessionAdapter: IdentitySessionAdapter | null;

  constructor(options: AcademicApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sessionAdapter = options.sessionAdapter ?? null;
  }

  private async request<T>(path: string, schema: Schema<T>, init: RequestInit = {}, retried = false): Promise<T> {
    const requestId = newRequestId();
    const token = await this.sessionAdapter?.getAccessToken();
    if (!token) throw new UnauthenticatedError();

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Request-Id', requestId);
    if (init.body) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, '')}`, { ...init, headers });
    } catch {
      throw new AcademicApiError({
        code: 'NETWORK_ERROR', details: [], message: 'No pudimos conectar con Académico. Revisa tu conexión e inténtalo nuevamente.', requestId, status: 0,
      });
    }

    if (response.status === 401 && !retried && this.sessionAdapter) {
      const refreshed = await this.sessionAdapter.refreshAccessToken();
      if (refreshed) return this.request(path, schema, init, true);
      await this.sessionAdapter.clearSession?.();
      throw new UnauthenticatedError('Tu sesión expiró. Vuelve a iniciar sesión en EduPay Identity.');
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = apiErrorEnvelopeSchema.safeParse(payload);
      throw new AcademicApiError({
        code: parsed.success ? parsed.data.error.code : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED',
        details: parsed.success ? parsed.data.error.details : [],
        message: parsed.success ? parsed.data.error.message : 'No pudimos completar la solicitud.',
        requestId: parsed.success ? parsed.data.error.requestId : requestId,
        status: response.status,
      });
    }
    return schema.parse(payload);
  }

  getTenant() { return this.request('tenant', tenantSchema); }
  listAcademicYears(cursor?: string) { return this.request(addQuery('academic-years', { cursor, limit: 50 }), academicYearPageSchema); }
  createAcademicYear(input: CreateAcademicYear) { return this.request('academic-years', academicYearSchema, { method: 'POST', body: JSON.stringify(createAcademicYearSchema.parse(input)) }); }
  updateAcademicYear(id: string, input: UpdateAcademicYear) { return this.request(`academic-years/${id}`, academicYearSchema, { method: 'PATCH', body: JSON.stringify(updateAcademicYearSchema.parse(input)) }); }

  listCourses(academicYearId?: string, cursor?: string) { return this.request(addQuery('courses', { academicYearId, cursor, limit: 50 }), coursePageSchema); }
  createCourse(input: CreateCourse) { return this.request('courses', courseSchema, { method: 'POST', body: JSON.stringify(createCourseSchema.parse(input)) }); }
  updateCourse(id: string, input: UpdateCourse) { return this.request(`courses/${id}`, courseSchema, { method: 'PATCH', body: JSON.stringify(updateCourseSchema.parse(input)) }); }
  getCourseRoster(id: string) { return this.request(`courses/${id}/roster`, courseRosterItemSchema.array()); }

  listStudents(search?: string, cursor?: string) { return this.request(addQuery('students', { search, cursor, limit: 50 }), studentPageSchema); }
  createStudent(input: CreateStudent) { return this.request('students', studentSchema, { method: 'POST', body: JSON.stringify(createStudentSchema.parse(input)) }); }
  updateStudent(id: string, input: UpdateStudent) { return this.request(`students/${id}`, studentSchema, { method: 'PATCH', body: JSON.stringify(updateStudentSchema.parse(input)) }); }
  activateStudent(id: string) { return this.request(`students/${id}/activate`, studentSchema, { method: 'POST' }); }

  listTeachers(search?: string, cursor?: string) { return this.request(addQuery('teachers', { search, cursor, limit: 50 }), teacherPageSchema); }
  createTeacher(input: CreateTeacher) { return this.request('teachers', teacherSchema, { method: 'POST', body: JSON.stringify(createTeacherSchema.parse(input)) }); }
  updateTeacher(id: string, input: UpdateTeacher) { return this.request(`teachers/${id}`, teacherSchema, { method: 'PATCH', body: JSON.stringify(updateTeacherSchema.parse(input)) }); }
  activateTeacher(id: string) { return this.request(`teachers/${id}/activate`, teacherSchema, { method: 'POST' }); }

  listSubjects(cursor?: string) { return this.request(addQuery('subjects', { cursor, limit: 50 }), subjectPageSchema); }
  createSubject(input: CreateSubject) { return this.request('subjects', subjectSchema, { method: 'POST', body: JSON.stringify(createSubjectSchema.parse(input)) }); }
  updateSubject(id: string, input: UpdateSubject) { return this.request(`subjects/${id}`, subjectSchema, { method: 'PATCH', body: JSON.stringify(updateSubjectSchema.parse(input)) }); }

  listCourseSubjects(courseId?: string, cursor?: string) { return this.request(addQuery('course-subjects', { courseId, cursor, limit: 50 }), courseSubjectPageSchema); }
  createCourseSubject(input: CreateCourseSubject) { return this.request('course-subjects', courseSubjectSchema, { method: 'POST', body: JSON.stringify(createCourseSubjectSchema.parse(input)) }); }
  updateCourseSubject(id: string, input: UpdateCourseSubject) { return this.request(`course-subjects/${id}`, courseSubjectSchema, { method: 'PATCH', body: JSON.stringify(updateCourseSubjectSchema.parse(input)) }); }
  getCourseSubjectRoster(id: string) { return this.request(`course-subjects/${id}/roster`, courseSubjectRosterItemSchema.array()); }
  getAssignedTeachers(id: string) { return this.request(`course-subjects/${id}/teachers`, courseSubjectTeacherSchema.array()); }
  assignCourseSubjectTeachers(input: AssignCourseSubjectTeachers) { return this.request('course-subject-teachers', courseSubjectTeacherSchema.array(), { method: 'POST', body: JSON.stringify(assignCourseSubjectTeachersSchema.parse(input)) }); }

  enrollStudent(input: CreateCourseEnrollment) { return this.request('course-enrollments', courseEnrollmentSchema, { method: 'POST', body: JSON.stringify(createCourseEnrollmentSchema.parse(input)) }); }
  directlyEnrollStudent(input: CreateStudentSubjectEnrollment) { return this.request('student-subject-enrollments', studentSubjectEnrollmentSchema, { method: 'POST', body: JSON.stringify(createStudentSubjectEnrollmentSchema.parse(input)) }); }

  getStudentContextSubjects() { return this.request('student-context/course-subjects', courseSubjectSchema.array()); }
  getTeacherContextSubjects() { return this.request('teacher-context/course-subjects', courseSubjectSchema.array()); }
  getTeacherCourseSubjectRoster(id: string) { return this.request(`course-subjects/${id}/roster`, courseSubjectRosterItemSchema.array()); }

  getLearningRoute(courseSubjectId: string) {
    return this.request(`course-subjects/${courseSubjectId}/learning`, courseSubjectLearningRouteSchema);
  }

  listLearningUnits(courseSubjectId: string) {
    return this.request(`course-subjects/${courseSubjectId}/learning-units`, learningUnitSchema.array());
  }

  getLearningUnit(id: string) {
    return this.request(`learning-units/${id}`, learningUnitSchema);
  }

  listLearningItems(learningUnitId: string) {
    return this.request(`learning-units/${learningUnitId}/items`, learningItemSchema.array());
  }

  getLearningItem(id: string) {
    return this.request(`learning-items/${id}`, learningItemSchema);
  }

  createLearningUnit(input: CreateLearningUnit) {
    return this.request('learning-units', learningUnitSchema, {
      method: 'POST',
      body: JSON.stringify(createLearningUnitSchema.parse(input)),
    });
  }

  updateLearningUnit(id: string, input: UpdateLearningUnit) {
    return this.request(`learning-units/${id}`, learningUnitSchema, {
      method: 'PATCH',
      body: JSON.stringify(updateLearningUnitSchema.parse(input)),
    });
  }

  archiveLearningUnit(id: string) {
    return this.request(`learning-units/${id}/archive`, learningUnitSchema, { method: 'POST' });
  }

  reorderLearningUnits(courseSubjectId: string, input: ReorderLearning) {
    return this.request(`course-subjects/${courseSubjectId}/learning-units/reorder`, learningUnitSchema.array(), {
      method: 'POST',
      body: JSON.stringify(reorderLearningSchema.parse(input)),
    });
  }

  createLearningItem(learningUnitId: string, input: CreateLearningItem) {
    return this.request(`learning-units/${learningUnitId}/items`, learningItemSchema, {
      method: 'POST',
      body: JSON.stringify(createLearningItemSchema.parse(input)),
    });
  }

  updateLearningItem(id: string, input: UpdateLearningItem) {
    return this.request(`learning-items/${id}`, learningItemSchema, {
      method: 'PATCH',
      body: JSON.stringify(updateLearningItemSchema.parse(input)),
    });
  }

  scheduleLearningItem(id: string, input: ScheduleLearningItem) {
    return this.request(`learning-items/${id}/schedule`, learningItemSchema, {
      method: 'POST',
      body: JSON.stringify(scheduleLearningItemSchema.parse(input)),
    });
  }

  publishLearningItem(id: string) {
    return this.request(`learning-items/${id}/publish`, learningItemSchema, { method: 'POST' });
  }

  archiveLearningItem(id: string) {
    return this.request(`learning-items/${id}/archive`, learningItemSchema, { method: 'POST' });
  }

  reorderLearningItems(learningUnitId: string, input: ReorderLearning) {
    return this.request(`learning-units/${learningUnitId}/items/reorder`, learningItemSchema.array(), {
      method: 'POST',
      body: JSON.stringify(reorderLearningSchema.parse(input)),
    });
  }
}

export type LearningApiClient = Pick<
  AcademicApiClient,
  | 'getLearningRoute'
  | 'listLearningUnits'
  | 'getLearningUnit'
  | 'listLearningItems'
  | 'getLearningItem'
  | 'createLearningUnit'
  | 'updateLearningUnit'
  | 'archiveLearningUnit'
  | 'reorderLearningUnits'
  | 'createLearningItem'
  | 'updateLearningItem'
  | 'scheduleLearningItem'
  | 'publishLearningItem'
  | 'archiveLearningItem'
  | 'reorderLearningItems'
>;
