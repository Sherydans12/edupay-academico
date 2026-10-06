'use client';

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DropdownItem,
  DropdownMenu,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from '@edupay/ui';
import type {
  CourseSubject,
  LearningItem,
  LearningUnitWithItems,
  Submission,
  SubmissionRevision,
} from '@edupay/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { AppShell } from '@/components/app-shell';
import { ContentHistoryDrawer } from '@/components/content-history-drawer';
import {
  EmptyTeacherSubjectsIllustration,
  PriorityReviewIllustration,
  TeacherHeroIllustration,
} from '@/components/educational-illustrations';
import { Icon } from '@/components/icons';
import {
  CompactStat,
  PageHeading,
  SubjectCard,
} from '@/components/page-primitives';
import { TeacherAttachmentDialog } from '@/components/teacher-attachment-manager';
import { TeacherCollaborationWorkspace } from '@/components/teacher-collaboration-workspace';
import { TeacherContentEditor } from '@/components/teacher-content-editor';
import {
  TeacherSubmissionDetail,
  TeacherSubmissionQueue,
  formatDate,
  getTeacherRoster,
  latestRevision,
  studentInitials,
  studentName,
  submissionStatus,
  type Roster,
} from '@/components/teacher-submission-workflow';
import { ScrollableTabsBar } from '@/components/scrollable-tabs-bar';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { demoSessions } from '@/demo/demo-data';
import {
  learningDateTimeLocalToInstant,
  learningInstantToDateTimeLocal,
} from '@/features/learning-datetime';
import {
  courseName,
  errorCopy,
  formatInstant,
  isSensitiveConfirmationError,
  subjectCard,
  subjectName,
} from '@/features/learning-screen-support';
import {
  CourseBuilder,
  CourseOutline,
  ItemEditor,
  ItemRow,
  MoveItemDialog,
  UnitCard,
  UnitEditor,
} from './course-builder';

export {
  CourseBuilder,
  CourseOutline,
  ItemEditor,
  ItemRow,
  MoveItemDialog,
  UnitCard,
  UnitEditor,
};

type LearningRouteData = Awaited<
  ReturnType<AcademicApiClient['getLearningRoute']>
>;

function apiFormError(error: unknown): string {
  if (error instanceof AcademicApiError) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues
      .map((issue: { message: string }) => issue.message)
      .join(' ');
  }
  return 'Revisa los campos e inténtalo nuevamente.';
}

function TeacherDataState({
  children,
  error,
  loading,
  onRetry,
}: {
  children: React.ReactNode;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div aria-label="Cargando contenido docente" className="academic-loading">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (error) {
    const copy = errorCopy(error);
    return (
      <Alert
        action={
          <Button onClick={onRetry} variant="secondary">
            Reintentar
          </Button>
        }
        title={copy.title}
        tone={copy.title === 'Acceso no autorizado' ? 'warning' : 'error'}
      >
        {copy.body}
        {error instanceof AcademicApiError &&
        error.requestId !== 'unavailable' ? (
          <small className="request-id">Referencia: {error.requestId}</small>
        ) : null}
      </Alert>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// 1. TEACHER DASHBOARD SCREEN (/docente)
// ---------------------------------------------------------------------------

interface TeacherWorkspaceSummary {
  subjects: CourseSubject[];
  routes: Array<{ subject: CourseSubject; route: LearningRouteData }>;
  pendingSubmissionsCount: number;
  draftsCount: number;
  scheduledCount: number;
  upcomingDeadlines: Array<{
    item: LearningItem;
    subject: CourseSubject;
    kind: 'DUE' | 'PUBLISH';
    date: string;
  }>;
}

function useTeacherDashboardData(api: AcademicApiClient) {
  const [data, setData] = useState<TeacherWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const routes =
        typeof api.getLearningRoute === 'function'
          ? await Promise.all(
              subjects.map(async (subject) => {
                try {
                  const route = await api.getLearningRoute(subject.id);
                  return { route, subject };
                } catch {
                  return {
                    route: { courseSubjectId: subject.id, units: [] },
                    subject,
                  };
                }
              }),
            )
          : [];

      let pendingCount = 0;
      let drafts = 0;
      let scheduled = 0;
      const deadlines: TeacherWorkspaceSummary['upcomingDeadlines'] = [];

      for (const { route, subject } of routes) {
        for (const unit of route.units) {
          for (const item of unit.items) {
            if (item.publicationStatus === 'DRAFT') {
              drafts++;
            } else if (item.publicationStatus === 'SCHEDULED') {
              scheduled++;
              if (item.publishAt) {
                deadlines.push({
                  date: item.publishAt,
                  item,
                  kind: 'PUBLISH',
                  subject,
                });
              }
            }

            if (item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT') {
              if (item.dueAt) {
                deadlines.push({
                  date: item.dueAt,
                  item,
                  kind: 'DUE',
                  subject,
                });
              }

              if (typeof api.listSubmissions === 'function') {
                try {
                  const subs = await api.listSubmissions(item.id);
                  pendingCount += subs.filter(
                    (s) => s.status === 'SUBMITTED',
                  ).length;
                } catch {
                  // Ignore per-item submission error
                }
              }
            }
          }
        }
      }

      deadlines.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      setData({
        draftsCount: drafts,
        pendingSubmissionsCount: pendingCount,
        routes,
        scheduledCount: scheduled,
        subjects,
        upcomingDeadlines: deadlines.slice(0, 5),
      });
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { data, error, load, loading };
}

export function TeacherDashboardScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { data, error, load, loading } = useTeacherDashboardData(client);

  const teacherFirstName = currentSession.displayName.split(' ')[0] ?? 'Docente';

  return (
    <AppShell dataMode="real" session={currentSession}>
      {/* 1. Hero Banner de Bienvenida Cálido y Pedagógico */}
      <div className="teacher-hero">
        <div className="teacher-hero__content">
          <span className="teacher-hero__badge">
            <Icon name="sparkles" />
            Año Académico 2026 · Período Activo
          </span>
          <h1 className="teacher-hero__title">
            Buenos días, {teacherFirstName}
          </h1>
          <p className="teacher-hero__text">
            Tus asignaturas asignadas y sus rutas de aprendizaje reales.
            {data
              ? ` Tienes ${data.subjects.length} ${
                  data.subjects.length === 1
                    ? 'asignatura asignada'
                    : 'asignaturas asignadas'
                } y ${data.pendingSubmissionsCount} ${
                  data.pendingSubmissionsCount === 1
                    ? 'entrega pendiente'
                    : 'entregas pendientes'
                } de revisión hoy.`
              : ' Conectando con tus espacios de aprendizaje...'}
          </p>
          <div className="teacher-hero__actions">
            <Link
              className="teacher-hero__cta teacher-hero__cta--primary"
              href="/docente/asignaturas"
            >
              <Icon name="book-open" />
              Ver contenido
            </Link>
            <Link
              className="teacher-hero__cta teacher-hero__cta--secondary"
              href="/docente/revisiones"
            >
              <Icon name="file-text" />
              {data && data.pendingSubmissionsCount > 0
                ? `${data.pendingSubmissionsCount} por revisar`
                : 'Bandeja de revisiones'}
            </Link>
          </div>
        </div>
        <TeacherHeroIllustration className="teacher-hero__illustration" />
      </div>

      <TeacherDataState
        error={error}
        loading={loading}
        onRetry={() => void load()}
      >
        {data ? (
          <>
            {/* 2. Tarjetas de Estadísticas Vivas (KPIs Docentes) */}
            <div className="teacher-stats-grid">
              <Link className="teacher-stat-card" href="/docente/asignaturas">
                <div className="teacher-stat-card__top">
                  <div className="teacher-stat__icon teacher-stat__icon--blue">
                    <Icon name="book-open" />
                  </div>
                  <span className="teacher-stat__badge teacher-stat__badge--success">
                    Activas
                  </span>
                </div>
                <div className="teacher-stat__value">{data.subjects.length}</div>
                <div className="teacher-stat__label">
                  {data.subjects.length === 1
                    ? 'Asignatura a cargo'
                    : 'Asignaturas a cargo'}
                </div>
                <div className="teacher-stat__meta">
                  Cursos con carga lectiva asignada
                </div>
                <div className="teacher-stat__footer">
                  <span>Abrir materias</span>
                  <Icon name="arrow-right" />
                </div>
              </Link>

              <Link className="teacher-stat-card" href="/docente/revisiones">
                <div className="teacher-stat-card__top">
                  <div className="teacher-stat__icon teacher-stat__icon--amber">
                    <Icon name="file-text" />
                  </div>
                  {data.pendingSubmissionsCount > 0 ? (
                    <span className="teacher-stat__badge teacher-stat__badge--warning">
                      Requiere acción
                    </span>
                  ) : (
                    <span className="teacher-stat__badge teacher-stat__badge--success">
                      Al día
                    </span>
                  )}
                </div>
                <div className="teacher-stat__value">
                  {data.pendingSubmissionsCount}
                </div>
                <div className="teacher-stat__label">
                  {data.pendingSubmissionsCount === 1
                    ? 'Entrega por calificar'
                    : 'Entregas por calificar'}
                </div>
                <div className="teacher-stat__meta">
                  Trabajos esperando tu retroalimentación
                </div>
                <div className="teacher-stat__footer">
                  <span>Abrir correcciones</span>
                  <Icon name="arrow-right" />
                </div>
              </Link>

              <Link className="teacher-stat-card" href="/docente/calendario">
                <div className="teacher-stat-card__top">
                  <div className="teacher-stat__icon teacher-stat__icon--purple">
                    <Icon name="calendar" />
                  </div>
                  <span className="teacher-stat__badge teacher-stat__badge--success">
                    Programadas
                  </span>
                </div>
                <div className="teacher-stat__value">{data.scheduledCount}</div>
                <div className="teacher-stat__label">
                  {data.scheduledCount === 1
                    ? 'Publicación agendada'
                    : 'Publicaciones agendadas'}
                </div>
                <div className="teacher-stat__meta">
                  Contenidos con fecha de salida futura
                </div>
                <div className="teacher-stat__footer">
                  <span>Ver calendario</span>
                  <Icon name="arrow-right" />
                </div>
              </Link>

              <Link className="teacher-stat-card" href="/docente/asignaturas">
                <div className="teacher-stat-card__top">
                  <div className="teacher-stat__icon teacher-stat__icon--emerald">
                    <Icon name="edit" />
                  </div>
                  <span className="teacher-stat__badge teacher-stat__badge--warning">
                    Borradores
                  </span>
                </div>
                <div className="teacher-stat__value">{data.draftsCount}</div>
                <div className="teacher-stat__label">
                  {data.draftsCount === 1
                    ? 'Contenido en edición'
                    : 'Contenidos en edición'}
                </div>
                <div className="teacher-stat__meta">
                  Materiales o evaluaciones no publicadas
                </div>
                <div className="teacher-stat__footer">
                  <span>Continuar edición</span>
                  <Icon name="arrow-right" />
                </div>
              </Link>
            </div>

            {/* 3. Estructura Principal a 2 Columnas */}
            <div className="teacher-main-grid">
              {/* Columna Izquierda: Mis Asignaturas */}
              <section
                aria-labelledby="teacher-subjects-heading"
                className="teacher-subjects-section"
              >
                <div className="teacher-section-header">
                  <div className="teacher-section-header__left">
                    <div className="teacher-section-header__icon">
                      <Icon name="book-open" />
                    </div>
                    <div>
                      <h2
                        className="teacher-section-header__title"
                        id="teacher-subjects-heading"
                      >
                        Mis asignaturas
                      </h2>
                      <p className="teacher-section-header__desc">
                        Abre un curso para organizar sus unidades de aprendizaje,
                        tareas y evaluaciones.
                      </p>
                    </div>
                  </div>
                  <Link
                    className="teacher-section-header__link"
                    href="/docente/asignaturas"
                  >
                    <span>Ver todas</span>
                    <Icon name="arrow-right" />
                  </Link>
                </div>

                {data.subjects.length ? (
                  <div className="teacher-subjects-grid">
                    {data.subjects.slice(0, 6).map((subject, index) => {
                      const subjectRoute = data.routes.find(
                        (r) => r.subject.id === subject.id,
                      )?.route;
                      const unitsCount = subjectRoute?.units.length ?? 0;
                      const itemsCount =
                        subjectRoute?.units.reduce(
                          (acc, u) => acc + u.items.length,
                          0,
                        ) ?? 0;
                      const sName = subjectName(subject);
                      const cName = courseName(subject);
                      const cardMeta = subjectCard(subject, index, 'teacher');

                      return (
                        <Link
                          className="teacher-subject-card"
                          href={cardMeta.href}
                          key={subject.id}
                        >
                          <div
                            className={`teacher-subject-card__strip teacher-subject-card__strip--${cardMeta.accent}`}
                          />
                          <div className="teacher-subject-card__body">
                            <div className="teacher-subject-card__top">
                              <span
                                className={`teacher-subject-card__code teacher-subject-card__code--${cardMeta.accent}`}
                              >
                                {cardMeta.code}
                              </span>
                              <span className="teacher-subject-card__course">
                                {cName}
                              </span>
                            </div>

                            <h3 className="teacher-subject-card__title">
                              {sName}
                            </h3>
                            <p className="teacher-subject-card__desc">
                              {cName} · Ciclo lectivo regular
                            </p>

                            <div className="teacher-subject-card__pills">
                              <span className="teacher-pill">
                                <Icon name="layers" />
                                {unitsCount}{' '}
                                {unitsCount === 1 ? 'unidad' : 'unidades'}
                              </span>
                              <span className="teacher-pill">
                                <Icon name="file-text" />
                                {itemsCount}{' '}
                                {itemsCount === 1 ? 'contenido' : 'contenidos'}
                              </span>
                            </div>

                            <div className="teacher-subject-card__footer">
                              <span>Gestionar asignatura</span>
                              <Icon name="arrow-right" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="teacher-empty-state">
                    <EmptyTeacherSubjectsIllustration className="teacher-empty-state__ill" />
                    <h3>No tienes asignaturas asignadas</h3>
                    <p>
                      Un administrador del colegio debe asignarte a una o más
                      asignaturas activas para gestionar contenido pedagógico.
                    </p>
                  </div>
                )}
              </section>

              {/* Columna Derecha: Panel Contextual de Atención & Próximas Fechas */}
              <aside className="teacher-aside-panel">
                {/* Bloque A: Estado de Revisiones / Atención Prioritaria */}
                <div
                  className={`teacher-priority-card ${
                    data.pendingSubmissionsCount > 0
                      ? 'teacher-priority-card--warning'
                      : 'teacher-priority-card--success'
                  }`}
                >
                  <span className="teacher-priority-card__badge">
                    <Icon
                      name={
                        data.pendingSubmissionsCount > 0
                          ? 'alert-circle'
                          : 'check-circle'
                      }
                    />
                    {data.pendingSubmissionsCount > 0
                      ? 'Atención prioritaria'
                      : 'Entregas al día'}
                  </span>
                  <h3 className="teacher-priority-card__title">
                    {data.pendingSubmissionsCount > 0
                      ? `${data.pendingSubmissionsCount} ${
                          data.pendingSubmissionsCount === 1
                            ? 'entrega por calificar'
                            : 'entregas por calificar'
                        }`
                      : '¡Todo corregido!'}
                  </h3>
                  <p className="teacher-priority-card__desc">
                    {data.pendingSubmissionsCount > 0
                      ? 'Hay estudiantes que han enviado sus actividades y esperan tu retroalimentación pedagógica.'
                      : 'No tienes entregas pendientes de revisión en tus asignaturas en este momento.'}
                  </p>
                  <Link
                    className="teacher-priority-card__btn"
                    href="/docente/revisiones"
                  >
                    <Icon name="file-text" />
                    {data.pendingSubmissionsCount > 0
                      ? 'Revisar entregas ahora'
                      : 'Ver historial de revisiones'}
                  </Link>
                </div>

                {/* Bloque B: Próximos Vencimientos y Publicaciones Programadas */}
                <div className="teacher-deadlines-card">
                  <div className="teacher-deadlines-card__header">
                    <div className="teacher-deadlines-card__icon">
                      <Icon name="calendar" />
                    </div>
                    <div>
                      <h3 className="teacher-deadlines-card__title">
                        Próximos plazos
                      </h3>
                      <p className="teacher-deadlines-card__subtitle">
                        Vencimientos y salidas programadas
                      </p>
                    </div>
                  </div>

                  {data.upcomingDeadlines.length ? (
                    <div className="teacher-deadlines-list">
                      {data.upcomingDeadlines.map((dl, idx) => (
                        <div
                          className="deadline-item"
                          key={`${dl.item.id}-${idx}`}
                        >
                          <div
                            className={`deadline-item__icon deadline-item__icon--${dl.kind.toLowerCase()}`}
                          >
                            <Icon
                              name={dl.kind === 'DUE' ? 'clock' : 'calendar'}
                            />
                          </div>
                          <div className="deadline-item__content">
                            <div className="deadline-item__header">
                              <span className="deadline-item__type">
                                {dl.kind === 'DUE'
                                  ? 'Vence entrega'
                                  : 'Publicación'}
                              </span>
                              <time className="deadline-item__time">
                                {formatInstant(dl.date)}
                              </time>
                            </div>
                            <strong className="deadline-item__title">
                              {dl.item.title}
                            </strong>
                            <span className="deadline-item__course">
                              {subjectName(dl.subject)} · {courseName(dl.subject)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="deadlines-empty">
                      No hay fechas límite o publicaciones agendadas para los
                      próximos días.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          </>
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 2. TEACHER SUBJECTS SCREEN (/docente/asignaturas)
// ---------------------------------------------------------------------------

function useTeacherContexts(api: AcademicApiClient) {
  const [subjects, setSubjects] = useState<
    Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>
  >([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubjects(await api.getTeacherContextSubjects());
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { error, load, loading, subjects };
}

export function TeacherSubjectsScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherContexts(client);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Solo aparecen las asignaturas donde el servidor reconoce una asignación docente activa."
        title="Asignaturas"
      />

      <TeacherDataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {data.subjects.length ? (
          <div className="subject-grid subject-grid--overview">
            {data.subjects.map((subject, index) => (
              <SubjectCard
                key={subject.id}
                subject={subjectCard(subject, index, 'teacher')}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Un administrador debe asignarte a una asignatura activa para gestionar contenido."
            icon={<Icon name="book" />}
            title="No tienes asignaturas asignadas"
          />
        )}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 3. TEACHER SUBJECT / COURSE WORKSPACE (/docente/asignaturas/[id])
// ---------------------------------------------------------------------------

type UnitFormDraft = {
  id?: string | undefined;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
};

type ItemFormDraft = {
  id?: string | undefined;
  type: LearningItem['type'];
  title: string;
  description: string;
  content: string;
  instructions: string;
  body: string;
  dueAt: string;
};

function initialUnitDraft(unit?: LearningUnitWithItems): UnitFormDraft {
  return {
    description: unit?.description ?? '',
    endAt: learningInstantToDateTimeLocal(unit?.endAt ?? null),
    id: unit?.id,
    startAt: learningInstantToDateTimeLocal(unit?.startAt ?? null),
    title: unit?.title ?? '',
  };
}

function initialItemDraft(item?: LearningItem | null): ItemFormDraft {
  return {
    body: item?.body ?? '',
    content: item?.content ?? '',
    description: item?.description ?? '',
    dueAt: learningInstantToDateTimeLocal(item?.dueAt ?? null),
    id: item?.id,
    instructions: item?.instructions ?? '',
    title: item?.title ?? '',
    type: item?.type ?? 'MATERIAL',
  };
}

function useTeacherRoute(
  api: AcademicApiClient,
  requestedCourseSubjectId?: string,
) {
  const [subjects, setSubjects] = useState<
    Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>
  >([]);
  const [route, setRoute] = useState<LearningRouteData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const selected =
    subjects.find((subject) => subject.id === requestedCourseSubjectId) ??
    (requestedCourseSubjectId ? undefined : subjects[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSubjects = await api.getTeacherContextSubjects();
      setSubjects(nextSubjects);
      const nextSubject =
        nextSubjects.find(
          (subject) => subject.id === requestedCourseSubjectId,
        ) ?? (requestedCourseSubjectId ? undefined : nextSubjects[0]);
      if (!nextSubject) {
        setRoute(null);
        return;
      }
      setRoute(await api.getLearningRoute(nextSubject.id));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, requestedCourseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refreshRoute = useCallback(async () => {
    const subject = selected;
    if (!subject) return;
    try {
      const nextRoute = await api.getLearningRoute(subject.id);
      setRoute(nextRoute);
    } catch (nextError) {
      throw nextError;
    }
  }, [api, selected]);

  return { error, load, loading, refreshRoute, route, selected, subjects };
}

export function LegacyTeacherSubjectWorkspace({
  api,
  courseSubjectId,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient | undefined;
  courseSubjectId?: string | undefined;
  session?: TrustedCurrentSession | undefined;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);

  // Editor states
  const [unitFormDraft, setUnitFormDraft] = useState<UnitFormDraft | null>(
    null,
  );
  const [itemFormDraft, setItemFormDraft] = useState<{
    unitId: string;
    values: ItemFormDraft;
  } | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<{
    itemId: string;
    value: string;
  } | null>(null);
  const [fullscreenEditorItem, setFullscreenEditorItem] = useState<{
    item: LearningItem | null;
    unit: LearningUnitWithItems;
  } | null>(null);
  const [attachmentItem, setAttachmentItem] = useState<LearningItem | null>(
    null,
  );
  const [historyEntity, setHistoryEntity] = useState<{
    type: 'LEARNING_UNIT' | 'LEARNING_ITEM';
    id: string;
    title: string;
    version: number;
  } | null>(null);
  const [moveItemData, setMoveItemData] = useState<{
    item: LearningItem;
    currentUnitId: string;
  } | null>(null);
  const [targetUnitId, setTargetUnitId] = useState('');
  const [moving, setMoving] = useState(false);

  // Confirmation & status states
  const [confirmation, setConfirmation] = useState<{
    body: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  async function refresh() {
    // Keep the route mounted and the current viewport intact after normal
    // authoring mutations. The initial load remains responsible for subjects.
    await data.refreshRoute();
  }

  async function runAction(
    action: () => Promise<void>,
    success = 'Cambios guardados.',
    confirmedAction = action,
  ) {
    setSaving(true);
    setFormError('');
    setActionStatus('');
    try {
      await action();
      await refresh();
      setActionStatus(success);
    } catch (err) {
      if (isSensitiveConfirmationError(err)) {
        setConfirmation({
          body:
            err instanceof Error
              ? err.message
              : 'Este cambio puede afectar contenido publicado o evidencia histórica.',
          run: confirmedAction,
        });
      } else {
        setFormError(apiFormError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  // Unit operations
  async function saveUnit() {
    if (!unitFormDraft || !data.selected) return;
    const currentSubjectId = data.selected.id;

    await runAction(async () => {
      if (unitFormDraft.id) {
        await client.updateLearningUnit(unitFormDraft.id, {
          description: unitFormDraft.description || null,
          endAt: learningDateTimeLocalToInstant(unitFormDraft.endAt) ?? null,
          startAt:
            learningDateTimeLocalToInstant(unitFormDraft.startAt) ?? null,
          title: unitFormDraft.title.trim(),
        });
      } else {
        await client.createLearningUnit({
          courseSubjectId: currentSubjectId,
          description: unitFormDraft.description || undefined,
          endAt: learningDateTimeLocalToInstant(unitFormDraft.endAt),
          sortOrder: 0,
          startAt: learningDateTimeLocalToInstant(unitFormDraft.startAt),
          title: unitFormDraft.title.trim(),
        });
      }
      setUnitFormDraft(null);
    });
  }

  async function duplicateUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.duplicateLearningUnit(unit.id, {
        duplicateItems: true,
        title: `${unit.title} (Copia)`,
      });
    }, 'Unidad duplicada.');
  }

  async function archiveUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.archiveLearningUnit(unit.id);
    }, 'Unidad archivada.');
  }

  async function restoreUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.restoreLearningUnit(unit.id);
    }, 'Unidad restaurada como borrador.');
  }

  async function activateUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.updateLearningUnit(unit.id, { status: 'ACTIVE' });
    }, 'Unidad activada.');
  }

  async function moveUnit(index: number, direction: -1 | 1) {
    const route = data.route;
    const subject = data.selected;
    if (!route || !subject) return;
    const next = index + direction;
    if (next < 0 || next >= route.units.length) return;

    const orderedIds = route.units.map((u) => u.id);
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    await runAction(
      async () => {
        await client.reorderLearningUnits(subject.id, { orderedIds });
      },
      direction === -1
        ? 'Unidad movida hacia arriba.'
        : 'Unidad movida hacia abajo.',
    );
  }

  // Item inline save operations
  function itemInput(values: ItemFormDraft, confirmSensitiveChange = false) {
    const deliverable =
      values.type === 'ASSIGNMENT' || values.type === 'ASSESSMENT';
    return {
      body:
        values.type === 'ANNOUNCEMENT' ? values.body || undefined : undefined,
      confirmSensitiveChange,
      content:
        values.type === 'MATERIAL' ? values.content || undefined : undefined,
      description: values.description || undefined,
      dueAt: deliverable
        ? learningDateTimeLocalToInstant(values.dueAt)
        : undefined,
      instructions: deliverable ? values.instructions || undefined : undefined,
      title: values.title.trim(),
      type: values.type,
    };
  }

  async function saveItem() {
    if (!itemFormDraft) return;
    const draft = itemFormDraft;
    const execute = async (confirmSensitiveChange: boolean) => {
      const input = itemInput(draft.values, confirmSensitiveChange);
      if (draft.values.id) {
        await client.updateLearningItem(draft.values.id, input);
      } else {
        const { confirmSensitiveChange: _, ...createInput } = input;
        void _;
        await client.createLearningItem(draft.unitId, {
          ...createInput,
          dueAt: input.dueAt ?? undefined,
          sortOrder: 0,
        });
      }
      setItemFormDraft(null);
    };
    await runAction(
      () => execute(false),
      'Cambios guardados.',
      () => execute(true),
    );
  }

  async function publish(item: LearningItem) {
    await runAction(async () => {
      await client.publishLearningItem(item.id);
    }, 'Contenido publicado.');
  }

  async function schedule(item: LearningItem) {
    if (!scheduleDraft) return;
    const value = learningDateTimeLocalToInstant(scheduleDraft.value);
    if (!value) {
      setFormError('Selecciona una fecha futura para programar.');
      return;
    }
    await runAction(
      () =>
        client
          .scheduleLearningItem(item.id, {
            confirmSensitiveChange: false,
            publishAt: value,
          })
          .then(() => {
            setScheduleDraft(null);
          }),
      'Publicación programada.',
      () =>
        client
          .scheduleLearningItem(item.id, {
            confirmSensitiveChange: true,
            publishAt: value,
          })
          .then(() => {
            setScheduleDraft(null);
          }),
    );
  }

  async function moveItem(
    unit: LearningUnitWithItems,
    index: number,
    direction: -1 | 1,
  ) {
    const next = index + direction;
    if (next < 0 || next >= unit.items.length) return;

    const orderedIds = unit.items.map((i) => i.id);
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    await runAction(
      async () => {
        await client.reorderLearningItems(unit.id, { orderedIds });
      },
      direction === -1
        ? 'Contenido movido hacia arriba.'
        : 'Contenido movido hacia abajo.',
    );
  }

  async function executeMoveItemToUnit() {
    if (!moveItemData || !targetUnitId) return;
    setMoving(true);
    try {
      await client.moveLearningItem(moveItemData.item.id, {
        targetLearningUnitId: targetUnitId,
      });
      setMoveItemData(null);
      await refresh();
      setActionStatus('Contenido movido a la unidad seleccionada.');
    } catch (err) {
      setFormError(apiFormError(err));
    } finally {
      setMoving(false);
    }
  }

  async function duplicateItem(item: LearningItem) {
    await runAction(async () => {
      await client.duplicateLearningItem(item.id, {
        title: `${item.title} (Copia)`,
      });
    }, 'Contenido duplicado.');
  }

  async function archiveItem(item: LearningItem) {
    await runAction(async () => {
      await client.archiveLearningItem(item.id);
    }, 'Contenido archivado.');
  }

  async function restoreItem(item: LearningItem) {
    await runAction(async () => {
      await client.restoreLearningItem(item.id);
    }, 'Contenido restaurado como borrador.');
  }

  async function confirmSensitive() {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.run();
      setConfirmation(null);
      await refresh();
      setActionStatus('Cambios guardados.');
    } catch (err) {
      setFormError(apiFormError(err));
    } finally {
      setConfirming(false);
    }
  }

  // Count items by state
  const counts = useMemo(() => {
    let drafts = 0;
    let scheduled = 0;
    let published = 0;
    if (data.route) {
      for (const u of data.route.units) {
        for (const it of u.items) {
          if (it.publicationStatus === 'DRAFT') drafts++;
          else if (it.publicationStatus === 'SCHEDULED') scheduled++;
          else if (it.publicationStatus === 'PUBLISHED') published++;
        }
      }
    }
    return { drafts, published, scheduled };
  }, [data.route]);

  const missingSubject =
    !data.loading && !data.error && (!data.selected || !data.route);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherDataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {missingSubject ? (
          <EmptyState
            description="No tienes autorización para gestionar este espacio o ya no se encuentra activo."
            icon={<Icon name="book" />}
            title="Asignatura no disponible"
          />
        ) : data.selected && data.route ? (
          <>
            {/* Breadcrumb Navigation */}
            <nav aria-label="Ruta de navegación" className="breadcrumbs">
              <Link href="/docente/asignaturas">Asignaturas</Link>
              <Icon name="chevron-right" />
              <span>
                {subjectName(data.selected)} · {courseName(data.selected)}
              </span>
            </nav>

            {/* Authoring Workspace Header */}
            <section className="teacher-subject-header">
              <div className="teacher-subject-header__title-area">
                <div className="subject-hero__mark">
                  {subjectName(data.selected).slice(0, 3).toUpperCase()}
                </div>
                <div>
                  <h1>{subjectName(data.selected)}</h1>
                  <p>
                    {courseName(data.selected)} · Espacio de autoría docente
                  </p>
                </div>
              </div>

              <div className="header-actions">
                <div className="header-status-pills">
                  <Badge tone="neutral">Borradores: {counts.drafts}</Badge>
                  <Badge tone="info">Programados: {counts.scheduled}</Badge>
                  <Badge tone="success">Publicados: {counts.published}</Badge>
                </div>

                <Button
                  onClick={() => setUnitFormDraft(initialUnitDraft())}
                  variant="secondary"
                >
                  <Icon name="plus" />
                  Nueva unidad
                </Button>

                <Link
                  className="button-link button-link--primary"
                  href={`/docente/asignaturas/${data.selected.id}/estudiantes`}
                >
                  <Icon name="people" />
                  Ver estudiantes
                </Link>
              </div>
            </section>

            {formError ? (
              <Alert title="No se pudo completar la acción" tone="error">
                {formError}
              </Alert>
            ) : null}
            {actionStatus ? (
              <p
                aria-live="polite"
                className="teacher-action-status"
                role="status"
              >
                {actionStatus}
              </p>
            ) : null}

            {/* Slide-over Unit Form */}
            {unitFormDraft ? (
              <div
                className="course-editor-drawer-overlay"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setUnitFormDraft(null);
                }}
              >
                <aside
                  aria-label={
                    unitFormDraft.id ? 'Editar unidad' : 'Nueva unidad'
                  }
                  aria-modal="true"
                  className="course-editor-drawer"
                  role="dialog"
                >
                  <form
                    className="course-editor-drawer__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveUnit();
                    }}
                  >
                    <div className="course-editor-drawer__header">
                      <div>
                        <h3>
                          {unitFormDraft.id ? 'Editar unidad' : 'Nueva unidad'}
                        </h3>
                        <p>
                          Las unidades nuevas quedan en borrador hasta que las
                          actives.
                        </p>
                      </div>
                      <Button
                        aria-label="Cerrar panel de edición"
                        onClick={() => setUnitFormDraft(null)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="close" />
                      </Button>
                    </div>
                    <div className="course-editor-drawer__body">
                      <div className="learning-editor-grid">
                        <Input
                          id="unit-title"
                          label="Título"
                          maxLength={160}
                          onChange={(event) =>
                            setUnitFormDraft({
                              ...unitFormDraft,
                              title: event.target.value,
                            })
                          }
                          required
                          value={unitFormDraft.title}
                        />
                        <Textarea
                          id="unit-description"
                          label="Descripción (opcional)"
                          onChange={(event) =>
                            setUnitFormDraft({
                              ...unitFormDraft,
                              description: event.target.value,
                            })
                          }
                          value={unitFormDraft.description}
                        />
                        <Input
                          id="unit-start"
                          label="Disponible desde (opcional)"
                          onChange={(event) =>
                            setUnitFormDraft({
                              ...unitFormDraft,
                              startAt: event.target.value,
                            })
                          }
                          type="datetime-local"
                          value={unitFormDraft.startAt}
                        />
                        <Input
                          id="unit-end"
                          label="Disponible hasta (opcional)"
                          onChange={(event) =>
                            setUnitFormDraft({
                              ...unitFormDraft,
                              endAt: event.target.value,
                            })
                          }
                          type="datetime-local"
                          value={unitFormDraft.endAt}
                        />
                      </div>
                    </div>
                    <div className="course-editor-drawer__footer">
                      <Button
                        onClick={() => setUnitFormDraft(null)}
                        type="button"
                        variant="secondary"
                      >
                        Cancelar
                      </Button>
                      <Button loading={saving} type="submit">
                        {unitFormDraft.id ? 'Guardar unidad' : 'Crear unidad'}
                      </Button>
                    </div>
                  </form>
                </aside>
              </div>
            ) : null}

            {/* Slide-over Item Form */}
            {itemFormDraft ? (
              <div
                className="course-editor-drawer-overlay"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setItemFormDraft(null);
                }}
              >
                <aside
                  aria-label={
                    itemFormDraft.values.id
                      ? 'Editar contenido'
                      : 'Nuevo contenido'
                  }
                  aria-modal="true"
                  className="course-editor-drawer"
                  role="dialog"
                >
                  <form
                    className="course-editor-drawer__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveItem();
                    }}
                  >
                    <div className="course-editor-drawer__header">
                      <div>
                        <h3>
                          {itemFormDraft.values.id
                            ? 'Editar contenido'
                            : 'Nuevo contenido'}
                        </h3>
                        <p>
                          Elige el tipo y completa sólo la información
                          necesaria.
                        </p>
                      </div>
                      <Button
                        aria-label="Cerrar panel de edición"
                        onClick={() => setItemFormDraft(null)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="close" />
                      </Button>
                    </div>
                    <div className="course-editor-drawer__body">
                      <div className="learning-editor-grid">
                        <Select
                          id="item-type"
                          label="Tipo"
                          onChange={(event) => {
                            setItemFormDraft({
                              ...itemFormDraft,
                              values: {
                                ...itemFormDraft.values,
                                dueAt:
                                  event.target.value === 'MATERIAL' ||
                                  event.target.value === 'ANNOUNCEMENT'
                                    ? ''
                                    : itemFormDraft.values.dueAt,
                                type: event.target
                                  .value as LearningItem['type'],
                              },
                            });
                            window.requestAnimationFrame(() =>
                              document.getElementById('item-title')?.focus(),
                            );
                          }}
                          value={itemFormDraft.values.type}
                        >
                          <option value="MATERIAL">Material</option>
                          <option value="ASSIGNMENT">Actividad</option>
                          <option value="ASSESSMENT">
                            Evaluación en documento
                          </option>
                          <option value="ANNOUNCEMENT">Anuncio</option>
                        </Select>

                        <Input
                          id="item-title"
                          label="Título"
                          maxLength={160}
                          onChange={(event) =>
                            setItemFormDraft({
                              ...itemFormDraft,
                              values: {
                                ...itemFormDraft.values,
                                title: event.target.value,
                              },
                            })
                          }
                          required
                          value={itemFormDraft.values.title}
                        />

                        <Textarea
                          id="item-description"
                          label="Descripción (opcional)"
                          onChange={(event) =>
                            setItemFormDraft({
                              ...itemFormDraft,
                              values: {
                                ...itemFormDraft.values,
                                description: event.target.value,
                              },
                            })
                          }
                          value={itemFormDraft.values.description}
                        />

                        {itemFormDraft.values.type === 'MATERIAL' ? (
                          <Textarea
                            id="item-content"
                            label="Contenido"
                            onChange={(event) =>
                              setItemFormDraft({
                                ...itemFormDraft,
                                values: {
                                  ...itemFormDraft.values,
                                  content: event.target.value,
                                },
                              })
                            }
                            value={itemFormDraft.values.content}
                          />
                        ) : null}

                        {itemFormDraft.values.type === 'ANNOUNCEMENT' ? (
                          <Textarea
                            id="item-body"
                            label="Mensaje"
                            onChange={(event) =>
                              setItemFormDraft({
                                ...itemFormDraft,
                                values: {
                                  ...itemFormDraft.values,
                                  body: event.target.value,
                                },
                              })
                            }
                            required
                            value={itemFormDraft.values.body}
                          />
                        ) : null}

                        {itemFormDraft.values.type === 'ASSIGNMENT' ||
                        itemFormDraft.values.type === 'ASSESSMENT' ? (
                          <>
                            <Textarea
                              id="item-instructions"
                              label="Instrucciones"
                              onChange={(event) =>
                                setItemFormDraft({
                                  ...itemFormDraft,
                                  values: {
                                    ...itemFormDraft.values,
                                    instructions: event.target.value,
                                  },
                                })
                              }
                              required
                              value={itemFormDraft.values.instructions}
                            />
                            <Input
                              id="item-due"
                              label="Fecha de entrega"
                              onChange={(event) =>
                                setItemFormDraft({
                                  ...itemFormDraft,
                                  values: {
                                    ...itemFormDraft.values,
                                    dueAt: event.target.value,
                                  },
                                })
                              }
                              required
                              type="datetime-local"
                              value={itemFormDraft.values.dueAt}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="course-editor-drawer__footer">
                      <Button
                        onClick={() => setItemFormDraft(null)}
                        type="button"
                        variant="secondary"
                      >
                        Cancelar
                      </Button>
                      <Button loading={saving} type="submit">
                        {itemFormDraft.values.id
                          ? 'Guardar contenido'
                          : 'Crear contenido'}
                      </Button>
                    </div>
                  </form>
                </aside>
              </div>
            ) : null}

            {/* Tabs: Workspace / Submissions / Collaboration */}
            <Tabs
              items={[
                {
                  content: (
                    <div className="authoring-workspace-body">
                      <div className="authoring-toolbar">
                        <div>
                          <h2>Ruta de aprendizaje</h2>
                          <p>
                            Organiza unidades, materiales, actividades,
                            evaluaciones y anuncios de esta asignatura.
                          </p>
                        </div>
                        <Badge tone="info">Vista docente</Badge>
                      </div>

                      {/* Units Outline */}
                      {data.route.units.length ? (
                        <div className="teacher-units-list">
                          {data.route.units.map((unit, unitIndex) => (
                            <section
                              className="teacher-unit-panel"
                              key={unit.id}
                            >
                              {/* Unit Header */}
                              <header className="teacher-unit-header">
                                <div className="teacher-unit-marker">
                                  <span>{unitIndex + 1}</span>
                                </div>

                                <div className="teacher-unit-title-group">
                                  <div className="teacher-unit-title-row">
                                    <h3>{unit.title}</h3>
                                    <Badge
                                      tone={
                                        unit.status === 'ACTIVE'
                                          ? 'info'
                                          : 'neutral'
                                      }
                                    >
                                      {unit.status === 'ACTIVE'
                                        ? `${unit.items.length} contenido${unit.items.length === 1 ? '' : 's'}`
                                        : unit.status === 'DRAFT'
                                          ? 'Borrador'
                                          : 'Archivada'}
                                    </Badge>
                                    {unit.startAt || unit.endAt ? (
                                      <small className="unit-availability-badge">
                                        <Icon name="calendar" />
                                        {unit.startAt
                                          ? `Desde ${formatInstant(unit.startAt)}`
                                          : ''}
                                        {unit.endAt
                                          ? ` hasta ${formatInstant(unit.endAt)}`
                                          : ''}
                                      </small>
                                    ) : null}
                                  </div>
                                  <p>
                                    {unit.description ||
                                      'Sin descripción para esta unidad.'}
                                  </p>
                                </div>

                                <div className="teacher-unit-actions">
                                  <Button
                                    aria-label={`Mover ${unit.title} hacia arriba`}
                                    disabled={unitIndex === 0 || saving}
                                    onClick={() => void moveUnit(unitIndex, -1)}
                                    size="icon"
                                    title="Mover hacia arriba"
                                    variant="ghost"
                                  >
                                    <Icon name="arrow-up" />
                                  </Button>
                                  <Button
                                    aria-label={`Mover ${unit.title} hacia abajo`}
                                    disabled={
                                      unitIndex ===
                                        data.route!.units.length - 1 || saving
                                    }
                                    onClick={() => void moveUnit(unitIndex, 1)}
                                    size="icon"
                                    title="Mover hacia abajo"
                                    variant="ghost"
                                  >
                                    <Icon name="arrow-down" />
                                  </Button>

                                  <Button
                                    disabled={unit.status === 'ARCHIVED'}
                                    onClick={() =>
                                      setUnitFormDraft(initialUnitDraft(unit))
                                    }
                                    size="sm"
                                    variant="secondary"
                                  >
                                    Editar unidad
                                  </Button>

                                  {unit.status === 'ARCHIVED' ? (
                                    <Button
                                      onClick={() => void restoreUnit(unit)}
                                      size="sm"
                                      variant="secondary"
                                    >
                                      <Icon name="history" />
                                      Restaurar unidad
                                    </Button>
                                  ) : null}
                                  {unit.status === 'DRAFT' ? (
                                    <Button
                                      onClick={() => void activateUnit(unit)}
                                      size="sm"
                                    >
                                      Activar
                                    </Button>
                                  ) : null}

                                  <DropdownMenu
                                    label="Acciones de la unidad"
                                    trigger={
                                      <span
                                        aria-label="Opciones de unidad"
                                        className="dropdown-trigger-icon"
                                      >
                                        <Icon name="more" />
                                      </span>
                                    }
                                  >
                                    <DropdownItem
                                      onSelect={() => void duplicateUnit(unit)}
                                    >
                                      <Icon name="copy" />
                                      Duplicar unidad
                                    </DropdownItem>
                                    <DropdownItem
                                      onSelect={() =>
                                        setHistoryEntity({
                                          id: unit.id,
                                          title: unit.title,
                                          type: 'LEARNING_UNIT',
                                          version: unit.version,
                                        })
                                      }
                                    >
                                      <Icon name="history" />
                                      Historial de versiones
                                    </DropdownItem>
                                    {unit.status !== 'ARCHIVED' ? (
                                      <DropdownItem
                                        onSelect={() => void archiveUnit(unit)}
                                      >
                                        <Icon name="archive" />
                                        Archivar unidad
                                      </DropdownItem>
                                    ) : null}
                                  </DropdownMenu>
                                </div>
                              </header>

                              {/* Unit Items List */}
                              {unit.items.length ? (
                                <div className="learning-items">
                                  {unit.items.map((item, itemIndex) => {
                                    const deliverable =
                                      item.type === 'ASSIGNMENT' ||
                                      item.type === 'ASSESSMENT';
                                    const attachmentSupported =
                                      item.type !== 'ANNOUNCEMENT';

                                    return (
                                      <div
                                        className="learning-item teacher-learning-item"
                                        key={item.id}
                                      >
                                        <span
                                          className={`learning-item__icon learning-item__icon--${item.type.toLowerCase()}`}
                                        >
                                          <Icon
                                            name={
                                              item.type === 'ASSESSMENT'
                                                ? 'document'
                                                : item.type === 'ASSIGNMENT'
                                                  ? 'clipboard'
                                                  : item.type === 'MATERIAL'
                                                    ? 'book'
                                                    : 'message'
                                            }
                                          />
                                        </span>

                                        <div className="learning-item__copy">
                                          <small>
                                            {item.type === 'ASSESSMENT'
                                              ? 'Evaluación en documento'
                                              : item.type === 'ASSIGNMENT'
                                                ? 'Actividad'
                                                : item.type === 'MATERIAL'
                                                  ? 'Material'
                                                  : 'Anuncio'}
                                          </small>
                                          <strong>{item.title}</strong>
                                          <span>
                                            {item.description ||
                                              item.instructions ||
                                              item.content ||
                                              item.body ||
                                              'Sin descripción'}
                                          </span>
                                        </div>

                                        <div className="learning-item__meta">
                                          <Badge
                                            tone={
                                              item.publicationStatus ===
                                              'PUBLISHED'
                                                ? 'success'
                                                : item.publicationStatus ===
                                                    'SCHEDULED'
                                                  ? 'info'
                                                  : 'neutral'
                                            }
                                          >
                                            {item.publicationStatus ===
                                            'PUBLISHED'
                                              ? 'Publicado'
                                              : item.publicationStatus ===
                                                  'SCHEDULED'
                                                ? 'Programado'
                                                : item.publicationStatus ===
                                                    'ARCHIVED'
                                                  ? 'Archivado'
                                                  : 'Borrador'}
                                          </Badge>

                                          {deliverable && item.dueAt ? (
                                            <small>
                                              <Icon name="clock" />
                                              Vence {formatInstant(item.dueAt)}
                                            </small>
                                          ) : null}

                                          {item.publicationStatus ===
                                            'SCHEDULED' && item.publishAt ? (
                                            <small>
                                              <Icon name="calendar" />
                                              Publica el{' '}
                                              {formatInstant(item.publishAt)}
                                            </small>
                                          ) : null}
                                        </div>

                                        <div className="learning-item__actions">
                                          <Button
                                            aria-label={`Mover ${item.title} hacia arriba`}
                                            disabled={itemIndex === 0 || saving}
                                            onClick={() =>
                                              void moveItem(unit, itemIndex, -1)
                                            }
                                            size="icon"
                                            title="Mover hacia arriba"
                                            variant="ghost"
                                          >
                                            <Icon name="arrow-up" />
                                          </Button>
                                          <Button
                                            aria-label={`Mover ${item.title} hacia abajo`}
                                            disabled={
                                              itemIndex ===
                                                unit.items.length - 1 || saving
                                            }
                                            onClick={() =>
                                              void moveItem(unit, itemIndex, 1)
                                            }
                                            size="icon"
                                            title="Mover hacia abajo"
                                            variant="ghost"
                                          >
                                            <Icon name="arrow-down" />
                                          </Button>

                                          {item.publicationStatus !==
                                          'ARCHIVED' ? (
                                            <Button
                                              aria-label={`Editar ${item.title}`}
                                              onClick={() => {
                                                if (
                                                  item.publicationStatus ===
                                                  'DRAFT'
                                                ) {
                                                  setItemFormDraft({
                                                    unitId: unit.id,
                                                    values:
                                                      initialItemDraft(item),
                                                  });
                                                } else {
                                                  setFullscreenEditorItem({
                                                    item,
                                                    unit,
                                                  });
                                                }
                                              }}
                                              size="sm"
                                              variant="secondary"
                                            >
                                              <Icon name="edit" />
                                              Editar
                                            </Button>
                                          ) : null}

                                          {attachmentSupported ? (
                                            <Button
                                              aria-label={`Gestionar archivos de ${item.title}`}
                                              onClick={() =>
                                                setAttachmentItem(item)
                                              }
                                              size="sm"
                                              variant="secondary"
                                            >
                                              <Icon name="paperclip" />
                                              Archivos
                                            </Button>
                                          ) : null}

                                          {item.publicationStatus ===
                                          'DRAFT' ? (
                                            <>
                                              <Button
                                                onClick={() =>
                                                  void publish(item)
                                                }
                                                size="sm"
                                              >
                                                Publicar
                                              </Button>
                                              <Button
                                                onClick={() =>
                                                  setScheduleDraft({
                                                    itemId: item.id,
                                                    value:
                                                      learningInstantToDateTimeLocal(
                                                        item.publishAt,
                                                      ),
                                                  })
                                                }
                                                size="sm"
                                                variant="accent"
                                              >
                                                <Icon name="calendar" />
                                                Programar
                                              </Button>
                                            </>
                                          ) : null}

                                          {item.publicationStatus ===
                                          'SCHEDULED' ? (
                                            <Button
                                              onClick={() => void publish(item)}
                                              size="sm"
                                            >
                                              Publicar ahora
                                            </Button>
                                          ) : null}

                                          {item.publicationStatus ===
                                          'ARCHIVED' ? (
                                            <Button
                                              aria-label={`Restaurar ${item.title} como borrador`}
                                              onClick={() =>
                                                void restoreItem(item)
                                              }
                                              size="sm"
                                              variant="secondary"
                                            >
                                              <Icon name="history" />
                                              Restaurar
                                            </Button>
                                          ) : (
                                            <Button
                                              aria-label={`Archivar ${item.title}`}
                                              onClick={() =>
                                                void archiveItem(item)
                                              }
                                              size="icon"
                                              title="Archivar"
                                              variant="ghost"
                                            >
                                              <Icon name="archive" />
                                            </Button>
                                          )}

                                          <DropdownMenu
                                            label="Más opciones"
                                            trigger={
                                              <span
                                                aria-label="Más opciones"
                                                className="dropdown-trigger-icon"
                                              >
                                                <Icon name="more" />
                                              </span>
                                            }
                                          >
                                            <DropdownItem
                                              onSelect={() =>
                                                setFullscreenEditorItem({
                                                  item,
                                                  unit,
                                                })
                                              }
                                            >
                                              <Icon name="edit" />
                                              Editor avanzado y borrador
                                            </DropdownItem>
                                            <DropdownItem
                                              onSelect={() => {
                                                setMoveItemData({
                                                  currentUnitId: unit.id,
                                                  item,
                                                });
                                                setTargetUnitId(
                                                  data.route!.units.find(
                                                    (u) => u.id !== unit.id,
                                                  )?.id ?? '',
                                                );
                                              }}
                                            >
                                              <Icon name="move" />
                                              Mover a otra unidad
                                            </DropdownItem>
                                            <DropdownItem
                                              onSelect={() =>
                                                void duplicateItem(item)
                                              }
                                            >
                                              <Icon name="copy" />
                                              Duplicar contenido
                                            </DropdownItem>
                                            <DropdownItem
                                              onSelect={() =>
                                                setHistoryEntity({
                                                  id: item.id,
                                                  title: item.title,
                                                  type: 'LEARNING_ITEM',
                                                  version: item.version,
                                                })
                                              }
                                            >
                                              <Icon name="history" />
                                              Historial de versiones
                                            </DropdownItem>
                                          </DropdownMenu>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="teacher-unit-empty">
                                  <p>No hay contenido en esta unidad.</p>
                                </div>
                              )}

                              {/* Unit Secondary Add / Schedule actions */}
                              <div className="learning-unit-secondary-actions">
                                <Button
                                  aria-label={`Agregar contenido a ${unit.title}`}
                                  disabled={unit.status === 'ARCHIVED'}
                                  onClick={() =>
                                    setItemFormDraft({
                                      unitId: unit.id,
                                      values: initialItemDraft(null),
                                    })
                                  }
                                  size="sm"
                                  variant="secondary"
                                >
                                  <Icon name="plus" />
                                  Agregar contenido
                                </Button>

                                {scheduleDraft?.itemId &&
                                unit.items.some(
                                  (it) => it.id === scheduleDraft.itemId,
                                ) ? (
                                  <form
                                    className="schedule-editor"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const candidate = unit.items.find(
                                        (it) => it.id === scheduleDraft.itemId,
                                      );
                                      if (candidate) void schedule(candidate);
                                    }}
                                  >
                                    <Input
                                      id={`schedule-${unit.id}`}
                                      label="Programar publicación"
                                      min={learningInstantToDateTimeLocal(
                                        new Date().toISOString(),
                                      )}
                                      onChange={(event) =>
                                        setScheduleDraft({
                                          ...scheduleDraft,
                                          value: event.target.value,
                                        })
                                      }
                                      type="datetime-local"
                                      value={scheduleDraft.value}
                                    />
                                    <Button loading={saving} type="submit">
                                      Guardar programación
                                    </Button>
                                    <Button
                                      onClick={() => setScheduleDraft(null)}
                                      type="button"
                                      variant="secondary"
                                    >
                                      Cancelar
                                    </Button>
                                  </form>
                                ) : null}
                              </div>
                            </section>
                          ))}
                        </div>
                      ) : (
                        <p className="learning-route__empty">
                          Aún no hay contenido visible en esta ruta.
                        </p>
                      )}

                      {attachmentItem ? (
                        <TeacherAttachmentDialog
                          api={client}
                          item={attachmentItem}
                          onClose={() => setAttachmentItem(null)}
                          onChanged={() => void refresh()}
                        />
                      ) : null}
                    </div>
                  ),
                  id: 'content',
                  label: 'Ruta y contenido',
                },
                {
                  content: (
                    <TeacherSubmissionQueue
                      api={client}
                      courseSubjectId={data.selected.id}
                      items={data.route.units.flatMap((u) =>
                        u.items.filter(
                          (i) =>
                            i.type === 'ASSIGNMENT' || i.type === 'ASSESSMENT',
                        ),
                      )}
                      units={data.route.units}
                    />
                  ),
                  id: 'submissions',
                  label: 'Entregas',
                },
                {
                  content: (
                    <TeacherCollaborationWorkspace
                      courseName={courseName(data.selected)}
                      courseSubjectId={data.selected.id}
                      subjectName={subjectName(data.selected)}
                      teacherName={currentSession.displayName}
                      totalItems={data.route.units.reduce(
                        (acc, u) => acc + u.items.length,
                        0,
                      )}
                      totalUnits={data.route.units.length}
                    />
                  ),
                  id: 'team',
                  label: 'Colaboración',
                },
              ]}
              label="Secciones de la asignatura"
            />

            {/* FULLSCREEN ADVANCED EDITOR OVERLAY */}
            {fullscreenEditorItem ? (
              <div className="teacher-editor-overlay">
                <TeacherContentEditor
                  api={client}
                  item={fullscreenEditorItem.item}
                  onClose={() => setFullscreenEditorItem(null)}
                  onSaved={async () => {
                    await refresh();
                  }}
                  subject={data.selected}
                  unit={fullscreenEditorItem.unit}
                />
              </div>
            ) : null}

            {/* MOVE ITEM DIALOG */}
            {moveItemData ? (
              <Dialog
                description="Selecciona la unidad de destino para este contenido."
                onOpenChange={(open) => {
                  if (!open && !moving) setMoveItemData(null);
                }}
                open
                title="Mover contenido a otra unidad"
              >
                <div className="move-item-form">
                  <p>
                    Moviendo «<strong>{moveItemData.item.title}</strong>»
                  </p>
                  <Select
                    id="target-unit-select"
                    label="Unidad de destino"
                    onChange={(event) => setTargetUnitId(event.target.value)}
                    value={targetUnitId}
                  >
                    {data.route.units
                      .filter((u) => u.id !== moveItemData.currentUnitId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.title}
                        </option>
                      ))}
                  </Select>

                  <div className="showcase-dialog-actions">
                    <Button
                      disabled={moving}
                      onClick={() => setMoveItemData(null)}
                      type="button"
                      variant="secondary"
                    >
                      Cancelar
                    </Button>
                    <Button
                      disabled={!targetUnitId || moving}
                      loading={moving}
                      onClick={() => void executeMoveItemToUnit()}
                      type="button"
                    >
                      Mover contenido
                    </Button>
                  </div>
                </div>
              </Dialog>
            ) : null}

            {/* HISTORY DRAWER */}
            {historyEntity ? (
              <ContentHistoryDrawer
                api={client}
                currentVersion={historyEntity.version}
                entityId={historyEntity.id}
                entityTitle={historyEntity.title}
                entityType={historyEntity.type}
                onClose={() => setHistoryEntity(null)}
                onRestored={async () => {
                  await refresh();
                }}
                open
              />
            ) : null}

            {/* SENSITIVE CHANGE CONFIRMATION */}
            {confirmation ? (
              <Dialog
                description="El servidor indicó que esta modificación necesita una confirmación explícita."
                onOpenChange={(open) => {
                  if (!open && !confirming) setConfirmation(null);
                }}
                open
                title="Confirmar cambio sensible"
              >
                <p>{confirmation.body}</p>
                <div className="showcase-dialog-actions">
                  <Button
                    onClick={() => setConfirmation(null)}
                    type="button"
                    variant="secondary"
                  >
                    Cancelar
                  </Button>
                  <Button
                    loading={confirming}
                    onClick={() => void confirmSensitive()}
                    type="button"
                  >
                    Confirmar cambio
                  </Button>
                </div>
              </Dialog>
            ) : null}
          </>
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

export function TeacherSubjectScreen({
  api,
  courseSubjectId,
  session = demoSessions.teacher,
  v2,
  initialTab,
  initialActivityId,
}: {
  api?: AcademicApiClient | undefined;
  courseSubjectId?: string | undefined;
  session?: TrustedCurrentSession | undefined;
  v2?: boolean | undefined;
  initialTab?: string | undefined;
  initialActivityId?: string | undefined;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);

  const isV2 = useMemo(() => {
    if (typeof v2 === 'boolean') return v2;
    if (
      typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_COURSE_BUILDER_V2 === 'true'
    ) {
      return true;
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('v2') === 'true';
    }
    return false;
  }, [v2]);

  if (!isV2) {
    return (
      <LegacyTeacherSubjectWorkspace
        api={client}
        courseSubjectId={courseSubjectId}
        session={session}
      />
    );
  }

  const missingSubject =
    !data.loading && !data.error && (!data.selected || !data.route);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherDataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {missingSubject ? (
          <EmptyState
            description="No tienes autorización para gestionar este espacio o ya no se encuentra activo."
            icon={<Icon name="book" />}
            title="Asignatura no disponible"
          />
        ) : data.selected && data.route ? (
          <CourseBuilder
            api={client}
            initialActivityId={initialActivityId}
            initialTab={initialTab}
            initialUnits={data.route.units}
            onRefreshRoute={data.refreshRoute}
            subject={data.selected}
          />
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 4. TEACHER REVIEWS WORKSPACE (/docente/revisiones & [submissionId])
// ---------------------------------------------------------------------------

export interface EnrichedReviewContext {
  subject: CourseSubject;
  items: LearningItem[];
  roster: Roster;
  submissionsByItem: Record<string, Submission[]>;
  totalSubmissions: number;
  pendingSubmissions: number;
  reviewedSubmissions: number;
}

function useTeacherReviewWorkspace(api: AcademicApiClient) {
  const [contexts, setContexts] = useState<EnrichedReviewContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const nextContexts = await Promise.all(
        subjects.map(async (subject) => {
          const [route, roster] = await Promise.all([
            api.getLearningRoute(subject.id),
            getTeacherRoster(api, subject.id).catch(() => []),
          ]);
          const items = route.units.flatMap((unit) =>
            unit.items.filter(
              (item) =>
                item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT',
            ),
          );
          const submissionsEntries = await Promise.all(
            items.map(async (item) => {
              const subs = await api.listSubmissions(item.id).catch(() => []);
              return [item.id, subs] as const;
            }),
          );
          const submissionsByItem = Object.fromEntries(submissionsEntries);
          const allSubs = Object.values(submissionsByItem).flat();
          const pending = allSubs.filter((s) => s.status === 'SUBMITTED').length;
          const reviewed = allSubs.filter((s) => s.status === 'REVIEWED').length;

          return {
            items,
            pendingSubmissions: pending,
            reviewedSubmissions: reviewed,
            roster,
            subject,
            submissionsByItem,
            totalSubmissions: allSubs.length,
          };
        }),
      );
      setContexts(nextContexts);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { contexts, error, load, loading };
}

export function TeacherReviewsScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherReviewWorkspace(client);

  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED' | 'LATE'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'by-subject' | 'queue'>('by-subject');
  const [sortBy, setSortBy] = useState<'priority' | 'newest' | 'oldest' | 'student'>('priority');
  const [hideEmptyActivities, setHideEmptyActivities] = useState(false);
  const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const reviewContexts = useMemo(
    () => data.contexts.filter((context) => context.items.length > 0),
    [data.contexts],
  );

  const selectedContext = useMemo(
    () => reviewContexts.find((c) => c.subject.id === selectedSubjectId),
    [reviewContexts, selectedSubjectId],
  );

  const availableItems = selectedContext ? selectedContext.items : [];

  // Flattened submissions across all contexts
  const allSubmissions = useMemo(() => {
    const list: Array<{
      id: string;
      submission: Submission;
      item: LearningItem;
      subject: CourseSubject;
      studentName: string;
      studentInitials: string;
      latestRevision: SubmissionRevision | undefined;
      isLate: boolean;
      status: Submission['status'];
      statusLabel: string;
      statusTone: 'info' | 'success' | 'warning' | 'neutral';
      submittedAt: string | null;
      submittedAtFormatted: string;
    }> = [];

    for (const ctx of reviewContexts) {
      for (const item of ctx.items) {
        const subs = ctx.submissionsByItem[item.id] || [];
        for (const sub of subs) {
          const latest = latestRevision(sub);
          const student = studentName(sub.studentId, ctx.roster);
          const stat = submissionStatus(sub.status);
          list.push({
            id: sub.id,
            isLate: Boolean(latest?.isLate),
            item,
            latestRevision: latest,
            status: sub.status,
            statusLabel: stat.label,
            statusTone: stat.tone,
            studentInitials: studentInitials(student),
            studentName: student,
            subject: ctx.subject,
            submission: sub,
            submittedAt: latest?.submittedAt ?? null,
            submittedAtFormatted: latest ? formatDate(latest.submittedAt) : 'Sin fecha',
          });
        }
      }
    }
    return list;
  }, [reviewContexts]);

  // Scoped to selected subject (if any)
  const scopedSubmissions = useMemo(() => {
    if (!selectedSubjectId) return allSubmissions;
    return allSubmissions.filter((s) => s.subject.id === selectedSubjectId);
  }, [allSubmissions, selectedSubjectId]);

  // Global KPIs
  const metrics = useMemo(() => {
    const total = scopedSubmissions.length;
    const pending = scopedSubmissions.filter((s) => s.status === 'SUBMITTED').length;
    const reviewed = scopedSubmissions.filter((s) => s.status === 'REVIEWED').length;
    const changesRequested = scopedSubmissions.filter((s) => s.status === 'CHANGES_REQUESTED').length;
    const late = scopedSubmissions.filter((s) => s.isLate).length;
    return {
      changesRequested,
      late,
      pending,
      reviewed,
      reviewedPercentage: total > 0 ? Math.round((reviewed / total) * 100) : 100,
      total,
    };
  }, [scopedSubmissions]);

  // Filtered submissions based on statusFilter & searchQuery & selectedItemId & sort
  const filteredSubmissions = useMemo(() => {
    let result = scopedSubmissions;

    if (statusFilter === 'SUBMITTED') {
      result = result.filter((s) => s.status === 'SUBMITTED');
    } else if (statusFilter === 'REVIEWED') {
      result = result.filter((s) => s.status === 'REVIEWED');
    } else if (statusFilter === 'CHANGES_REQUESTED') {
      result = result.filter((s) => s.status === 'CHANGES_REQUESTED');
    } else if (statusFilter === 'LATE') {
      result = result.filter((s) => s.isLate);
    }

    if (selectedItemId) {
      result = result.filter((s) => s.item.id === selectedItemId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.studentName.toLowerCase().includes(q) ||
          s.item.title.toLowerCase().includes(q) ||
          subjectName(s.subject).toLowerCase().includes(q) ||
          courseName(s.subject).toLowerCase().includes(q),
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'priority') {
        const aPriority = (a.status === 'SUBMITTED' ? 2 : 0) + (a.isLate ? 1 : 0);
        const bPriority = (b.status === 'SUBMITTED' ? 2 : 0) + (b.isLate ? 1 : 0);
        if (aPriority !== bPriority) return bPriority - aPriority;
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'newest') {
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'oldest') {
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return aTime - bTime;
      }
      if (sortBy === 'student') {
        return a.studentName.localeCompare(b.studentName);
      }
      return 0;
    });
  }, [scopedSubmissions, statusFilter, searchQuery, selectedItemId, sortBy]);

  // Pagination for Queue mode
  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedQueue = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, currentPage, pageSize]);

  // Contexts filtered by selected subject
  const visibleContexts = useMemo(() => {
    return reviewContexts.filter(
      (context) =>
        !selectedSubjectId || context.subject.id === selectedSubjectId,
    );
  }, [reviewContexts, selectedSubjectId]);

  const totalDeliverablesCount = useMemo(
    () => reviewContexts.reduce((sum, c) => sum + c.items.length, 0),
    [reviewContexts],
  );

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setSelectedSubjectId('');
    setSelectedItemId('');
    setHideEmptyActivities(false);
    setPage(1);
  };

  return (
    <AppShell dataMode="real" session={currentSession}>
      {/* 1. Hero Card */}
      <div className="calendar-hero-card teacher-reviews-hero-card">
        <div className="calendar-hero-card__main">
          <div className="calendar-hero-card__icon" aria-hidden="true">
            <Icon name="review" />
          </div>
          <div className="calendar-hero-card__text">
            <div className="calendar-hero-card__title-row">
              <h1 className="teacher-reviews-title">Revisiones</h1>
              <Badge tone="info">
                <span className="status-dot status-dot--active" /> Bandeja docente activa
              </Badge>
            </div>
            <p>
              Supervisa, califica y retroalimenta las entregas de todas tus asignaturas asignadas en tiempo real. Organiza el flujo de trabajo por prioridad o por asignatura curricular.
            </p>
            <div className="calendar-hero-card__stats">
              <span className="calendar-stat-pill">
                <Icon name="book-open" />
                <span>
                  {reviewContexts.length}{' '}
                  {reviewContexts.length === 1 ? 'asignatura' : 'asignaturas'}
                </span>
              </span>
              <span className="calendar-stat-pill">
                <Icon name="layers" />
                <span>
                  {totalDeliverablesCount}{' '}
                  {totalDeliverablesCount === 1
                    ? 'actividad evaluable'
                    : 'actividades evaluables'}
                </span>
              </span>
              <span className="calendar-stat-pill">
                <Icon name="users" />
                <span>
                  {allSubmissions.length}{' '}
                  {allSubmissions.length === 1
                    ? 'entrega total'
                    : 'entregas totales'}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="calendar-hero-card__actions">
          <Button
            aria-label="Actualizar bandeja de entregas"
            className="calendar-today-btn"
            onClick={() => void data.load()}
            variant="secondary"
          >
            <Icon name="history" />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      <TeacherDataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {reviewContexts.length ? (
          <>
            {/* 2. Executive KPI Cards */}
            <div className="teacher-activity-kpis teacher-reviews-kpis">
              {/* 1. Total */}
              <div
                aria-label="Filtrar por todas las entregas"
                className={`teacher-activity-kpi-card teacher-reviews-kpi-btn ${statusFilter === 'ALL' ? 'teacher-reviews-kpi-btn--active' : ''}`}
                onClick={() => {
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setStatusFilter('ALL');
                    setPage(1);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="teacher-activity-kpi-card__icon" aria-hidden="true">
                  <Icon name="file-text" />
                </div>
                <div className="teacher-activity-kpi-card__content">
                  <span className="teacher-activity-kpi-card__value">
                    {metrics.total}
                  </span>
                  <span className="teacher-activity-kpi-card__label">
                    Total entregas
                  </span>
                </div>
              </div>

              {/* 2. Por revisar */}
              <div
                aria-label="Filtrar por entregas por revisar"
                className={`teacher-activity-kpi-card teacher-activity-kpi-card--pending teacher-reviews-kpi-btn ${statusFilter === 'SUBMITTED' ? 'teacher-reviews-kpi-btn--active' : ''}`}
                onClick={() => {
                  setStatusFilter('SUBMITTED');
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setStatusFilter('SUBMITTED');
                    setPage(1);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="teacher-activity-kpi-card__icon" aria-hidden="true">
                  <Icon name="clock" />
                </div>
                <div className="teacher-activity-kpi-card__content">
                  <div className="teacher-reviews-kpi-row">
                    <span className="teacher-activity-kpi-card__value">
                      {metrics.pending}
                    </span>
                    {metrics.pending > 0 ? (
                      <Badge tone="warning">Prioritario</Badge>
                    ) : null}
                  </div>
                  <span className="teacher-activity-kpi-card__label">
                    Por revisar
                  </span>
                </div>
              </div>

              {/* 3. Revisadas */}
              <div
                aria-label="Filtrar por entregas revisadas"
                className={`teacher-activity-kpi-card teacher-activity-kpi-card--reviewed teacher-reviews-kpi-btn ${statusFilter === 'REVIEWED' ? 'teacher-reviews-kpi-btn--active' : ''}`}
                onClick={() => {
                  setStatusFilter('REVIEWED');
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setStatusFilter('REVIEWED');
                    setPage(1);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="teacher-activity-kpi-card__icon" aria-hidden="true">
                  <Icon name="check-circle" />
                </div>
                <div className="teacher-activity-kpi-card__content">
                  <span className="teacher-activity-kpi-card__value">
                    {metrics.reviewed}
                  </span>
                  <span className="teacher-activity-kpi-card__label">
                    Revisadas ({metrics.reviewedPercentage}%)
                  </span>
                </div>
              </div>

              {/* 4. Con cambios */}
              <div
                aria-label="Filtrar por entregas con cambios solicitados"
                className={`teacher-activity-kpi-card teacher-activity-kpi-card--changes teacher-reviews-kpi-btn ${statusFilter === 'CHANGES_REQUESTED' ? 'teacher-reviews-kpi-btn--active' : ''}`}
                onClick={() => {
                  setStatusFilter('CHANGES_REQUESTED');
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setStatusFilter('CHANGES_REQUESTED');
                    setPage(1);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="teacher-activity-kpi-card__icon" aria-hidden="true">
                  <Icon name="edit" />
                </div>
                <div className="teacher-activity-kpi-card__content">
                  <span className="teacher-activity-kpi-card__value">
                    {metrics.changesRequested}
                  </span>
                  <span className="teacher-activity-kpi-card__label">
                    Con cambios
                  </span>
                </div>
              </div>

              {/* 5. Atrasadas */}
              <div
                aria-label="Filtrar por entregas atrasadas"
                className={`teacher-activity-kpi-card teacher-activity-kpi-card--late teacher-reviews-kpi-btn ${statusFilter === 'LATE' ? 'teacher-reviews-kpi-btn--active' : ''}`}
                onClick={() => {
                  setStatusFilter('LATE');
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setStatusFilter('LATE');
                    setPage(1);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="teacher-activity-kpi-card__icon" aria-hidden="true">
                  <Icon name="alert-triangle" />
                </div>
                <div className="teacher-activity-kpi-card__content">
                  <span className="teacher-activity-kpi-card__value">
                    {metrics.late}
                  </span>
                  <span className="teacher-activity-kpi-card__label">
                    Fuera de plazo
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Controls Toolbar */}
            <div className="teacher-submissions-controls teacher-reviews-toolbar">
              <div className="teacher-reviews-toolbar__top">
                {/* Search */}
                <div className="teacher-reviews-toolbar__search">
                  <div className="history-search-box">
                    <Icon name="search" />
                    <input
                      aria-label="Buscar entrega o estudiante"
                      className="history-search-input"
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Buscar por estudiante, actividad o curso…"
                      type="search"
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <button
                        aria-label="Limpiar búsqueda"
                        className="history-timeline__clear-search"
                        onClick={() => {
                          setSearchQuery('');
                          setPage(1);
                        }}
                        type="button"
                      >
                        <Icon name="close" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Subject Selector */}
                <div className="teacher-reviews-toolbar__subject-select">
                  <Select
                    id="teacher-review-subject"
                    label="Filtrar por asignatura"
                    onChange={(event) => {
                      setSelectedSubjectId(event.target.value);
                      setSelectedItemId('');
                      setPage(1);
                    }}
                    value={selectedSubjectId}
                  >
                    <option value="">
                      Todas las asignaturas ({reviewContexts.length})
                    </option>
                    {reviewContexts.map(({ subject }) => (
                      <option key={subject.id} value={subject.id}>
                        {subjectName(subject)} · {courseName(subject)}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Activity / Item Selector when a subject is picked */}
                {selectedSubjectId && availableItems.length > 0 ? (
                  <div className="teacher-reviews-toolbar__item-select">
                    <Select
                      id="teacher-review-item"
                      label="Filtrar por actividad"
                      onChange={(event) => {
                        setSelectedItemId(event.target.value);
                        setPage(1);
                      }}
                      value={selectedItemId}
                    >
                      <option value="">
                        Todas las actividades ({availableItems.length})
                      </option>
                      {availableItems.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.title} ({selectedContext?.submissionsByItem[it.id]?.length ?? 0} entregas)
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                {/* View Mode Toggle */}
                <div
                  aria-label="Modo de visualización de revisiones"
                  className="calendar-view-toggle teacher-reviews-view-toggle"
                  role="tablist"
                >
                  <button
                    aria-selected={viewMode === 'by-subject'}
                    className={`calendar-view-btn ${viewMode === 'by-subject' ? 'calendar-view-btn--active' : ''}`}
                    onClick={() => setViewMode('by-subject')}
                    role="tab"
                    type="button"
                  >
                    <Icon name="layers" />
                    <span>Por Asignatura</span>
                  </button>
                  <button
                    aria-selected={viewMode === 'queue'}
                    className={`calendar-view-btn ${viewMode === 'queue' ? 'calendar-view-btn--active' : ''}`}
                    onClick={() => setViewMode('queue')}
                    role="tab"
                    type="button"
                  >
                    <Icon name="list" />
                    <span>Cola Unificada</span>
                  </button>
                </div>

                {/* Toggle: Solo actividades con entregas */}
                {viewMode === 'by-subject' ? (
                  <button
                    aria-pressed={hideEmptyActivities}
                    className={`review-filter-pill-btn ${hideEmptyActivities ? 'review-filter-pill-btn--active' : ''}`}
                    onClick={() => setHideEmptyActivities((prev) => !prev)}
                    title="Alternar entre mostrar todas las actividades o solo aquellas con entregas enviadas"
                    type="button"
                  >
                    <Icon name="filter" />
                    <span>{hideEmptyActivities ? 'Solo con entregas' : 'Todas las actividades'}</span>
                  </button>
                ) : null}

                {/* Sort in Queue Mode */}
                {viewMode === 'queue' ? (
                  <div className="teacher-reviews-toolbar__sort">
                    <Select
                      id="teacher-review-sort"
                      label="Ordenar por"
                      onChange={(e) => setSortBy(e.target.value as any)}
                      value={sortBy}
                    >
                      <option value="priority">Prioridad (Pendientes primero)</option>
                      <option value="newest">Más recientes</option>
                      <option value="oldest">Más antiguas</option>
                      <option value="student">Estudiante (A-Z)</option>
                    </Select>
                  </div>
                ) : null}
              </div>

              {/* Status Filter Chips with ScrollableTabsBar */}
              <ScrollableTabsBar ariaLabel="Filtros rápidos por estado de corrección">
                <div className="teacher-submissions-controls__chips" role="tablist">
                  <button
                    aria-selected={statusFilter === 'ALL'}
                    className={`teacher-route-filter-chip ${statusFilter === 'ALL' ? 'teacher-route-filter-chip--active' : ''}`}
                    onClick={() => {
                      setStatusFilter('ALL');
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>Todas</span>
                    <span className="chip-badge">{metrics.total}</span>
                  </button>
                  <button
                    aria-selected={statusFilter === 'SUBMITTED'}
                    className={`teacher-route-filter-chip ${statusFilter === 'SUBMITTED' ? 'teacher-route-filter-chip--active' : ''}`}
                    onClick={() => {
                      setStatusFilter('SUBMITTED');
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>Por revisar</span>
                    <span className="chip-badge">{metrics.pending}</span>
                  </button>
                  <button
                    aria-selected={statusFilter === 'REVIEWED'}
                    className={`teacher-route-filter-chip ${statusFilter === 'REVIEWED' ? 'teacher-route-filter-chip--active' : ''}`}
                    onClick={() => {
                      setStatusFilter('REVIEWED');
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>Revisadas</span>
                    <span className="chip-badge">{metrics.reviewed}</span>
                  </button>
                  <button
                    aria-selected={statusFilter === 'CHANGES_REQUESTED'}
                    className={`teacher-route-filter-chip ${statusFilter === 'CHANGES_REQUESTED' ? 'teacher-route-filter-chip--active' : ''}`}
                    onClick={() => {
                      setStatusFilter('CHANGES_REQUESTED');
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>Con cambios</span>
                    <span className="chip-badge">{metrics.changesRequested}</span>
                  </button>
                  <button
                    aria-selected={statusFilter === 'LATE'}
                    className={`teacher-route-filter-chip ${statusFilter === 'LATE' ? 'teacher-route-filter-chip--active' : ''}`}
                    onClick={() => {
                      setStatusFilter('LATE');
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>Atrasadas</span>
                    <span className="chip-badge">{metrics.late}</span>
                  </button>
                </div>
              </ScrollableTabsBar>
            </div>

            {/* 4. Main Content Area */}
            {filteredSubmissions.length === 0 && (searchQuery || statusFilter !== 'ALL') ? (
              <div className="teacher-route-empty-filter-notice review-no-results">
                <Icon name="filter" />
                <h3>No hay entregas que coincidan con los filtros</h3>
                <p>
                  Prueba buscando con otros términos o seleccionando otra categoría de corrección.
                </p>
                <Button onClick={resetFilters} size="sm" variant="secondary">
                  Restablecer filtros
                </Button>
              </div>
            ) : viewMode === 'queue' ? (
              /* UNIFIED QUEUE VIEW */
              <div className="review-unified-queue">
                <div className="review-unified-queue__header">
                  <div>
                    <h3>Cola Unificada de Entregas</h3>
                    <p>
                      {filteredSubmissions.length} entrega
                      {filteredSubmissions.length === 1 ? '' : 's'} en total
                      {selectedSubjectId
                        ? ' en la asignatura seleccionada'
                        : ' en todas las asignaturas'}
                    </p>
                  </div>
                  <div className="review-pagination-size">
                    <span>Ver por pág:</span>
                    {[10, 25, 50].map((size) => (
                      <button
                        className={`review-size-btn ${pageSize === size ? 'review-size-btn--active' : ''}`}
                        key={size}
                        onClick={() => {
                          setPageSize(size);
                          setPage(1);
                        }}
                        type="button"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="submission-rows-container">
                  {paginatedQueue.map((subEntry) => (
                    <div
                      className="submission-row submission-row--teacher submission-row--interactive"
                      key={subEntry.id}
                    >
                      <div className="submission-row__top-group">
                        <span className="submission-row__avatar" aria-hidden="true">
                          {subEntry.studentInitials}
                        </span>
                        <div className="submission-row__main">
                          <strong>{subEntry.studentName}</strong>
                          <small>
                            <span className="review-subject-badge">
                              {subjectName(subEntry.subject)}
                            </span>
                            {' · '}
                            {subEntry.item.title}
                            {' · '}
                            Revisión{' '}
                            {subEntry.latestRevision?.revisionNumber ?? '—'}
                          </small>
                        </div>
                      </div>
                      <div className="submission-row__status-group">
                        <span className="submission-time">
                          {subEntry.isLate ? (
                            <Badge tone="warning">
                              <Icon name="clock" />
                              Atrasada
                            </Badge>
                          ) : (
                            <small className="submission-time--ontime">
                              <Icon name="check" /> A tiempo
                            </small>
                          )}
                        </span>
                        <Badge tone={subEntry.statusTone}>
                          {subEntry.statusLabel}
                        </Badge>
                      </div>
                      <Link
                        aria-label={`Revisar entrega de ${subEntry.studentName}`}
                        className="ui-button ui-button--primary ui-button--sm submission-row__review-btn"
                        href={`/docente/revisiones/${subEntry.id}`}
                      >
                        <Icon name="review" />
                        <span>Revisar entrega</span>
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 ? (
                  <div className="review-pagination-bar">
                    <span className="review-pagination-info">
                      Página {currentPage} de {totalPages} ({filteredSubmissions.length} entregas)
                    </span>
                    <div className="review-pagination-actions">
                      <Button
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        size="sm"
                        variant="secondary"
                      >
                        <Icon name="chevron-left" />
                        <span>Anterior</span>
                      </Button>
                      <Button
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        size="sm"
                        variant="secondary"
                      >
                        <span>Siguiente</span>
                        <Icon name="chevron-right" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              /* BY SUBJECT CURRICULAR VIEW */
              <div className="review-contexts">
                {visibleContexts.length > 1 ? (
                  <div className="review-subjects-bulk-actions">
                    <button
                      className="review-bulk-action-btn"
                      onClick={() => setCollapsedSubjects({})}
                      type="button"
                    >
                      <Icon name="chevron-down" />
                      <span>Expandir todas ({visibleContexts.length})</span>
                    </button>
                    <button
                      className="review-bulk-action-btn"
                      onClick={() => {
                        const allCollapsed: Record<string, boolean> = {};
                        for (const ctx of visibleContexts) {
                          allCollapsed[ctx.subject.id] = true;
                        }
                        setCollapsedSubjects(allCollapsed);
                      }}
                      type="button"
                    >
                      <Icon name="chevron-up" />
                      <span>Contraer todas</span>
                    </button>
                  </div>
                ) : null}

                {visibleContexts.map((context) => {
                  const isCollapsed = Boolean(collapsedSubjects[context.subject.id]);
                  const subjectSubs = filteredSubmissions.filter(
                    (s) => s.subject.id === context.subject.id,
                  );
                  const totalSubCount = context.totalSubmissions;
                  const reviewedSubCount = context.reviewedSubmissions;
                  const pct =
                    totalSubCount > 0
                      ? Math.round((reviewedSubCount / totalSubCount) * 100)
                      : 100;

                  return (
                    <section className="review-context" key={context.subject.id}>
                      <div className="section-heading">
                        <div>
                          <h2>
                            {subjectName(context.subject)} ·{' '}
                            {courseName(context.subject)}
                          </h2>
                          <p>
                            {context.items.length}{' '}
                            {context.items.length === 1
                              ? 'actividad'
                              : 'actividades'}{' '}
                            · {totalSubCount}{' '}
                            {totalSubCount === 1
                              ? 'entrega recibida'
                              : 'entregas recibidas'}
                          </p>
                        </div>
                        <div className="review-context__stats-badges">
                          <Badge tone="info">
                            {context.items.length} contenido
                            {context.items.length === 1 ? '' : 's'}
                          </Badge>
                          {context.pendingSubmissions > 0 ? (
                            <Badge tone="warning">
                              {context.pendingSubmissions} por revisar
                            </Badge>
                          ) : (
                            <Badge tone="success">Al día</Badge>
                          )}
                          <button
                            aria-expanded={!isCollapsed}
                            aria-label={`${isCollapsed ? 'Expandir' : 'Contraer'} asignatura ${subjectName(context.subject)}`}
                            className="review-subject-collapse-btn"
                            onClick={() => {
                              setCollapsedSubjects((prev) => ({
                                ...prev,
                                [context.subject.id]: !prev[context.subject.id],
                              }));
                            }}
                            type="button"
                          >
                            <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} />
                            <span>{isCollapsed ? 'Expandir' : 'Contraer'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Subject Progress Bar */}
                      {totalSubCount > 0 ? (
                        <div className="review-subject-progress-box">
                          <div className="review-subject-progress-labels">
                            <span>
                              Progreso de calificación del curso:{' '}
                              <strong>
                                {reviewedSubCount} de {totalSubCount}
                              </strong>{' '}
                              calificados
                            </span>
                            <span className="review-subject-pct">{pct}%</span>
                          </div>
                          <div className="review-progress-bar-track">
                            <div
                              className="review-progress-bar-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {isCollapsed ? (
                        <div className="review-subject-collapsed-box">
                          <p>
                            Asignatura contraída · {context.items.length} actividades planificadas y {totalSubCount} entregas registradas ({reviewedSubCount} revisadas, {context.pendingSubmissions} pendientes de revisión).
                          </p>
                          <Button
                            onClick={() => {
                              setCollapsedSubjects((prev) => ({
                                ...prev,
                                [context.subject.id]: false,
                              }));
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            <Icon name="layers" />
                            <span>Ver actividades y entregas</span>
                          </Button>
                        </div>
                      ) : (
                        /* Items / Activities Stack */
                        <div className="teacher-submissions-stack">
                          {context.items.map((item) => {
                            if (selectedItemId && item.id !== selectedItemId) {
                              return null;
                            }
                            const itemSubs = subjectSubs.filter(
                              (s) => s.item.id === item.id,
                            );
                            if (hideEmptyActivities && itemSubs.length === 0) {
                              return null;
                            }
                            if (
                              !itemSubs.length &&
                              (searchQuery || statusFilter !== 'ALL')
                            ) {
                              return null;
                            }

                          return (
                            <div
                              className="submission-list submission-list--panel"
                              key={item.id}
                            >
                              <div className="submission-list__heading">
                                <div>
                                  <h3>{item.title}</h3>
                                  <p>
                                    {item.type === 'ASSESSMENT'
                                      ? 'Evaluación Sumativa'
                                      : 'Actividad Formativa'}
                                    {item.dueAt
                                      ? ` · Plazo: ${formatDate(item.dueAt)}`
                                      : ''}
                                  </p>
                                </div>
                                <Badge tone="info">
                                  {itemSubs.length} entrega
                                  {itemSubs.length === 1 ? '' : 's'}
                                </Badge>
                              </div>

                              {itemSubs.length ? (
                                <div className="submission-rows-container">
                                  {itemSubs.map((subEntry) => (
                                    <div
                                      className="submission-row submission-row--teacher submission-row--interactive"
                                      key={subEntry.id}
                                    >
                                      <div className="submission-row__top-group">
                                        <span
                                          className="submission-row__avatar"
                                          aria-hidden="true"
                                        >
                                          {subEntry.studentInitials}
                                        </span>
                                        <div className="submission-row__main">
                                          <strong>{subEntry.studentName}</strong>
                                          <small>
                                            Revisión{' '}
                                            {subEntry.latestRevision
                                              ?.revisionNumber ?? '—'}{' '}
                                            · {subEntry.submittedAtFormatted}
                                          </small>
                                        </div>
                                      </div>
                                      <div className="submission-row__status-group">
                                        <span className="submission-time">
                                          {subEntry.isLate ? (
                                            <Badge tone="warning">
                                              <Icon name="clock" />
                                              Atrasada
                                            </Badge>
                                          ) : (
                                            <small className="submission-time--ontime">
                                              <Icon name="check" /> A tiempo
                                            </small>
                                          )}
                                        </span>
                                        <Badge tone={subEntry.statusTone}>
                                          {subEntry.statusLabel}
                                        </Badge>
                                      </div>
                                      <Link
                                        aria-label={`Revisar entrega de ${subEntry.studentName}`}
                                        className="ui-button ui-button--primary ui-button--sm submission-row__review-btn"
                                        href={`/docente/revisiones/${subEntry.id}`}
                                      >
                                        <Icon name="review" />
                                        <span>Revisar entrega</span>
                                      </Link>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="review-empty-activity">
                                  <p>Sin entregas registradas para esta actividad.</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            description="Cuando tus estudiantes envíen actividades o evaluaciones aparecerán aquí."
            icon={<Icon name="review" />}
            title="Sin entregas para revisar"
          />
        )}
      </TeacherDataState>
    </AppShell>
  );
}

export function SubmissionReviewScreen({
  api,
  session = demoSessions.teacher,
  submissionId,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
  submissionId?: string;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherSubmissionDetail api={client} submissionId={submissionId} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 5. TEACHER CALENDAR SCREEN (/docente/calendario)
// ---------------------------------------------------------------------------

export interface CalendarAgendaEntry {
  id: string;
  title: string;
  subject: CourseSubject;
  date: string;
  type: 'DUE' | 'PUBLISH' | 'UNIT_START' | 'UNIT_END';
  itemType?: LearningItem['type'] | undefined;
  itemId?: string | undefined;
  unitId?: string | undefined;
  unitTitle?: string | undefined;
  description?: string | null | undefined;
  dueAt?: string | null | undefined;
}

function startOfLocalDay(value: string | number | Date) {
  const date = new Date(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function dayKey(value: string | number | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(value: string) {
  const diffDays = Math.round(
    (startOfLocalDay(value) - startOfLocalDay(new Date().toISOString())) /
      86_400_000,
  );
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  const formatted = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTimeOfDay(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} hrs`;
}

function formatFullDateSpanish(date: Date) {
  const formatted = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getCalendarItemUrl(entry: CalendarAgendaEntry): string {
  if (entry.type === 'DUE' || entry.itemId) {
    return `/docente/asignaturas/${entry.subject.id}?tab=submissions&activityId=${entry.itemId ?? ''}`;
  }
  if (entry.type === 'UNIT_START' || entry.type === 'UNIT_END') {
    return `/docente/asignaturas/${entry.subject.id}?tab=content&unitId=${entry.unitId ?? ''}`;
  }
  if (entry.type === 'PUBLISH') {
    return `/docente/asignaturas/${entry.subject.id}?tab=content`;
  }
  return `/docente/asignaturas/${entry.subject.id}`;
}

function entryTypeMeta(entry: CalendarAgendaEntry): {
  label: string;
  tone: 'info' | 'creative' | 'warning' | 'success' | 'neutral';
  icon: 'award' | 'file-text' | 'calendar' | 'layers' | 'clock';
  colorClass: string;
  badgeClass: string;
} {
  if (entry.type === 'DUE') {
    if (entry.itemType === 'ASSESSMENT') {
      return {
        badgeClass: 'assessment',
        colorClass: 'due-assessment',
        icon: 'award',
        label: 'Evaluación Sumativa',
        tone: 'creative',
      };
    }
    return {
      badgeClass: 'assignment',
      colorClass: 'due-assignment',
      icon: 'file-text',
      label: 'Actividad Formativa',
      tone: 'info',
    };
  }
  if (entry.type === 'PUBLISH') {
    return {
      badgeClass: 'publish',
      colorClass: 'publish',
      icon: 'calendar',
      label: 'Publicación programada',
      tone: 'success',
    };
  }
  if (entry.type === 'UNIT_START') {
    return {
      badgeClass: 'unit',
      colorClass: 'unit',
      icon: 'layers',
      label: 'Inicio de Unidad',
      tone: 'warning',
    };
  }
  return {
    badgeClass: 'unit',
    colorClass: 'unit',
    icon: 'layers',
    label: 'Cierre de Unidad',
    tone: 'neutral',
  };
}

function entryUrgencyMeta(dateStr: string): {
  label: string;
  tone: 'warning' | 'info' | 'neutral' | 'success';
} {
  const diffDays = Math.round(
    (startOfLocalDay(dateStr) - startOfLocalDay(new Date().toISOString())) /
      86_400_000,
  );
  if (diffDays < 0) {
    return { label: 'Plazo cerrado', tone: 'neutral' };
  }
  if (diffDays === 0) {
    return { label: 'Vence hoy', tone: 'warning' };
  }
  if (diffDays === 1) {
    return { label: 'Vence mañana', tone: 'warning' };
  }
  if (diffDays <= 7) {
    return { label: `En ${diffDays} días`, tone: 'info' };
  }
  return { label: `En ${diffDays} días`, tone: 'neutral' };
}

function useTeacherCalendarData(api: AcademicApiClient) {
  const [entries, setEntries] = useState<CalendarAgendaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const routes = await Promise.all(
        subjects.map(async (subject) => ({
          route: await api.getLearningRoute(subject.id),
          subject,
        })),
      );

      const agenda: CalendarAgendaEntry[] = [];

      for (const { route, subject } of routes) {
        for (const unit of route.units) {
          if (unit.startAt) {
            agenda.push({
              date: unit.startAt,
              description: unit.description,
              id: `unit-start-${unit.id}`,
              subject,
              title: `Inicio: ${unit.title}`,
              type: 'UNIT_START',
              unitId: unit.id,
              unitTitle: unit.title,
            });
          }
          if (unit.endAt) {
            agenda.push({
              date: unit.endAt,
              description: unit.description,
              id: `unit-end-${unit.id}`,
              subject,
              title: `Fin: ${unit.title}`,
              type: 'UNIT_END',
              unitId: unit.id,
              unitTitle: unit.title,
            });
          }

          for (const item of unit.items) {
            if (item.dueAt) {
              agenda.push({
                date: item.dueAt,
                description: item.description,
                dueAt: item.dueAt,
                id: `item-due-${item.id}`,
                itemId: item.id,
                itemType: item.type,
                subject,
                title: item.title,
                type: 'DUE',
                unitId: unit.id,
                unitTitle: unit.title,
              });
            }
            if (item.publicationStatus === 'SCHEDULED' && item.publishAt) {
              agenda.push({
                date: item.publishAt,
                description: item.description,
                id: `item-publish-${item.id}`,
                itemId: item.id,
                itemType: item.type,
                subject,
                title: item.title,
                type: 'PUBLISH',
                unitId: unit.id,
                unitTitle: unit.title,
              });
            }
          }
        }
      }

      agenda.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      setEntries(agenda);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { entries, error, load, loading };
}

export function TeacherCalendarScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { entries, error, load, loading } = useTeacherCalendarData(client);

  // View mode: 'month' (Interactive Grid) or 'agenda' (Chronological Timeline)
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');

  // Month navigation state
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  // Selected date key for Day details
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    dayKey(new Date()),
  );

  // Day dialog for "+N más" on month view
  const [dayModalDateKey, setDayModalDateKey] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<
    'ALL' | 'DELIVERABLES' | 'ASSESSMENT' | 'ASSIGNMENT' | 'PUBLISH' | 'UNIT'
  >('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState<
    'ALL' | 'UPCOMING_7' | 'THIS_MONTH' | 'PAST'
  >('ALL');

  // Auto-focus calendar on relevant month/day if current month has no events
  useEffect(() => {
    if (entries.length > 0) {
      const now = new Date();
      const currentMonthHasEntries = entries.some((e) => {
        const d = new Date(e.date);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      });
      if (!currentMonthHasEntries) {
        const firstEntry = entries[0];
        if (firstEntry) {
          const target = new Date(firstEntry.date);
          setCurrentMonth(target);
          setSelectedDateKey(dayKey(target));
        }
      } else {
        const todayK = dayKey(now);
        const todayHasEntry = entries.some((e) => dayKey(e.date) === todayK);
        if (!todayHasEntry) {
          const firstInMonth = entries.find((e) => {
            const d = new Date(e.date);
            return (
              d.getFullYear() === now.getFullYear() &&
              d.getMonth() === now.getMonth()
            );
          });
          if (firstInMonth) {
            setSelectedDateKey(dayKey(firstInMonth.date));
          }
        }
      }
    }
  }, [entries]);

  // Unique subjects for filter dropdown
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, CourseSubject>();
    for (const entry of entries) {
      if (!map.has(entry.subject.id)) {
        map.set(entry.subject.id, entry.subject);
      }
    }
    return Array.from(map.values());
  }, [entries]);

  // Overall metric counts
  const metrics = useMemo(() => {
    const nowTs = startOfLocalDay(new Date().toISOString());
    const weekTs = nowTs + 7 * 86_400_000;
    let deliverables = 0;
    let assessments = 0;
    let assignments = 0;
    let publishes = 0;
    let units = 0;
    let upcoming7 = 0;

    for (const e of entries) {
      const eDay = startOfLocalDay(e.date);
      if (e.type === 'DUE') {
        deliverables++;
        if (e.itemType === 'ASSESSMENT') assessments++;
        if (e.itemType === 'ASSIGNMENT') assignments++;
      } else if (e.type === 'PUBLISH') {
        publishes++;
      } else if (e.type === 'UNIT_START' || e.type === 'UNIT_END') {
        units++;
      }

      if (eDay >= nowTs && eDay <= weekTs) {
        upcoming7++;
      }
    }

    return {
      all: entries.length,
      assessments,
      assignments,
      deliverables,
      publishes,
      units,
      upcoming7,
    };
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const nowTs = startOfLocalDay(new Date().toISOString());
    const weekTs = nowTs + 7 * 86_400_000;
    const currentMonthYear = currentMonth.getFullYear();
    const currentMonthMonth = currentMonth.getMonth();

    return entries.filter((entry) => {
      // Search match
      if (q) {
        const titleMatch = entry.title.toLowerCase().includes(q);
        const subjMatch = subjectName(entry.subject).toLowerCase().includes(q);
        const courseMatch = courseName(entry.subject).toLowerCase().includes(q);
        const unitMatch = entry.unitTitle?.toLowerCase().includes(q) ?? false;
        const descMatch = entry.description?.toLowerCase().includes(q) ?? false;
        if (!titleMatch && !subjMatch && !courseMatch && !unitMatch && !descMatch) {
          return false;
        }
      }

      // Subject filter
      if (subjectFilter && entry.subject.id !== subjectFilter) {
        return false;
      }

      // Type filter
      if (typeFilter === 'DELIVERABLES' && entry.type !== 'DUE') return false;
      if (typeFilter === 'ASSESSMENT' && entry.itemType !== 'ASSESSMENT') return false;
      if (typeFilter === 'ASSIGNMENT' && entry.itemType !== 'ASSIGNMENT') return false;
      if (typeFilter === 'PUBLISH' && entry.type !== 'PUBLISH') return false;
      if (
        typeFilter === 'UNIT' &&
        entry.type !== 'UNIT_START' &&
        entry.type !== 'UNIT_END'
      ) {
        return false;
      }

      // Timeframe filter
      if (timeframeFilter === 'UPCOMING_7') {
        const eDay = startOfLocalDay(entry.date);
        if (eDay < nowTs || eDay > weekTs) return false;
      } else if (timeframeFilter === 'THIS_MONTH') {
        const d = new Date(entry.date);
        if (d.getFullYear() !== currentMonthYear || d.getMonth() !== currentMonthMonth) {
          return false;
        }
      } else if (timeframeFilter === 'PAST') {
        const eDay = startOfLocalDay(entry.date);
        if (eDay >= nowTs) return false;
      }

      return true;
    });
  }, [
    entries,
    searchQuery,
    subjectFilter,
    typeFilter,
    timeframeFilter,
    currentMonth,
  ]);

  // Agenda groups
  const agendaGroups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; rows: CalendarAgendaEntry[] }
    >();
    for (const entry of filteredEntries) {
      const key = dayKey(entry.date);
      if (!map.has(key)) {
        map.set(key, { label: dayLabel(entry.date), rows: [] });
      }
      map.get(key)!.rows.push(entry);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [filteredEntries]);

  // Month grid calculation
  const monthData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday as 0, Sunday as 6
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayK = dayKey(new Date());

    // Map entries by dateKey
    const entriesByDay = new Map<string, CalendarAgendaEntry[]>();
    for (const e of filteredEntries) {
      const k = dayKey(e.date);
      if (!entriesByDay.has(k)) entriesByDay.set(k, []);
      entriesByDay.get(k)!.push(e);
    }

    type MonthCell = {
      date: Date;
      dateKey: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      entries: CalendarAgendaEntry[];
    };

    const cells: MonthCell[] = [];

    // Leading days from previous month
    for (let i = startWeekday - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const d = new Date(year, month - 1, dayNum);
      const k = dayKey(d);
      cells.push({
        date: d,
        dateKey: k,
        dayNumber: dayNum,
        entries: entriesByDay.get(k) ?? [],
        isCurrentMonth: false,
        isToday: k === todayK,
      });
    }

    // Days in current month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const k = dayKey(d);
      cells.push({
        date: d,
        dateKey: k,
        dayNumber: dayNum,
        entries: entriesByDay.get(k) ?? [],
        isCurrentMonth: true,
        isToday: k === todayK,
      });
    }

    // Trailing days to fill the complete grid (multiple of 7)
    const remainder = cells.length % 7;
    const trailingCount = remainder === 0 ? 0 : 7 - remainder;
    for (let i = 1; i <= trailingCount; i++) {
      const d = new Date(year, month + 1, i);
      const k = dayKey(d);
      cells.push({
        date: d,
        dateKey: k,
        dayNumber: i,
        entries: entriesByDay.get(k) ?? [],
        isCurrentMonth: false,
        isToday: k === todayK,
      });
    }

    // Human month title
    const monthTitle = new Intl.DateTimeFormat('es-CL', {
      month: 'long',
      year: 'numeric',
    }).format(currentMonth);

    return {
      cells,
      monthTitle: monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1),
    };
  }, [currentMonth, filteredEntries]);

  // Selected day entries
  const selectedDayEntries = useMemo(() => {
    return filteredEntries.filter(
      (entry) => dayKey(entry.date) === selectedDateKey,
    );
  }, [filteredEntries, selectedDateKey]);

  // Modal day entries
  const modalDayEntries = useMemo(() => {
    if (!dayModalDateKey) return [];
    return filteredEntries.filter(
      (entry) => dayKey(entry.date) === dayModalDateKey,
    );
  }, [filteredEntries, dayModalDateKey]);

  const handlePrevMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(dayKey(now));
  };

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Cronograma de fechas de entrega, publicaciones programadas y disponibilidad de unidades."
        title="Calendario"
      />

      <TeacherDataState
        error={error}
        loading={loading}
        onRetry={() => void dataLoadFallback(load)}
      >
        <div className="calendar-workspace">
          {/* Hero Header Card */}
          <div className="calendar-hero-card">
            <div className="calendar-hero-card__main">
              <div aria-hidden="true" className="calendar-hero-card__icon">
                <Icon name="calendar" />
              </div>
              <div className="calendar-hero-card__text">
                <h3>Calendario Académico y Entregas</h3>
                <p>
                  Supervisa los plazos de entrega de los estudiantes, hitos de
                  evaluación y publicaciones programadas en todas tus
                  asignaturas asignadas.
                </p>
              </div>
            </div>
            <div className="calendar-hero-card__stats">
              <div className="calendar-stat-pill">
                <Icon name="file-text" />
                <span>
                  <strong>{metrics.deliverables}</strong> entregas programadas
                </span>
              </div>
              <div className="calendar-stat-pill">
                <Icon name="clock" />
                <span>
                  <strong>{metrics.upcoming7}</strong> en los próximos 7 días
                </span>
              </div>
              <div className="calendar-stat-pill">
                <Icon name="award" />
                <span>
                  <strong>{metrics.assessments}</strong> evaluaciones sumativas
                </span>
              </div>
            </div>
          </div>

          {/* Controls & Filters Bar */}
          <div className="calendar-toolbar">
            <div className="calendar-toolbar__top">
              {/* View mode toggle */}
              <div
                aria-label="Modo de visualización del calendario"
                className="calendar-view-toggle"
                role="tablist"
              >
                <button
                  aria-selected={viewMode === 'month'}
                  className={`calendar-view-btn ${viewMode === 'month' ? 'calendar-view-btn--active' : ''}`}
                  onClick={() => setViewMode('month')}
                  role="tab"
                  type="button"
                >
                  <Icon name="calendar" />
                  <span>Mes / Cuadrícula</span>
                </button>
                <button
                  aria-selected={viewMode === 'agenda'}
                  className={`calendar-view-btn ${viewMode === 'agenda' ? 'calendar-view-btn--active' : ''}`}
                  onClick={() => setViewMode('agenda')}
                  role="tab"
                  type="button"
                >
                  <Icon name="list" />
                  <span>Agenda / Cronograma</span>
                </button>
              </div>

              <div aria-live="polite" className="calendar-stat-pill">
                <Icon name="filter" />
                <span>
                  <strong>{filteredEntries.length}</strong> de{' '}
                  {entries.length} eventos
                </span>
              </div>
            </div>

            {/* Search and Subject row */}
            <div className="calendar-search-row">
              <Input
                id="calendar-search"
                label="Buscar evento o entrega"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por actividad, unidad, asignatura o curso..."
                type="search"
                value={searchQuery}
              />
              <Select
                id="calendar-subject-filter"
                label="Filtrar por asignatura"
                onChange={(e) => setSubjectFilter(e.target.value)}
                value={subjectFilter}
              >
                <option value="">Todas las asignaturas</option>
                {uniqueSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {subjectName(sub)} · {courseName(sub)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Event Type Filter Chips */}
            <ScrollableTabsBar ariaLabel="Filtros por tipo de actividad y entrega">
              <div className="calendar-filter-chips" role="tablist">
                <button
                  aria-selected={typeFilter === 'ALL'}
                  className={`teacher-route-filter-chip ${typeFilter === 'ALL' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('ALL')}
                  role="tab"
                  type="button"
                >
                  <span>Todas</span>
                  <span className="chip-badge">{metrics.all}</span>
                </button>
                <button
                  aria-selected={typeFilter === 'DELIVERABLES'}
                  className={`teacher-route-filter-chip ${typeFilter === 'DELIVERABLES' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('DELIVERABLES')}
                  role="tab"
                  type="button"
                >
                  <Icon name="file-text" />
                  <span>Entregas</span>
                  <span className="chip-badge">{metrics.deliverables}</span>
                </button>
                <button
                  aria-selected={typeFilter === 'ASSESSMENT'}
                  className={`teacher-route-filter-chip ${typeFilter === 'ASSESSMENT' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('ASSESSMENT')}
                  role="tab"
                  type="button"
                >
                  <Icon name="award" />
                  <span>Evaluaciones</span>
                  <span className="chip-badge">{metrics.assessments}</span>
                </button>
                <button
                  aria-selected={typeFilter === 'ASSIGNMENT'}
                  className={`teacher-route-filter-chip ${typeFilter === 'ASSIGNMENT' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('ASSIGNMENT')}
                  role="tab"
                  type="button"
                >
                  <Icon name="file-text" />
                  <span>Actividades</span>
                  <span className="chip-badge">{metrics.assignments}</span>
                </button>
                <button
                  aria-selected={typeFilter === 'PUBLISH'}
                  className={`teacher-route-filter-chip ${typeFilter === 'PUBLISH' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('PUBLISH')}
                  role="tab"
                  type="button"
                >
                  <Icon name="calendar" />
                  <span>Publicaciones</span>
                  <span className="chip-badge">{metrics.publishes}</span>
                </button>
                <button
                  aria-selected={typeFilter === 'UNIT'}
                  className={`teacher-route-filter-chip ${typeFilter === 'UNIT' ? 'teacher-route-filter-chip--active' : ''}`}
                  onClick={() => setTypeFilter('UNIT')}
                  role="tab"
                  type="button"
                >
                  <Icon name="layers" />
                  <span>Unidades</span>
                  <span className="chip-badge">{metrics.units}</span>
                </button>
              </div>
            </ScrollableTabsBar>
          </div>

          {/* MAIN CALENDAR CONTENT */}
          {entries.length === 0 ? (
            <EmptyState
              description="Cuando programes publicaciones o asignes fechas de entrega en tus unidades, aparecerán aquí cronológicamente."
              icon={<Icon name="calendar" />}
              title="Sin fechas en el calendario"
            />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              description="No se encontraron entregas o eventos que coincidan con la búsqueda y filtros aplicados."
              icon={<Icon name="search" />}
              title="Sin resultados"
            />
          ) : viewMode === 'month' ? (
            /* ==========================================================
               VISTA MES / CUADRÍCULA
               ========================================================== */
            <div className="calendar-month-view">
              {/* Month Navigation */}
              <div className="calendar-month-header">
                <div className="calendar-month-nav">
                  <button
                    aria-label="Mes anterior"
                    className="calendar-month-nav-btn"
                    onClick={handlePrevMonth}
                    type="button"
                  >
                    <Icon name="chevron-left" />
                  </button>
                  <h3 className="calendar-month-title">
                    {monthData.monthTitle}
                  </h3>
                  <button
                    aria-label="Mes siguiente"
                    className="calendar-month-nav-btn"
                    onClick={handleNextMonth}
                    type="button"
                  >
                    <Icon name="chevron-right" />
                  </button>
                  <button
                    className="calendar-month-today-btn"
                    onClick={handleGoToday}
                    type="button"
                  >
                    Hoy
                  </button>
                </div>
                <div className="calendar-stat-pill">
                  <Icon name="calendar" />
                  <span>
                    Seleccionado: <strong>{dayLabel(selectedDateKey)}</strong>
                  </span>
                </div>
              </div>

              {/* Month Matrix Grid */}
              <div className="calendar-month-grid-wrapper">
                <div className="calendar-weekdays-row" role="row">
                  <div className="calendar-weekday">Lun</div>
                  <div className="calendar-weekday">Mar</div>
                  <div className="calendar-weekday">Mié</div>
                  <div className="calendar-weekday">Jue</div>
                  <div className="calendar-weekday">Vie</div>
                  <div className="calendar-weekday">Sáb</div>
                  <div className="calendar-weekday">Dom</div>
                </div>

                <div className="calendar-month-grid">
                  {monthData.cells.map((cell) => {
                    const isSelected = cell.dateKey === selectedDateKey;
                    return (
                      <div
                        aria-current={cell.isToday ? 'date' : undefined}
                        aria-label={`${cell.dayNumber} de ${monthData.monthTitle}${cell.entries.length > 0 ? `, ${cell.entries.length} ${cell.entries.length === 1 ? 'actividad' : 'actividades'}` : ', sin actividades'}`}
                        aria-pressed={isSelected}
                        className={`calendar-cell ${!cell.isCurrentMonth ? 'calendar-cell--outside' : ''} ${cell.isToday ? 'calendar-cell--today' : ''} ${isSelected ? 'calendar-cell--selected' : ''}`}
                        key={cell.dateKey}
                        onClick={() => setSelectedDateKey(cell.dateKey)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDateKey(cell.dateKey);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="calendar-cell__header">
                          <span className="calendar-cell__day-num">
                            {cell.dayNumber}
                          </span>
                          {cell.entries.length > 0 ? (
                            <span className="calendar-cell__count-badge">
                              {cell.entries.length}
                            </span>
                          ) : null}
                        </div>

                        {/* Desktop event pills (up to 3) */}
                        <div className="calendar-cell__events">
                          {cell.entries.slice(0, 3).map((entry) => {
                            const meta = entryTypeMeta(entry);
                            const url = getCalendarItemUrl(entry);
                            return (
                              <Link
                                className={`calendar-event-pill calendar-event-pill--${meta.colorClass}`}
                                href={url}
                                key={entry.id}
                                onClick={(e) => e.stopPropagation()}
                                title={`${entry.title} (${subjectName(entry.subject)})`}
                              >
                                <Icon name={meta.icon} />
                                <span className="calendar-event-pill__text">
                                  {entry.title}
                                </span>
                              </Link>
                            );
                          })}
                          {cell.entries.length > 3 ? (
                            <button
                              aria-label={`Ver ${cell.entries.length} eventos del día ${cell.dayNumber}`}
                              className="calendar-cell__more-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDayModalDateKey(cell.dateKey);
                              }}
                              type="button"
                            >
                              +{cell.entries.length - 3} más
                            </button>
                          ) : null}
                        </div>

                        {/* Mobile colorful dots */}
                        <div className="calendar-cell__dots" aria-hidden="true">
                          {cell.entries.slice(0, 4).map((entry) => {
                            const meta = entryTypeMeta(entry);
                            return (
                              <span
                                className={`calendar-cell__dot calendar-cell__dot--${meta.colorClass}`}
                                key={entry.id}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Details Section */}
              <section className="calendar-selected-day-section">
                <div className="calendar-selected-day-section__header">
                  <div>
                    <h3>
                      Entregas y eventos:{' '}
                      {dayLabel(selectedDateKey)} (
                      {selectedDateKey})
                    </h3>
                  </div>
                  <Badge tone={selectedDayEntries.length ? 'info' : 'neutral'}>
                    {selectedDayEntries.length}{' '}
                    {selectedDayEntries.length === 1 ? 'actividad' : 'actividades'}
                  </Badge>
                </div>

                {selectedDayEntries.length ? (
                  <div className="calendar-day-events-list">
                    {selectedDayEntries.map((entry) => {
                      const meta = entryTypeMeta(entry);
                      const urgency = entryUrgencyMeta(entry.date);
                      const destinationUrl = getCalendarItemUrl(entry);
                      return (
                        <div
                          className="calendar-event-card"
                          key={entry.id}
                        >
                          <div className="calendar-event-card__main">
                            <div
                              aria-hidden="true"
                              className={`calendar-event-card__icon-box calendar-event-card__icon-box--${meta.badgeClass}`}
                            >
                              <Icon name={meta.icon} />
                            </div>
                            <div className="calendar-event-card__info">
                              <div className="calendar-event-card__badges">
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                <span className="calendar-event-card__subject-chip">
                                  <Icon name="book" />
                                  <span>{subjectName(entry.subject)}</span>
                                </span>
                                {entry.unitTitle ? (
                                  <span className="calendar-event-card__subject-chip">
                                    <Icon name="layers" />
                                    <span>{entry.unitTitle}</span>
                                  </span>
                                ) : null}
                                <Badge tone={urgency.tone}>
                                  {urgency.label}
                                </Badge>
                              </div>
                              <h4 className="calendar-event-card__title">
                                {entry.title}
                              </h4>
                              <p className="calendar-event-card__desc">
                                {entry.type === 'DUE'
                                  ? 'Plazo límite para entrega de estudiantes'
                                  : entry.type === 'PUBLISH'
                                    ? 'Publicación automática para el curso'
                                    : 'Ventana de disponibilidad de unidad'}
                              </p>
                            </div>
                          </div>

                          <div className="calendar-event-card__actions">
                            <div className="calendar-event-card__time">
                              <strong>
                                <Icon name="clock" />{' '}
                                {formatTimeOfDay(entry.date) || '23:59 hrs'}
                              </strong>
                              <small>{courseName(entry.subject)}</small>
                            </div>
                            <Link
                              className="calendar-event-card__cta"
                              href={destinationUrl}
                            >
                              <Icon
                                name={
                                  entry.type === 'DUE' ? 'review' : 'arrow-right'
                                }
                              />
                              <span>
                                {entry.type === 'DUE'
                                  ? 'Ver entregas y revisar'
                                  : 'Ver en temario'}
                              </span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="learning-route__empty">
                    No hay entregas ni eventos programados para este día.
                    Selecciona otra fecha en la cuadrícula para ver sus detalles.
                  </p>
                )}
              </section>
            </div>
          ) : (
            /* ==========================================================
               VISTA AGENDA / CRONOGRAMA
               ========================================================== */
            <div className="calendar-agenda">
              {agendaGroups.map((group) => (
                <section
                  aria-labelledby={`calendar-day-${group.key}`}
                  className="calendar-agenda-day-group calendar-day"
                  key={group.key}
                >
                  <div className="calendar-agenda-day-group__header">
                    <h2 id={`calendar-day-${group.key}`}>{group.label}</h2>
                    <Badge tone="info">
                      {group.rows.length}{' '}
                      {group.rows.length === 1 ? 'evento' : 'eventos'}
                    </Badge>
                  </div>
                  <div className="calendar-day-events-list learning-items">
                    {group.rows.map((entry) => {
                      const meta = entryTypeMeta(entry);
                      const urgency = entryUrgencyMeta(entry.date);
                      const destinationUrl = getCalendarItemUrl(entry);
                      return (
                        <div
                          className="calendar-event-card learning-item"
                          key={entry.id}
                        >
                          <div className="calendar-event-card__main">
                            <div
                              aria-hidden="true"
                              className={`calendar-event-card__icon-box calendar-event-card__icon-box--${meta.badgeClass} learning-item__icon ${entry.type === 'DUE' ? 'learning-item__icon--assignment' : ''}`}
                            >
                              <Icon name={meta.icon} />
                            </div>
                            <div className="calendar-event-card__info learning-item__copy">
                              <div className="calendar-event-card__badges">
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                <span className="calendar-event-card__subject-chip">
                                  <Icon name="book" />
                                  <span>{subjectName(entry.subject)}</span>
                                </span>
                                {entry.unitTitle ? (
                                  <span className="calendar-event-card__subject-chip">
                                    <Icon name="layers" />
                                    <span>{entry.unitTitle}</span>
                                  </span>
                                ) : null}
                                <Badge tone={urgency.tone}>
                                  {urgency.label}
                                </Badge>
                              </div>
                              <strong className="calendar-event-card__title">
                                {entry.title}
                              </strong>
                              <span className="calendar-event-card__desc">
                                {entry.type === 'DUE'
                                  ? 'Plazo límite para entrega de estudiantes'
                                  : entry.type === 'PUBLISH'
                                    ? 'Publicación automática para el curso'
                                    : 'Ventana de disponibilidad de unidad'}
                              </span>
                            </div>
                          </div>

                          <div className="calendar-event-card__actions learning-item__meta">
                            <div className="calendar-event-card__time">
                              <small>
                                <Icon name="clock" />{' '}
                                {formatTimeOfDay(entry.date) ||
                                  formatInstant(entry.date)}
                              </small>
                              <small>{courseName(entry.subject)}</small>
                            </div>
                            <Link
                              className="calendar-event-card__cta"
                              href={destinationUrl}
                            >
                              <Icon
                                name={
                                  entry.type === 'DUE' ? 'review' : 'arrow-right'
                                }
                              />
                              <span>
                                {entry.type === 'DUE'
                                  ? 'Ver entregas y revisar'
                                  : 'Ver en temario'}
                              </span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Modal for Day Details (opened from +N más) */}
        {dayModalDateKey ? (
          <Dialog
            description={`Entregas y eventos programados para el ${dayLabel(dayModalDateKey)} (${dayModalDateKey})`}
            onOpenChange={(open) => {
              if (!open) setDayModalDateKey(null);
            }}
            open={Boolean(dayModalDateKey)}
            title={`Eventos del ${dayLabel(dayModalDateKey)}`}
          >
            <div className="calendar-day-modal">
              {modalDayEntries.map((entry) => {
                const meta = entryTypeMeta(entry);
                const destinationUrl = getCalendarItemUrl(entry);
                return (
                  <div className="calendar-event-card" key={entry.id}>
                    <div className="calendar-event-card__main">
                      <div
                        aria-hidden="true"
                        className={`calendar-event-card__icon-box calendar-event-card__icon-box--${meta.badgeClass}`}
                      >
                        <Icon name={meta.icon} />
                      </div>
                      <div className="calendar-event-card__info">
                        <div className="calendar-event-card__badges">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="calendar-event-card__subject-chip">
                            <Icon name="book" />
                            <span>{subjectName(entry.subject)}</span>
                          </span>
                        </div>
                        <h4 className="calendar-event-card__title">
                          {entry.title}
                        </h4>
                        <p className="calendar-event-card__desc">
                          {entry.type === 'DUE'
                            ? 'Plazo límite para entrega de estudiantes'
                            : entry.type === 'PUBLISH'
                              ? 'Publicación automática para el curso'
                              : 'Ventana de disponibilidad de unidad'}
                        </p>
                      </div>
                    </div>
                    <div className="calendar-event-card__actions">
                      <div className="calendar-event-card__time">
                        <strong>{formatTimeOfDay(entry.date) || '23:59 hrs'}</strong>
                      </div>
                      <Link
                        className="calendar-event-card__cta"
                        href={destinationUrl}
                        onClick={() => setDayModalDateKey(null)}
                      >
                        <Icon
                          name={
                            entry.type === 'DUE' ? 'review' : 'arrow-right'
                          }
                        />
                        <span>
                          {entry.type === 'DUE'
                            ? 'Ver entregas y revisar'
                            : 'Ver en temario'}
                        </span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Dialog>
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

function dataLoadFallback(fn: () => Promise<void>) {
  void fn();
}

// ---------------------------------------------------------------------------
// 6. TEACHER ITEM DIRECT EDITOR SCREEN
// ---------------------------------------------------------------------------

export function TeacherItemEditorScreen({
  api,
  courseSubjectId,
  learningItemId,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  courseSubjectId: string;
  learningItemId: string;
  session?: TrustedCurrentSession;
}) {
  const router = useRouter();
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);

  let matchedUnitAndItem: {
    item: LearningItem;
    unit: LearningUnitWithItems;
  } | null = null;
  if (data.route) {
    for (const unit of data.route.units) {
      const item = unit.items.find((i) => i.id === learningItemId);
      if (item) {
        matchedUnitAndItem = { item, unit };
        break;
      }
    }
  }

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherDataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {data.selected && matchedUnitAndItem ? (
          <TeacherContentEditor
            api={client}
            item={matchedUnitAndItem.item}
            onClose={() => {
              router.push(`/docente/asignaturas/${courseSubjectId}`);
            }}
            onSaved={async () => {
              await data.load();
            }}
            subject={data.selected}
            unit={matchedUnitAndItem.unit}
          />
        ) : !data.loading ? (
          <EmptyState
            action={
              <Link
                className="button-link button-link--primary"
                href={`/docente/asignaturas/${courseSubjectId}`}
              >
                Volver a la asignatura
              </Link>
            }
            description="El contenido solicitado no existe, fue archivado o no tienes autorización para editarlo."
            icon={<Icon name="document" />}
            title="Contenido no encontrado"
          />
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

export function TeacherProfileScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const currentSession = useTrustedCurrentSession(session).session;
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const { data } = useTeacherDashboardData(client);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <div className="teacher-account-page">
        {/* Profile Hero */}
        <section className="teacher-profile-card">
          <div className="teacher-profile-card__header">
            <div className="teacher-profile-card__avatar-area">
              <Avatar name={currentSession.displayName} size="lg" />
              <span
                aria-label="Sesión activa"
                className="teacher-profile-card__status-dot"
                role="status"
              />
            </div>
            <div className="teacher-profile-card__details">
              <div className="teacher-profile-card__title-row">
                <h1 className="teacher-profile-card__name">
                  {currentSession.displayName}
                </h1>
                <Badge tone="info">{currentSession.roleLabel}</Badge>
              </div>
              <p className="teacher-profile-card__tenant">
                <Icon name="graduation-cap" />
                <span>{currentSession.tenantDisplayName}</span>
              </p>
              <div className="teacher-profile-card__meta-tags">
                <span className="teacher-profile-card__meta-item">
                  <Icon name="message" />
                  <span>docente@colegiodemo.cl</span>
                </span>
                <span className="teacher-profile-card__meta-item">
                  <Icon name="layers" />
                  <span>Departamento de Humanidades y Lenguaje</span>
                </span>
                <span className="teacher-profile-card__meta-item">
                  <Icon name="check-circle" />
                  <span>RUT 15.849.201-4</span>
                </span>
                <span className="teacher-profile-card__meta-item">
                  <Icon name="award" />
                  <span>Profesor de Estado en Educación Media</span>
                </span>
              </div>
            </div>
            <div className="teacher-profile-card__actions">
              <Link
                className="button-link button-link--primary"
                href="/docente/configuracion"
              >
                <Icon name="settings" />
                <span>Configuración docente</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Quick Stats Grid */}
        <div className="teacher-profile-stats-grid">
          <CompactStat
            icon="book-open"
            label="Asignaturas a cargo"
            value={data ? `${data.subjects.length} asignaturas` : '3 asignaturas'}
          />
          <CompactStat
            icon="file-text"
            label="Revisiones pendientes"
            value={data ? `${data.pendingSubmissionsCount} entregas` : '4 entregas'}
          />
          <CompactStat
            icon="people"
            label="Estudiantes a cargo"
            value="86 matriculados"
          />
          <CompactStat
            icon="clock"
            label="Carga lectiva"
            value="32 hrs pedagógicas"
          />
          <CompactStat
            icon="calendar"
            label="Período académico"
            value="Primer Semestre 2026"
          />
          <CompactStat
            icon="check-circle"
            label="Estado institucional"
            value="Habilitado / Al día"
          />
        </div>

        {/* Content sections */}
        <div className="teacher-profile-grid">
          {/* Card: Active subjects */}
          <Card className="teacher-profile-section-card">
            <div className="teacher-profile-section-card__header">
              <div className="teacher-profile-section-card__title">
                <Icon name="book-open" />
                <h2>Asignaturas y Cursos Asignados</h2>
              </div>
              <Link
                className="button-link button-link--secondary button-link--sm"
                href="/docente/asignaturas"
              >
                Ver todas
              </Link>
            </div>
            <p className="teacher-profile-section-card__desc">
              Espacios de aprendizaje activos bajo tu gestión docente para el presente período escolar.
            </p>
            {data && data.subjects.length > 0 ? (
              <div className="teacher-profile-subject-list">
                {data.subjects.map((s) => (
                  <Link
                    className="teacher-profile-subject-item"
                    href={`/docente/asignaturas/${s.id}`}
                    key={s.id}
                  >
                    <div className="teacher-profile-subject-item__info">
                      <strong>{subjectName(s)}</strong>
                      <span>{courseName(s)}</span>
                    </div>
                    <span className="teacher-profile-subject-item__action">
                      Abrir <Icon name="chevron-right" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="teacher-profile-empty-hint">
                <p>Cargando información de asignaturas asignadas...</p>
              </div>
            )}
          </Card>

          {/* Card: Pedagogical attention schedule */}
          <Card className="teacher-profile-section-card">
            <div className="teacher-profile-section-card__header">
              <div className="teacher-profile-section-card__title">
                <Icon name="calendar" />
                <h2>Horarios de Atención Pedagógica</h2>
              </div>
            </div>
            <p className="teacher-profile-section-card__desc">
              Franjas horarias registradas en la dirección escolar para acompañamiento a la comunidad educativa.
            </p>
            <div className="teacher-profile-info-rows">
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">
                  Consultas y Tutorías a Estudiantes
                </span>
                <span className="teacher-profile-info-row__value">
                  Lunes y Miércoles 15:30 - 17:00 hrs (Sala 12)
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">
                  Entrevistas a Apoderados
                </span>
                <span className="teacher-profile-info-row__value">
                  Jueves 08:30 - 10:00 hrs (Previa reserva)
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">
                  Reunión de Departamento
                </span>
                <span className="teacher-profile-info-row__value">
                  Martes 16:30 - 18:00 hrs
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">
                  Teléfono / Anexo interno
                </span>
                <span className="teacher-profile-info-row__value">
                  Anexo 402 (Sala de Profesores)
                </span>
              </div>
            </div>
          </Card>

          {/* Card: Security and membership details */}
          <Card className="teacher-profile-section-card">
            <div className="teacher-profile-section-card__header">
              <div className="teacher-profile-section-card__title">
                <Icon name="review" />
                <h2>Seguridad y Datos Institucionales</h2>
              </div>
            </div>
            <p className="teacher-profile-section-card__desc">
              Parámetros de acceso y autenticación gestionados por Identity.
            </p>
            <div className="teacher-profile-info-rows">
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">ID Membresía</span>
                <span className="teacher-profile-info-row__value font-mono">
                  {currentSession.membershipId}
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">Roles activos</span>
                <span className="teacher-profile-info-row__value">
                  {currentSession.roles.join(', ')}
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">Autenticación multifactor</span>
                <span className="teacher-profile-info-row__value teacher-badge-pill teacher-badge-pill--success">
                  Activa (2FA Institucional)
                </span>
              </div>
              <div className="teacher-profile-info-row">
                <span className="teacher-profile-info-row__label">Sesión actual</span>
                <span className="teacher-profile-info-row__value">
                  Navegador seguro · Encriptación TLS 1.3
                </span>
              </div>
            </div>
          </Card>

          {/* Card: Fast shortcuts */}
          <Card className="teacher-profile-section-card">
            <div className="teacher-profile-section-card__header">
              <div className="teacher-profile-section-card__title">
                <Icon name="sparkles" />
                <h2>Herramientas y Accesos Frecuentes</h2>
              </div>
            </div>
            <p className="teacher-profile-section-card__desc">
              Accesos directos para agilizar tu labor formativa diaria.
            </p>
            <div className="teacher-profile-shortcuts">
              <Link
                className="teacher-profile-shortcut-btn"
                href="/docente/revisiones"
              >
                <Icon name="file-text" />
                <div>
                  <strong>Bandeja de Revisiones</strong>
                  <span>Revisar entregas y calificar con rúbricas</span>
                </div>
              </Link>
              <Link
                className="teacher-profile-shortcut-btn"
                href="/docente/calendario"
              >
                <Icon name="calendar" />
                <div>
                  <strong>Calendario Docente</strong>
                  <span>Planificación de fechas límite y evaluaciones</span>
                </div>
              </Link>
              <Link
                className="teacher-profile-shortcut-btn"
                href="/docente/configuracion"
              >
                <Icon name="settings" />
                <div>
                  <strong>Preferencias del Portal</strong>
                  <span>Personalizar notificaciones y flujo de trabajo</span>
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function TeacherSettingsScreen({
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const currentSession = useTrustedCurrentSession(session).session;
  // Workflow preferences
  const [reviewMode, setReviewMode] = useState<'queue' | 'subject'>('queue');
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');
  const [confirmBeforeReturn, setConfirmBeforeReturn] = useState(true);
  const [enableQuickPhrases, setEnableQuickPhrases] = useState(true);
  const [prioritizeDieStudents, setPrioritizeDieStudents] = useState(true);

  // Notification preferences
  const [notifySubmissions, setNotifySubmissions] = useState(true);
  const [notifyResubmissions, setNotifyResubmissions] = useState(true);
  const [notifyAnnouncements, setNotifyAnnouncements] = useState(true);
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [digitalDisconnection, setDigitalDisconnection] = useState(true);
  const [dailyDigestEmail, setDailyDigestEmail] = useState(false);

  // UI & Accessibility preferences
  const [uiDensity, setUiDensity] = useState<'standard' | 'compact'>('standard');
  const [highContrastText, setHighContrastText] = useState(false);
  const [reducedAnimations, setReducedAnimations] = useState(false);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(true);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleResetDefaults = () => {
    setReviewMode('queue');
    setItemsPerPage('10');
    setSortOrder('oldest');
    setConfirmBeforeReturn(true);
    setEnableQuickPhrases(true);
    setPrioritizeDieStudents(true);
    setNotifySubmissions(true);
    setNotifyResubmissions(true);
    setNotifyAnnouncements(true);
    setBrowserNotifications(false);
    setDigitalDisconnection(true);
    setDailyDigestEmail(false);
    setUiDensity('standard');
    setHighContrastText(false);
    setReducedAnimations(false);
    setKeyboardShortcuts(true);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <AppShell dataMode="real" session={currentSession}>
      <div className="teacher-account-page">
        {/* Settings Hero */}
        <section className="teacher-settings-hero">
          <div className="teacher-settings-hero__badge">
            <Icon name="settings" />
            <span>Preferencias y Configuración del Docente</span>
          </div>
          <h1 className="teacher-settings-hero__title">
            Configuración del Portal Académico
          </h1>
          <p className="teacher-settings-hero__desc">
            Personaliza cómo recibes las alertas pedagógicas, el flujo de revisión de entregas escolares y la experiencia visual de tu espacio de trabajo.
          </p>
        </section>

        {savedSuccess ? (
          <Alert title="Preferencias guardadas exitosamente" tone="success">
            Los cambios en tus preferencias docentes han sido aplicados a tu sesión.
          </Alert>
        ) : null}

        <div className="teacher-settings-grid">
          {/* Section 1: Workflow Preferences */}
          <Card className="teacher-settings-card">
            <div className="teacher-settings-card__header">
              <div className="teacher-settings-card__title">
                <Icon name="file-text" />
                <h2>Flujo de Revisiones y Evaluación</h2>
              </div>
              <Badge tone="info">Revisiones</Badge>
            </div>
            <p className="teacher-settings-card__desc">
              Optimiza el ritmo y la organización para calificar tareas, exámenes y proyectos escolares.
            </p>
            <div className="teacher-settings-fields">
              <div className="teacher-settings-field">
                <label
                  className="teacher-settings-field__label"
                  htmlFor="review-default-view"
                >
                  Modo predeterminado de la bandeja de Revisiones
                </label>
                <select
                  className="teacher-settings-select"
                  id="review-default-view"
                  onChange={(e) =>
                    setReviewMode(e.target.value as 'queue' | 'subject')
                  }
                  value={reviewMode}
                >
                  <option value="queue">
                    Cola unificada (Recomendado para revisar entregas con agilidad)
                  </option>
                  <option value="subject">Agrupado por asignatura y curso</option>
                </select>
                <span className="teacher-settings-field__hint">
                  {reviewMode === 'queue'
                    ? 'Muestra todas las entregas pendientes en una cola única para calificar rápidamente.'
                    : 'Organiza las tareas divididas por cada asignatura y curso a cargo.'}
                </span>
              </div>

              <div className="teacher-settings-field">
                <label
                  className="teacher-settings-field__label"
                  htmlFor="items-per-page"
                >
                  Cantidad de entregas mostradas por página
                </label>
                <select
                  className="teacher-settings-select"
                  id="items-per-page"
                  onChange={(e) => setItemsPerPage(e.target.value)}
                  value={itemsPerPage}
                >
                  <option value="10">10 entregas por página (Carga más liviana)</option>
                  <option value="20">20 entregas por página (Equilibrado)</option>
                  <option value="50">50 entregas por página (Vista ampliada)</option>
                </select>
              </div>

              <div className="teacher-settings-field">
                <label
                  className="teacher-settings-field__label"
                  htmlFor="sort-order"
                >
                  Orden cronológico de entregas
                </label>
                <select
                  className="teacher-settings-select"
                  id="sort-order"
                  onChange={(e) =>
                    setSortOrder(e.target.value as 'oldest' | 'newest')
                  }
                  value={sortOrder}
                >
                  <option value="oldest">
                    Más antiguas primero (Recomendado para cumplir plazos)
                  </option>
                  <option value="newest">Más recientes primero</option>
                </select>
              </div>
            </div>

            <div className="teacher-settings-toggles">
              <label className="teacher-toggle-item">
                <input
                  checked={confirmBeforeReturn}
                  onChange={(e) => setConfirmBeforeReturn(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Confirmación antes de devolver retroalimentación</strong>
                  <span>
                    Muestra un aviso de seguridad antes de publicar notas y comentarios al estudiante.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={enableQuickPhrases}
                  onChange={(e) => setEnableQuickPhrases(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Banco de frases pedagógicas formativas</strong>
                  <span>
                    Habilitar sugerencias rápidas de comentarios pedagógicos de felicitación y refuerzo.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={prioritizeDieStudents}
                  onChange={(e) => setPrioritizeDieStudents(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Destacar estudiantes con apoyos de inclusión (DIE)</strong>
                  <span>
                    Identificar visualmente con una insignia a estudiantes con adecuaciones curriculares.
                  </span>
                </div>
              </label>
            </div>
          </Card>

          {/* Section 2: Notifications */}
          <Card className="teacher-settings-card">
            <div className="teacher-settings-card__header">
              <div className="teacher-settings-card__title">
                <Icon name="bell" />
                <h2>Notificaciones y Desconexión Digital</h2>
              </div>
              <Badge tone="warning">Avisos</Badge>
            </div>
            <p className="teacher-settings-card__desc">
              Controla qué avisos llegan a tu campana y respeta tus horarios de descanso laboral.
            </p>
            <div className="teacher-settings-toggles">
              <label className="teacher-toggle-item">
                <input
                  checked={notifySubmissions}
                  onChange={(e) => setNotifySubmissions(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Nuevas entregas de estudiantes</strong>
                  <span>
                    Avisar de inmediato cuando un alumno suba una tarea o evaluación al portal.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={notifyResubmissions}
                  onChange={(e) => setNotifyResubmissions(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Reentregas con correcciones solicitadas</strong>
                  <span>
                    Alerta destacada cuando un estudiante vuelva a cargar un trabajo corregido.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={notifyAnnouncements}
                  onChange={(e) => setNotifyAnnouncements(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Comunicados institucionales de dirección</strong>
                  <span>
                    Avisos importantes de secretaría académica, UTP e inspectoría general.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={browserNotifications}
                  onChange={(e) => setBrowserNotifications(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Notificaciones web del navegador (Push)</strong>
                  <span>
                    Recibir avisos flotantes de escritorio mientras utilizas otras aplicaciones.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={digitalDisconnection}
                  onChange={(e) => setDigitalDisconnection(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Modo 'Derecho a Desconexión Docente'</strong>
                  <span>
                    Silenciar alertas automáticas fuera del horario escolar (después de las 18:00 hrs y fines de semana).
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={dailyDigestEmail}
                  onChange={(e) => setDailyDigestEmail(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Resumen diario por correo electrónico</strong>
                  <span>
                    Enviar cada mañana a las 08:00 AM un informe consolidado con las tareas pendientes.
                  </span>
                </div>
              </label>
            </div>
          </Card>

          {/* Section 3: Visual experience & accessibility */}
          <Card className="teacher-settings-card">
            <div className="teacher-settings-card__header">
              <div className="teacher-settings-card__title">
                <Icon name="eye" />
                <h2>Visualización y Accesibilidad</h2>
              </div>
              <Badge tone="neutral">Interfaz</Badge>
            </div>
            <p className="teacher-settings-card__desc">
              Ajusta la densidad visual, el contraste y la ergonomía de lectura para jornadas docentes prolongadas.
            </p>
            <div className="teacher-settings-fields">
              <div className="teacher-settings-field">
                <label
                  className="teacher-settings-field__label"
                  htmlFor="ui-density"
                >
                  Densidad de listas y tablas
                </label>
                <select
                  className="teacher-settings-select"
                  id="ui-density"
                  onChange={(e) =>
                    setUiDensity(e.target.value as 'standard' | 'compact')
                  }
                  value={uiDensity}
                >
                  <option value="standard">Estándar espaciosa (Recomendada)</option>
                  <option value="compact">Compacta (Permite ver más alumnos por pantalla)</option>
                </select>
              </div>
            </div>

            <div className="teacher-settings-toggles">
              <label className="teacher-toggle-item">
                <input
                  checked={highContrastText}
                  onChange={(e) => setHighContrastText(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Tipografía de alto contraste pedagógico</strong>
                  <span>
                    Aumenta la fuerza de trazo en enunciados y rúbricas para reducir fatiga visual.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={reducedAnimations}
                  onChange={(e) => setReducedAnimations(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Reducir animaciones de interfaz</strong>
                  <span>
                    Optimiza la velocidad de respuesta en computadores de sala de clases con recursos limitados.
                  </span>
                </div>
              </label>

              <label className="teacher-toggle-item">
                <input
                  checked={keyboardShortcuts}
                  onChange={(e) => setKeyboardShortcuts(e.target.checked)}
                  type="checkbox"
                />
                <div className="teacher-toggle-item__content">
                  <strong>Atajos de teclado docentes activos</strong>
                  <span>
                    Permite navegar entre entregas con las teclas J/K y calificar con Enter de manera fluida.
                  </span>
                </div>
              </label>
            </div>
          </Card>
        </div>

        {/* Footer actions */}
        <div className="teacher-settings-footer">
          <Button onClick={handleSave} variant="primary" type="button">
            Guardar preferencias docentes
          </Button>
          <Button onClick={handleResetDefaults} variant="secondary" type="button">
            Restablecer valores predeterminados
          </Button>
          <Link
            className="button-link button-link--secondary"
            href="/docente/perfil"
          >
            Volver a mi perfil
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
