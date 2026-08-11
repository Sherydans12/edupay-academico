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
  createReviewSchema,
  createSubmissionRevisionSchema,
  createSubmissionSchema,
  createUploadIntentSchema,
  inAppNotificationSchema,
  markedNotificationsSchema,
  notificationPageSchema,
  storageFileSchema,
  storagePolicySchema,
  storageUsageSchema,
  submissionSchema,
  unreadNotificationCountSchema,
  uploadIntentSchema,
  verifiedIdentityLinkSchema,
  syncStatusSchema,
  type SyncStatus,
  type CreateReview,
  type CreateSubmission,
  type CreateSubmissionRevision,
  type CreateUploadIntent,
  type InAppNotification,
  type NotificationPage,
  type StorageFile,
  type StoragePolicy,
  type StorageUsage,
  type Submission,
  type UploadIntent,
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
  type VerifiedIdentityLink,
} from '@edupay/contracts';
import { apiErrorEnvelopeSchema, type ApiErrorDetail } from '@edupay/contracts';
import type { z } from 'zod';

import type { IdentitySessionAdapter } from '@/auth/current-session';

type Schema<T> = z.ZodType<T>;
type FetchLike = typeof fetch;

export interface MultipartUploadOptions {
  url: string;
  token: string;
  requestId: string;
  fieldName: string;
  file: File;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export interface MultipartUploadResult {
  status: number;
  body: unknown;
}

export type MultipartUploadImpl = (
  options: MultipartUploadOptions,
) => Promise<MultipartUploadResult>;

/**
 * The only browser transport for file bytes. It intentionally owns the
 * XMLHttpRequest details so components only deal with progress and state.
 */
export const uploadMultipartWithXhr: MultipartUploadImpl = (options) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append(options.fieldName, options.file, options.file.name);
  let settled = false;

  const cleanup = () => {
    options.signal?.removeEventListener('abort', abort);
  };
  const settle = (callback: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };
  const abort = () => {
    xhr.abort();
    settle(() => {
      const error = new Error('UPLOAD_ABORTED');
      (error as Error & { code?: string }).code = 'UPLOAD_ABORTED';
      reject(error);
    });
  };

  xhr.open('POST', options.url);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.setRequestHeader('Authorization', `Bearer ${options.token}`);
  xhr.setRequestHeader('X-Request-Id', options.requestId);
  xhr.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
  });
  xhr.onload = () => settle(() => {
    const text = xhr.responseText;
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
    resolve({ status: xhr.status, body });
  });
  xhr.onerror = () => settle(() => reject(new Error('NETWORK_ERROR')));
  xhr.onabort = () => {
    if (!settled) abort();
  };
  if (options.signal?.aborted) {
    abort();
    return;
  }
  options.signal?.addEventListener('abort', abort, { once: true });
  xhr.send(formData);
});

export interface AcademicApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  sessionAdapter?: IdentitySessionAdapter | null;
  multipartUploadImpl?: MultipartUploadImpl;
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
  private readonly multipartUploadImpl: MultipartUploadImpl;

  constructor(options: AcademicApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sessionAdapter = options.sessionAdapter ?? null;
    this.multipartUploadImpl = options.multipartUploadImpl ?? uploadMultipartWithXhr;
  }

  private buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/')) {
      return /^https?:\/\//i.test(this.baseUrl)
        ? new URL(path, this.baseUrl).toString()
        : path;
    }
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }

  private async requestRaw(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const requestId = newRequestId();
    const token = await this.sessionAdapter?.getAccessToken();
    if (!token) throw new UnauthenticatedError();

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Request-Id', requestId);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(path), { ...init, headers });
    } catch {
      throw new AcademicApiError({
        code: 'NETWORK_ERROR', details: [], message: 'No pudimos conectar con Académico. Revisa tu conexión e inténtalo nuevamente.', requestId, status: 0,
      });
    }

    if (response.status === 401 && !retried && this.sessionAdapter) {
      const refreshed = await this.sessionAdapter.refreshAccessToken();
      if (refreshed && this.isSafeAfterAuthenticationRefresh(init.method)) {
        return this.requestRaw(path, init, true);
      }
      if (refreshed) {
        throw new AcademicApiError({
          code: 'AUTH_REFRESHED_RETRY_REQUIRED',
          details: [],
          message: 'Renovamos tu sesión, pero no repetimos esta acción para evitar duplicarla. Inténtalo nuevamente.',
          requestId,
          status: 401,
        });
      }
      await this.sessionAdapter.clearSession?.();
      throw new UnauthenticatedError('Tu sesión expiró. Vuelve a iniciar sesión en EduPay Identity.');
    }

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      const parsed = apiErrorEnvelopeSchema.safeParse(payload);
      throw new AcademicApiError({
        code: parsed.success ? parsed.data.error.code : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED',
        details: parsed.success ? parsed.data.error.details : [],
        message: parsed.success ? parsed.data.error.message : 'No pudimos completar la solicitud.',
        requestId: parsed.success ? parsed.data.error.requestId : requestId,
        status: response.status,
      });
    }
    return response;
  }

  private isSafeAfterAuthenticationRefresh(method = 'GET'): boolean {
    return ['GET', 'HEAD', 'OPTIONS', 'PUT'].includes(method.toUpperCase());
  }

  private async request<T>(path: string, schema: Schema<T>, init: RequestInit = {}): Promise<T> {
    const response = await this.requestRaw(path, init);
    const payload: unknown = await response.json().catch(() => undefined);
    return schema.parse(payload);
  }

  private async multipartError(status: number, body: unknown, requestId: string): Promise<never> {
    const parsed = apiErrorEnvelopeSchema.safeParse(body);
    throw new AcademicApiError({
      code: parsed.success ? parsed.data.error.code : status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED',
      details: parsed.success ? parsed.data.error.details : [],
      message: parsed.success ? parsed.data.error.message : 'No pudimos completar la carga del archivo.',
      requestId: parsed.success ? parsed.data.error.requestId : requestId,
      status,
    });
  }

  getTenant() { return this.request('tenant', tenantSchema); }
  getSyncStatus(): Promise<SyncStatus> { return this.request('sync/status', syncStatusSchema); }
  getStorageUsage(): Promise<StorageUsage> { return this.request('storage/usage', storageUsageSchema); }
  getStoragePolicy(): Promise<StoragePolicy> { return this.request('storage/policy', storagePolicySchema); }

  createUploadIntent(input: CreateUploadIntent): Promise<UploadIntent> {
    return this.request('file-upload-intents', uploadIntentSchema, {
      method: 'POST',
      body: JSON.stringify(createUploadIntentSchema.parse(input)),
    });
  }

  async completeUploadIntent(
    intent: UploadIntent,
    file: File,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
    retried = false,
  ): Promise<StorageFile> {
    const token = await this.sessionAdapter?.getAccessToken();
    if (!token) throw new UnauthenticatedError();
    const requestId = newRequestId();
    let result: MultipartUploadResult;
    try {
      const multipartOptions: MultipartUploadOptions = {
        file,
        fieldName: intent.upload.fieldName,
        requestId,
        token,
        url: this.buildUrl(intent.upload.path),
      };
      if (onProgress) multipartOptions.onProgress = onProgress;
      if (signal) multipartOptions.signal = signal;
      result = await this.multipartUploadImpl(multipartOptions);
    } catch (error) {
      if (error instanceof AcademicApiError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'UPLOAD_ABORTED') {
        throw new AcademicApiError({ code, details: [], message: 'La carga se canceló.', requestId, status: 0 });
      }
      throw new AcademicApiError({ code: 'NETWORK_ERROR', details: [], message: 'No pudimos conectar con Académico. Revisa tu conexión e inténtalo nuevamente.', requestId, status: 0 });
    }
    if (result.status === 401 && !retried && this.sessionAdapter) {
      const refreshed = await this.sessionAdapter.refreshAccessToken();
      if (refreshed) {
        throw new AcademicApiError({
          code: 'AUTH_REFRESHED_RETRY_REQUIRED',
          details: [],
          message: 'Renovamos tu sesión, pero no repetimos la carga para evitar duplicarla. Iníciala nuevamente.',
          requestId,
          status: 401,
        });
      }
      await this.sessionAdapter.clearSession?.();
      throw new UnauthenticatedError('Tu sesión expiró. Vuelve a iniciar sesión en EduPay Identity.');
    }
    if (result.status < 200 || result.status >= 300) await this.multipartError(result.status, result.body, requestId);
    return storageFileSchema.parse(result.body);
  }

  listLearningAttachments(learningItemId: string): Promise<StorageFile[]> {
    return this.request(`learning-items/${learningItemId}/attachments`, storageFileSchema.array());
  }

  async downloadFile(fileObjectId: string): Promise<{ blob: Blob; filename: string | null }> {
    const response = await this.requestRaw(`files/${fileObjectId}/download`, {
      headers: { Accept: 'application/octet-stream' },
    });
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename: string | null = null;
    const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const fallback = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
    if (encoded) {
      try { filename = decodeURIComponent(encoded); } catch { filename = encoded; }
    } else if (fallback) filename = fallback;
    return { blob: await response.blob(), filename };
  }
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
  linkStudentIdentity(id: string, input: VerifiedIdentityLink) {
    return this.request(`students/${id}/identity-link`, studentSchema, {
      method: 'PUT', body: JSON.stringify(verifiedIdentityLinkSchema.parse(input)),
    });
  }

  listTeachers(search?: string, cursor?: string) { return this.request(addQuery('teachers', { search, cursor, limit: 50 }), teacherPageSchema); }
  createTeacher(input: CreateTeacher) { return this.request('teachers', teacherSchema, { method: 'POST', body: JSON.stringify(createTeacherSchema.parse(input)) }); }
  updateTeacher(id: string, input: UpdateTeacher) { return this.request(`teachers/${id}`, teacherSchema, { method: 'PATCH', body: JSON.stringify(updateTeacherSchema.parse(input)) }); }
  activateTeacher(id: string) { return this.request(`teachers/${id}/activate`, teacherSchema, { method: 'POST' }); }
  linkTeacherIdentity(id: string, input: VerifiedIdentityLink) {
    return this.request(`teachers/${id}/identity-link`, teacherSchema, {
      method: 'PUT', body: JSON.stringify(verifiedIdentityLinkSchema.parse(input)),
    });
  }

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

  getOwnSubmission(learningItemId: string): Promise<Submission> {
    return this.request(`learning-items/${learningItemId}/submission`, submissionSchema);
  }

  getSubmission(submissionId: string): Promise<Submission> {
    return this.request(`submissions/${submissionId}`, submissionSchema);
  }

  listSubmissions(learningItemId: string): Promise<Submission[]> {
    return this.request(`learning-items/${learningItemId}/submissions`, submissionSchema.array());
  }

  submitLearningItem(learningItemId: string, input: CreateSubmission): Promise<Submission> {
    return this.request(`learning-items/${learningItemId}/submission`, submissionSchema, {
      method: 'POST',
      body: JSON.stringify(createSubmissionSchema.parse(input)),
    });
  }

  submitSubmissionRevision(submissionId: string, input: CreateSubmissionRevision): Promise<Submission> {
    return this.request(`submissions/${submissionId}/revisions`, submissionSchema, {
      method: 'POST',
      body: JSON.stringify(createSubmissionRevisionSchema.parse(input)),
    });
  }

  reviewSubmissionRevision(revisionId: string, input: CreateReview): Promise<Submission> {
    return this.request(`submission-revisions/${revisionId}/reviews`, submissionSchema, {
      method: 'POST',
      body: JSON.stringify(createReviewSchema.parse(input)),
    });
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

  listNotifications(cursor?: string, limit = 20): Promise<NotificationPage> {
    return this.request(addQuery('notifications', { cursor, limit }), notificationPageSchema);
  }

  getUnreadNotificationCount(): Promise<{ count: number }> {
    return this.request('notifications/unread-count', unreadNotificationCountSchema);
  }

  markNotificationRead(notificationId: string): Promise<InAppNotification> {
    return this.request(`notifications/${notificationId}/read`, inAppNotificationSchema, { method: 'PATCH' });
  }

  markAllNotificationsRead(): Promise<{ updatedCount: number }> {
    return this.request('notifications/read-all', markedNotificationsSchema, { method: 'POST' });
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
  | 'getStorageUsage'
  | 'getStoragePolicy'
  | 'createUploadIntent'
  | 'completeUploadIntent'
  | 'listLearningAttachments'
  | 'downloadFile'
  | 'getOwnSubmission'
  | 'getSubmission'
  | 'listSubmissions'
  | 'submitLearningItem'
  | 'submitSubmissionRevision'
  | 'reviewSubmissionRevision'
>;
