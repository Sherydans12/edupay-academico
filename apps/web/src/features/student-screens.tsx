'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@edupay/ui';
import type {
  CourseSubjectLearningRoute,
  LearningItem,
  Submission,
} from '@edupay/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { AppShell } from '@/components/app-shell';
import { BodyDocumentRenderer } from '@/components/body-document';
import { Icon } from '@/components/icons';
import { LearningAttachmentList } from '@/components/learning-attachment-list';
import { StudentSubmissionWorkflow } from '@/components/student-submission-workflow';
import {
  LearningRoute,
  PageHeading,
  SubjectCard,
} from '@/components/page-primitives';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { demoSessions } from '@/demo/demo-data';
import {
  courseName,
  deliverableItems,
  errorCopy,
  isEffectivelyVisible,
  subjectCard,
  subjectName,
  visibleStudentUnits,
} from '@/features/learning-screen-support';
import {
  formatLearningCalendarDay,
  formatLearningInstant,
  learningCalendarDayKey,
  learningTimeZone,
  LEARNING_OPERATIONAL_TIME_ZONE,
} from '@/features/learning-datetime';

type LearningRoute = CourseSubjectLearningRoute;
type StudentSubject = Awaited<
  ReturnType<AcademicApiClient['getStudentContextSubjects']>
>[number];

type DeliverableRow = {
  item: LearningItem;
  subject: StudentSubject;
  submission: Submission | null;
  statusAvailable?: boolean;
  statusError?: unknown;
};

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await map(values[index] as T);
      }
    }),
  );
  return results;
}

async function readStudentTimeZone(api: AcademicApiClient) {
  if (typeof api.getTenantOperationalProfile !== 'function')
    return LEARNING_OPERATIONAL_TIME_ZONE;
  try {
    return learningTimeZone((await api.getTenantOperationalProfile()).timeZone);
  } catch {
    return LEARNING_OPERATIONAL_TIME_ZONE;
  }
}

function useStudentWorkspace(
  api: AcademicApiClient,
  includeDeliverables = false,
) {
  const [subjects, setSubjects] = useState<
    Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>
  >([]);
  const [routes, setRoutes] = useState<
    Array<{ route: LearningRoute; subject: (typeof subjects)[number] }>
  >([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [submissionStatusError, setSubmissionStatusError] =
    useState<unknown>(null);
  const [timeZone, setTimeZone] = useState<string>(
    LEARNING_OPERATIONAL_TIME_ZONE,
  );
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSubjects, nextTimeZone] = await Promise.all([
        api.getStudentContextSubjects(),
        readStudentTimeZone(api),
      ]);
      const nextRoutes = await Promise.all(
        nextSubjects.map(async (subject) => ({
          route: await api.getLearningRoute(subject.id),
          subject,
        })),
      );
      const flatDeliverables = nextRoutes.flatMap(({ route, subject }) =>
        deliverableItems(visibleStudentUnits(route.units)).map((item) => ({
          item,
          subject,
        })),
      );
      const nextDeliverables = includeDeliverables
        ? await mapWithConcurrency(
            flatDeliverables,
            6,
            async ({ item, subject }) => {
              try {
                return {
                  item,
                  subject,
                  submission: await getOwnSubmissionSafe(api, item.id),
                  statusAvailable: true,
                };
              } catch (statusError) {
                return {
                  item,
                  subject,
                  submission: null,
                  statusAvailable: false,
                  statusError,
                };
              }
            },
          )
        : [];
      setSubjects(nextSubjects);
      setRoutes(nextRoutes);
      setTimeZone(nextTimeZone);
      setDeliverables(nextDeliverables);
      setSubmissionStatusError(
        nextDeliverables.find((row) => !row.statusAvailable)?.statusError ??
          null,
      );
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, includeDeliverables]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return {
    deliverables,
    error,
    load,
    loading,
    routes,
    submissionStatusError,
    subjects,
    timeZone,
  };
}

function useStudentRoute(
  api: AcademicApiClient,
  requestedCourseSubjectId?: string,
  loadRoute = true,
) {
  const [subjects, setSubjects] = useState<
    Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>
  >([]);
  const [route, setRoute] = useState<LearningRoute | null>(null);
  const [timeZone, setTimeZone] = useState<string>(
    LEARNING_OPERATIONAL_TIME_ZONE,
  );
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const selected =
    subjects.find((subject) => subject.id === requestedCourseSubjectId) ??
    (requestedCourseSubjectId ? undefined : subjects[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSubjects, nextTimeZone] = await Promise.all([
        api.getStudentContextSubjects(),
        loadRoute
          ? readStudentTimeZone(api)
          : Promise.resolve(LEARNING_OPERATIONAL_TIME_ZONE),
      ]);
      setSubjects(nextSubjects);
      setTimeZone(nextTimeZone);
      const nextSubject =
        nextSubjects.find(
          (subject) => subject.id === requestedCourseSubjectId,
        ) ?? (requestedCourseSubjectId ? undefined : nextSubjects[0]);
      if (!nextSubject || !loadRoute) {
        setRoute(null);
        setLoading(false);
        return;
      }
      setRoute(await api.getLearningRoute(nextSubject.id));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, loadRoute, requestedCourseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { error, load, loading, route, selected, subjects, timeZone };
}

function DataState({
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
  if (loading)
    return (
      <div
        aria-label="Cargando contenido de aprendizaje"
        className="academic-loading"
      >
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
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
  return children;
}

function subjectCards(
  subjects: Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>,
) {
  return subjects.map((subject, index) =>
    subjectCard(subject, index, 'student'),
  );
}

function normalizeStudentSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAwaitingStudent(row: DeliverableRow) {
  return (
    row.statusAvailable !== false &&
    (!row.submission ||
      row.submission.status === 'PENDING' ||
      row.submission.status === 'CHANGES_REQUESTED')
  );
}

function compareDueDates(left: DeliverableRow, right: DeliverableRow) {
  return (
    (left.item.dueAt ? new Date(left.item.dueAt).getTime() : Infinity) -
    (right.item.dueAt ? new Date(right.item.dueAt).getTime() : Infinity)
  );
}

function StudentPagination({
  count,
  label,
  onPageChange,
  page,
  pageSize,
}: {
  count: number;
  label: string;
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
}) {
  const pageCount = Math.ceil(count / pageSize);
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);
  return (
    <nav aria-label={label} className="student-pagination">
      <span aria-live="polite">
        Mostrando {start}–{end} de {count}
      </span>
      <div className="student-pagination__actions">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          variant="secondary"
        >
          Anterior
        </Button>
        <span aria-current="page">
          Página {page} de {pageCount}
        </span>
        <Button
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          variant="secondary"
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}

function StudentShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: TrustedCurrentSession;
}) {
  const currentSession = useTrustedCurrentSession(session).session;
  return (
    <AppShell dataMode="real" session={currentSession}>
      {children}
    </AppShell>
  );
}

export function StudentDashboardScreen({
  api,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentWorkspace(client, true);
  const attention = data.deliverables
    .filter(isAwaitingStudent)
    .sort(compareDueDates);
  const next = attention[0];

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Revisa tus pendientes, vuelve a tus asignaturas y consulta tus entregas."
        title={`Hola, ${currentSession.displayName.split(' ')[0]}`}
      />
      <DataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {next ? (
          <section aria-labelledby="next-title" className="student-next">
            <div className="student-next__copy">
              <Badge
                tone={
                  next.submission?.status === 'CHANGES_REQUESTED'
                    ? 'warning'
                    : 'info'
                }
              >
                <Icon
                  name={
                    next.submission?.status === 'CHANGES_REQUESTED'
                      ? 'review'
                      : 'clock'
                  }
                />
                {next.submission?.status === 'CHANGES_REQUESTED'
                  ? 'Cambios solicitados'
                  : 'Pendiente'}
              </Badge>
              <h2 id="next-title">Tu próximo paso: {next.item.title}</h2>
              <p>
                {subjectName(next.subject)} · {courseName(next.subject)} ·{' '}
                {next.item.dueAt
                  ? `vence ${formatLearningInstant(next.item.dueAt, data.timeZone)}`
                  : 'sin fecha límite'}
              </p>
              <Link
                className="button-link button-link--accent"
                href={`/estudiante/asignaturas/${next.subject.id}/items/${next.item.id}`}
              >
                Abrir actividad <Icon name="chevron-right" />
              </Link>
            </div>
            <div
              aria-label="Ruta hacia tu entrega"
              className="student-next__route"
            >
              <div className="route-step route-step--done">
                <Icon name="check" />
                <span>Explorar</span>
              </div>
              <span />
              <div className="route-step route-step--done">
                <Icon name="check" />
                <span>Revisar</span>
              </div>
              <span />
              <div className="route-step route-step--active">
                <Icon name="document" />
                <span>Entregar</span>
              </div>
            </div>
          </section>
        ) : data.submissionStatusError ? (
          <Card className="student-next student-next--empty">
            <div>
              <Badge tone="warning">
                <Icon name="clock" />
                Estado sin confirmar
              </Badge>
              <h2>No pudimos confirmar tus pendientes</h2>
              <p>
                Actualiza el estado de tus entregas para saber qué sigue por
                hacer.
              </p>
              <Link
                className="button-link button-link--accent"
                href="/estudiante/entregas"
              >
                Revisar mis entregas <Icon name="chevron-right" />
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="student-next student-next--empty">
            <div>
              <Badge tone="success">
                <Icon name="check" />
                Ruta al día
              </Badge>
              <h2>No tienes entregas pendientes</h2>
              <p>
                Revisa tus asignaturas para continuar con el contenido
                publicado.
              </p>
              <Link
                className="button-link button-link--accent"
                href="/estudiante/asignaturas"
              >
                Ver asignaturas <Icon name="chevron-right" />
              </Link>
            </div>
          </Card>
        )}

        {data.submissionStatusError ? (
          <Alert
            action={
              <Button onClick={() => void data.load()} variant="secondary">
                Actualizar estados
              </Button>
            }
            title="No pudimos confirmar todas tus entregas"
            tone="warning"
          >
            La lista de actividades cargó, pero algunos estados no están
            disponibles. No los contamos como pendientes ni como enviadas.
          </Alert>
        ) : null}

        <div className="dashboard-layout">
          <section
            aria-labelledby="attention-title"
            className="content-section"
          >
            <div className="section-heading">
              <div>
                <h2 id="attention-title">Próximas entregas</h2>
                <p>
                  Tus pendientes con fecha aparecen primero; las sin fecha
                  quedan al final.
                </p>
              </div>
            </div>
            <div className="attention-list">
              {attention.length ? (
                attention.slice(0, 5).map((row) => (
                  <Link
                    className="attention-row"
                    href={`/estudiante/asignaturas/${row.subject.id}/items/${row.item.id}`}
                    key={row.item.id}
                  >
                    <span className="attention-mark attention-mark--warning">
                      <Icon name="clock" />
                    </span>
                    <span className="attention-copy">
                      <small>
                        {subjectName(row.subject)} · {courseName(row.subject)}
                      </small>
                      <strong>{row.item.title}</strong>
                      <span>
                        {row.item.dueAt
                          ? `Vence ${formatLearningInstant(row.item.dueAt, data.timeZone)}`
                          : 'Sin fecha límite'}
                      </span>
                    </span>
                    <Badge tone="warning">
                      {row.submission?.status === 'CHANGES_REQUESTED'
                        ? 'Cambios solicitados'
                        : row.item.type === 'ASSESSMENT'
                          ? 'Evaluación'
                          : 'Actividad'}
                    </Badge>
                    <Icon className="attention-chevron" name="chevron-right" />
                  </Link>
                ))
              ) : (
                <EmptyState
                  icon={<Icon name="calendar" />}
                  title="Sin entregas próximas"
                  description="Cuando una actividad o evaluación tenga fecha, aparecerá aquí."
                />
              )}
            </div>
          </section>
          <aside className="teacher-note">
            <Icon name="book" />
            <div>
              <h2>Tu ruta de aprendizaje</h2>
              <p>
                Aquí aparecen las asignaturas y actividades publicadas para tu
                matrícula actual.
              </p>
              <small>
                {data.subjects.length} espacio
                {data.subjects.length === 1 ? '' : 's'} efectivo
                {data.subjects.length === 1 ? '' : 's'}
              </small>
            </div>
          </aside>
        </div>

        <section
          aria-labelledby="subjects-title"
          className="content-section subject-preview"
        >
          <div className="section-heading">
            <div>
              <h2 id="subjects-title">Tus asignaturas</h2>
              <p>
                Abre una ruta para ver sus unidades y contenidos publicados.
              </p>
            </div>
            <Link href="/estudiante/asignaturas">
              Ver todas <Icon name="chevron-right" />
            </Link>
          </div>
          {data.subjects.length ? (
            <div className="subject-grid">
              {subjectCards(data.subjects)
                .slice(0, 4)
                .map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="book" />}
              title="No tienes asignaturas efectivas"
              description="Académico aún no ha encontrado una asignatura activa para tu cuenta."
            />
          )}
        </section>
      </DataState>
    </AppShell>
  );
}

export function StudentSubjectsScreen({
  api,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { error, load, loading, subjects } = useStudentRoute(
    client,
    undefined,
    false,
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 9;
  const filteredSubjects = useMemo(() => {
    const normalized = normalizeStudentSearch(query);
    return subjectCards(subjects).filter((subject) =>
      normalizeStudentSearch(`${subject.title} ${subject.subtitle}`).includes(
        normalized,
      ),
    );
  }, [query, subjects]);
  const visibleSubjects = filteredSubjects.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Estas son tus asignaturas activas. Abre una para ver su ruta de aprendizaje."
        title="Asignaturas"
      />
      <DataState error={error} loading={loading} onRetry={() => void load()}>
        {subjects.length ? (
          <>
            <div className="student-list-controls student-subject-controls">
              <Input
                id="student-subject-search"
                label="Buscar por asignatura o curso"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                type="search"
                value={query}
              />
              <span aria-live="polite">
                {filteredSubjects.length} asignatura
                {filteredSubjects.length === 1 ? '' : 's'}
              </span>
            </div>
            {filteredSubjects.length ? (
              <>
                <div className="subject-grid subject-grid--overview">
                  {visibleSubjects.map((subject) => (
                    <SubjectCard key={subject.id} subject={subject} />
                  ))}
                </div>
                <StudentPagination
                  count={filteredSubjects.length}
                  label="Paginación de asignaturas"
                  onPageChange={setPage}
                  page={page}
                  pageSize={pageSize}
                />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="search" />}
                title="No encontramos esa asignatura"
                description="Prueba con otro nombre de asignatura o curso."
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={<Icon name="book" />}
            title="Aún no tienes asignaturas efectivas"
            description="Cuando Académico registre una inscripción activa o una asignación directa, aparecerá aquí."
          />
        )}
      </DataState>
    </AppShell>
  );
}

export function StudentSubjectScreen({
  api,
  courseSubjectId,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  courseSubjectId?: string;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentRoute(client, courseSubjectId);
  const units = data.route ? visibleStudentUnits(data.route.units) : [];
  const dueCount = deliverableItems(units).filter((item) => item.dueAt).length;
  const visibleItemCount = units.reduce(
    (sum, unit) => sum + unit.items.length,
    0,
  );
  const missingSubject =
    !data.loading && !data.error && (!data.selected || !data.route);
  return (
    <StudentShell session={currentSession}>
      <DataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {missingSubject ? (
          <EmptyState
            icon={<Icon name="book" />}
            title="Asignatura no disponible"
            description="No tienes acceso a esta asignatura o ya no está activa."
          />
        ) : data.selected && data.route ? (
          <>
            <nav aria-label="Ruta de navegación" className="breadcrumbs">
              <Link href="/estudiante/asignaturas">Asignaturas</Link>
              <Icon name="chevron-right" />
              <span>{subjectName(data.selected)}</span>
            </nav>
            <section className="subject-hero">
              <div className="subject-hero__mark">
                {subjectName(data.selected).slice(0, 3).toUpperCase()}
              </div>
              <div>
                <h1>{subjectName(data.selected)}</h1>
                <p>{courseName(data.selected)} · Asignatura activa</p>
              </div>
              <div className="subject-hero__progress">
                <span>Contenido visible</span>
                <strong>{visibleItemCount}</strong>
                <small>
                  {visibleItemCount === 1
                    ? 'elemento publicado'
                    : 'elementos publicados'}
                </small>
              </div>
            </section>
            <div className="route-intro">
              <div>
                <h2>Tu ruta de aprendizaje</h2>
                <p>
                  El servidor muestra unidades activas y contenido efectivamente
                  publicado.
                </p>
              </div>
              <Badge tone={dueCount ? 'warning' : 'success'}>
                <Icon name={dueCount ? 'clock' : 'check'} />
                {dueCount
                  ? `${dueCount} entrega${dueCount === 1 ? '' : 's'} con fecha`
                  : 'Sin entregas con fecha'}
              </Badge>
            </div>
            <LearningRoute
              audience="student"
              courseSubjectId={data.selected.id}
              timeZone={data.timeZone}
              units={units}
            />
          </>
        ) : null}
      </DataState>
    </StudentShell>
  );
}

function useStudentItem(
  api: AcademicApiClient,
  courseSubjectId?: string,
  learningItemId?: string,
) {
  const [subjects, setSubjects] = useState<
    Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>
  >([]);
  const [item, setItem] = useState<LearningItem | null>(null);
  const [timeZone, setTimeZone] = useState<string>(
    LEARNING_OPERATIONAL_TIME_ZONE,
  );
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSubjects, nextTimeZone] = await Promise.all([
        api.getStudentContextSubjects(),
        readStudentTimeZone(api),
      ]);
      setSubjects(nextSubjects);
      setTimeZone(nextTimeZone);
      let nextItem: LearningItem | undefined;
      if (learningItemId) {
        nextItem = await api.getLearningItem(learningItemId);
        if (courseSubjectId && nextItem.courseSubjectId !== courseSubjectId)
          nextItem = undefined;
      } else {
        const subject =
          nextSubjects.find((candidate) => candidate.id === courseSubjectId) ??
          nextSubjects[0];
        if (subject) {
          const route = await api.getLearningRoute(subject.id);
          nextItem = deliverableItems(visibleStudentUnits(route.units)).sort(
            (left, right) =>
              new Date(left.dueAt ?? '').getTime() -
              new Date(right.dueAt ?? '').getTime(),
          )[0];
        }
      }
      if (!nextItem || !isEffectivelyVisible(nextItem)) setItem(null);
      else setItem(nextItem);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, courseSubjectId, learningItemId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const subject = subjects.find(
    (candidate) => candidate.id === item?.courseSubjectId,
  );
  return { error, item, load, loading, subject, timeZone };
}

export function StudentAssignmentScreen({
  api,
  courseSubjectId,
  learningItemId,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  courseSubjectId?: string;
  learningItemId?: string;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentItem(client, courseSubjectId, learningItemId);
  const [resourceError, setResourceError] = useState('');
  const [resourceLoading, setResourceLoading] = useState(false);

  const openResource = useCallback(
    async (fileObjectId: string) => {
      setResourceError('');
      setResourceLoading(true);
      try {
        const response = await client.downloadFile(fileObjectId);
        const url = URL.createObjectURL(response.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = response.filename ?? 'recurso-academico';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch {
        setResourceError(
          'No pudimos abrir este recurso. Inténtalo nuevamente.',
        );
      } finally {
        setResourceLoading(false);
      }
    },
    [client],
  );
  return (
    <StudentShell session={currentSession}>
      <DataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {data.item && data.subject ? (
          <>
            <nav aria-label="Ruta de navegación" className="breadcrumbs">
              <Link href="/estudiante/asignaturas">Asignaturas</Link>
              <Icon name="chevron-right" />
              <Link href={`/estudiante/asignaturas/${data.subject.id}`}>
                {subjectName(data.subject)}
              </Link>
              <Icon name="chevron-right" />
              <span>{data.item.title}</span>
            </nav>
            <div className="assignment-layout">
              <article className="assignment-content">
                <div className="assignment-title">
                  <Badge
                    tone={
                      data.item.publicationStatus === 'SCHEDULED'
                        ? 'info'
                        : 'success'
                    }
                  >
                    <Icon name="check" />
                    {data.item.publicationStatus === 'SCHEDULED'
                      ? 'Disponible por publicación efectiva'
                      : 'Publicado'}
                  </Badge>
                  <h1>{data.item.title}</h1>
                  <p>
                    {data.item.description ??
                      'Contenido publicado para esta asignatura.'}
                  </p>
                  <div className="item-context">
                    <span>{subjectName(data.subject)}</span>
                    <span>{courseName(data.subject)}</span>
                    <span>
                      {data.item.type === 'ASSESSMENT'
                        ? 'Evaluación en documento'
                        : data.item.type === 'ASSIGNMENT'
                          ? 'Actividad'
                          : data.item.type === 'MATERIAL'
                            ? 'Material'
                            : 'Anuncio'}
                    </span>
                    <span>
                      {data.item.dueAt
                        ? `Vence ${formatLearningInstant(data.item.dueAt, data.timeZone)}`
                        : 'Sin fecha límite'}
                    </span>
                  </div>
                </div>
                {resourceError ? (
                  <Alert title="No se pudo abrir el recurso" tone="error">
                    {resourceError}
                  </Alert>
                ) : null}
                {resourceLoading ? (
                  <p aria-live="polite" className="ui-field-hint">
                    Abriendo recurso…
                  </p>
                ) : null}
                {data.item.bodyDocument ||
                data.item.instructions ||
                data.item.content ||
                data.item.body ||
                data.item.type === 'ASSIGNMENT' ||
                data.item.type === 'ASSESSMENT' ? (
                  <section>
                    <h2>
                      {data.item.type === 'ANNOUNCEMENT'
                        ? 'Mensaje'
                        : data.item.type === 'MATERIAL'
                          ? 'Contenido'
                          : 'Instrucciones'}
                    </h2>
                    <div className="learning-rich-text">
                      {data.item.bodyDocument ||
                      data.item.instructions ||
                      data.item.content ||
                      data.item.body ? (
                        <BodyDocumentRenderer
                          document={data.item.bodyDocument}
                          fallbackText={
                            data.item.type === 'ANNOUNCEMENT'
                              ? data.item.body
                              : data.item.type === 'MATERIAL'
                                ? data.item.content
                                : data.item.instructions
                          }
                          onOpenFile={openResource}
                        />
                      ) : (
                        <p>No se agregaron instrucciones adicionales.</p>
                      )}
                    </div>
                  </section>
                ) : null}
                {data.item.type !== 'ANNOUNCEMENT' ? (
                  <LearningAttachmentList
                    api={client}
                    learningItemId={data.item.id}
                  />
                ) : null}
                {data.item.dueAt ? (
                  <Alert title="Fecha de entrega" tone="warning">
                    {formatLearningInstant(data.item.dueAt, data.timeZone)}. La
                    hora y la condición de atraso serán determinadas por el
                    servidor.
                  </Alert>
                ) : null}
              </article>
              <aside>
                {data.item.type === 'ASSIGNMENT' ||
                data.item.type === 'ASSESSMENT' ? (
                  <StudentSubmissionWorkflow
                    api={client}
                    item={data.item}
                    key={data.item.id}
                    timeZone={data.timeZone}
                  />
                ) : (
                  <Card className="item-side-note">
                    <Icon name="layers" />
                    <h2>Contenido publicado</h2>
                    <p>Este tipo de contenido no solicita una entrega.</p>
                  </Card>
                )}
              </aside>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Icon name="document" />}
            title="Contenido no disponible"
            description="Este contenido no está publicado para ti, fue archivado o el enlace ya no es válido."
          />
        )}
      </DataState>
    </StudentShell>
  );
}

function getOwnSubmissionSafe(
  api: AcademicApiClient,
  learningItemId: string,
): Promise<Submission | null> {
  if (typeof api.getOwnSubmission !== 'function') return Promise.resolve(null);
  return api.getOwnSubmission(learningItemId).catch((error) => {
    if (error instanceof AcademicApiError && error.status === 404) return null;
    throw error;
  });
}

function deliverableStatusMeta(row: DeliverableRow) {
  if (row.statusAvailable === false)
    return {
      icon: 'clock' as const,
      label: 'Estado no disponible',
      tone: 'warning' as const,
    };
  const status = row.submission?.status ?? 'PENDING';
  const latest = row.submission?.revisions.at(-1);
  if (status === 'CHANGES_REQUESTED')
    return {
      icon: 'review' as const,
      label: 'Cambios solicitados',
      tone: 'warning' as const,
    };
  if (status === 'SUBMITTED')
    return {
      icon: 'document' as const,
      label: latest?.isLate ? 'Enviada con atraso' : 'Enviada',
      tone: 'info' as const,
    };
  if (status === 'REVIEWED')
    return {
      icon: 'check' as const,
      label: 'Revisada',
      tone: 'success' as const,
    };
  return {
    icon: 'document' as const,
    label: 'Pendiente',
    tone: 'neutral' as const,
  };
}

function deliverableTimeCopy(row: DeliverableRow, timeZone: string) {
  if (row.statusAvailable === false) return 'No pudimos actualizar el estado';
  const status = row.submission?.status ?? 'PENDING';
  const latest = row.submission?.revisions.at(-1);
  if (status === 'SUBMITTED' || status === 'REVIEWED')
    return latest
      ? `Enviada ${formatLearningInstant(latest.submittedAt, timeZone)}`
      : 'Enviada';
  if (status === 'CHANGES_REQUESTED') {
    const requestedAt = latest?.reviews
      .filter((review) => review.action === 'CHANGES_REQUESTED')
      .at(-1)?.createdAt;
    return requestedAt
      ? `Cambios solicitados ${formatLearningInstant(requestedAt, timeZone)}`
      : 'Cambios solicitados';
  }
  return row.item.dueAt
    ? `Vence ${formatLearningInstant(row.item.dueAt, timeZone)}`
    : 'Sin fecha límite';
}

function DeliverableRowLink({
  row,
  timeZone,
}: {
  row: DeliverableRow;
  timeZone: string;
}) {
  const meta = deliverableStatusMeta(row);
  return (
    <Link
      className="submission-row submission-row--student-link"
      href={`/estudiante/asignaturas/${row.subject.id}/items/${row.item.id}`}
      key={row.item.id}
    >
      <span className={`submission-row__icon-box submission-row__icon-box--${meta.tone}`}>
        <Icon name={meta.icon} />
      </span>
      <span className="submission-row__main">
        <strong>{row.item.title}</strong>
        <small>
          {subjectName(row.subject)} · {courseName(row.subject)}
        </small>
      </span>
      <span className="submission-time">
        <small>{deliverableTimeCopy(row, timeZone)}</small>
      </span>
      <Badge tone={meta.tone}>{meta.label}</Badge>
      <Icon className="submission-row__chevron" name="chevron-right" />
    </Link>
  );
}

export function StudentDeliverablesScreen({
  api,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentWorkspace(client, true);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const filteredRows = useMemo(() => {
    const normalized = normalizeStudentSearch(query);
    return data.deliverables
      .filter(
        (row) => subjectFilter === 'all' || row.subject.id === subjectFilter,
      )
      .filter((row) =>
        normalizeStudentSearch(
          `${row.item.title} ${subjectName(row.subject)} ${courseName(row.subject)}`,
        ).includes(normalized),
      )
      .filter((row) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'unavailable')
          return row.statusAvailable === false;
        if (row.statusAvailable === false) return false;
        const status = row.submission?.status ?? 'PENDING';
        return statusFilter === 'pending'
          ? status === 'PENDING'
          : status === statusFilter;
      })
      .sort((left, right) => {
        const rank = (row: DeliverableRow) => {
          if (row.statusAvailable === false) return 2;
          if (row.submission?.status === 'CHANGES_REQUESTED') return 1;
          if (!row.submission || row.submission.status === 'PENDING') return 0;
          if (row.submission.status === 'SUBMITTED') return 3;
          return 4;
        };
        const rankDifference = rank(left) - rank(right);
        if (rankDifference) return rankDifference;
        if (rank(left) >= 3) {
          const leftTime = left.submission?.revisions.at(-1)?.submittedAt ?? '';
          const rightTime =
            right.submission?.revisions.at(-1)?.submittedAt ?? '';
          return rightTime.localeCompare(leftTime);
        }
        return compareDueDates(left, right);
      });
  }, [data.deliverables, query, statusFilter, subjectFilter]);
  const visibleRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const sections = [
    {
      key: 'attention',
      title: 'Requiere tu atención',
      description:
        'Actividades pendientes y cambios solicitados por tu docente.',
      rows: visibleRows.filter(
        (row) =>
          row.statusAvailable !== false &&
          (!row.submission ||
            row.submission.status === 'PENDING' ||
            row.submission.status === 'CHANGES_REQUESTED'),
      ),
    },
    {
      key: 'unavailable',
      title: 'Estado sin confirmar',
      description: 'No pudimos cargar el estado de estas actividades.',
      rows: visibleRows.filter((row) => row.statusAvailable === false),
    },
    {
      key: 'in-review',
      title: 'En revisión',
      description: 'Ya las enviaste; tu docente aún no termina de revisarlas.',
      rows: visibleRows.filter((row) => row.submission?.status === 'SUBMITTED'),
    },
    {
      key: 'reviewed',
      title: 'Revisadas',
      description: 'Tu docente ya completó la revisión de estas entregas.',
      rows: visibleRows.filter((row) => row.submission?.status === 'REVIEWED'),
    },
  ].filter((section) => section.rows.length);

  return (
    <StudentShell session={currentSession}>
      <PageHeading
        description="Actividades y evaluaciones de tus asignaturas, organizadas por lo que necesitas hacer."
        title="Mis entregas"
      />
      <DataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {data.deliverables.length ? (
          <>
            <div className="student-list-controls student-deliverable-controls">
              <Input
                id="student-deliverable-search"
                label="Buscar por actividad, asignatura o curso"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                type="search"
                value={query}
              />
              <Select
                id="student-deliverable-subject"
                label="Asignatura"
                onChange={(event) => {
                  setSubjectFilter(event.target.value);
                  setPage(1);
                }}
                value={subjectFilter}
              >
                <option value="all">Todas las asignaturas</option>
                {data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subjectName(subject)} · {courseName(subject)}
                  </option>
                ))}
              </Select>
              <Select
                id="student-deliverable-status"
                label="Estado"
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="CHANGES_REQUESTED">Cambios solicitados</option>
                <option value="SUBMITTED">En revisión</option>
                <option value="REVIEWED">Revisadas</option>
                <option value="unavailable">Estado no disponible</option>
              </Select>
              <span aria-live="polite">
                {filteredRows.length} actividad
                {filteredRows.length === 1 ? '' : 'es'}
              </span>
            </div>
            {data.submissionStatusError ? (
              <Alert
                action={
                  <Button onClick={() => void data.load()} variant="secondary">
                    Actualizar estados
                  </Button>
                }
                title="Algunos estados no se pudieron consultar"
                tone="warning"
              >
                Las actividades siguen visibles. Los estados sin respuesta no se
                cuentan como pendientes ni como entregadas.
              </Alert>
            ) : null}
            {filteredRows.length ? (
              <>
                {sections.map((section) => (
                  <section
                    aria-labelledby={`student-deliverables-${section.key}`}
                    className="content-section"
                    key={section.key}
                  >
                    <div className="section-heading">
                      <div>
                        <h2 id={`student-deliverables-${section.key}`}>
                          {section.title}
                        </h2>
                        <p>{section.description}</p>
                      </div>
                    </div>
                    <div className="submission-list">
                      {section.rows.map((row) => (
                        <DeliverableRowLink
                          key={row.item.id}
                          row={row}
                          timeZone={data.timeZone}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                <StudentPagination
                  count={filteredRows.length}
                  label="Paginación de entregas"
                  onPageChange={setPage}
                  page={page}
                  pageSize={pageSize}
                />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="search" />}
                title="No hay actividades con esos filtros"
                description="Cambia la búsqueda o los filtros para ver otras entregas."
              />
            )}
          </>
        ) : data.subjects.length ? (
          <EmptyState
            icon={<Icon name="clipboard" />}
            title="Aún no tienes actividades para entregar"
            description="Cuando tus profesores publiquen actividades o evaluaciones, aparecerán aquí."
          />
        ) : (
          <EmptyState
            icon={<Icon name="book" />}
            title="Aún no tienes asignaturas activas"
            description="Cuando aparezca una matrícula o asignación vigente, verás aquí las actividades."
          />
        )}
      </DataState>
    </StudentShell>
  );
}

function groupDeliverablesByDay(rows: DeliverableRow[], timeZone: string) {
  const groups: Array<{ key: string; label: string; rows: typeof rows }> = [];
  for (const row of rows) {
    if (!row.item.dueAt) continue;
    const key = learningCalendarDayKey(row.item.dueAt, timeZone);
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.rows.push(row);
    else
      groups.push({
        key,
        label: formatLearningCalendarDay(row.item.dueAt, Date.now(), timeZone),
        rows: [row],
      });
  }
  return groups;
}

export function StudentCalendarScreen({
  api,
  session = demoSessions.student,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentWorkspace(client, true);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const filteredRows = useMemo(() => {
    const normalized = normalizeStudentSearch(query);
    return data.deliverables
      .filter((row) => row.item.dueAt)
      .filter(
        (row) => subjectFilter === 'all' || row.subject.id === subjectFilter,
      )
      .filter((row) =>
        normalizeStudentSearch(
          `${row.item.title} ${subjectName(row.subject)} ${courseName(row.subject)}`,
        ).includes(normalized),
      )
      .filter((row) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'unavailable')
          return row.statusAvailable === false;
        if (row.statusAvailable === false) return false;
        const status = row.submission?.status ?? 'PENDING';
        return statusFilter === 'pending'
          ? status === 'PENDING'
          : status === statusFilter;
      })
      .sort((left, right) => compareDueDates(left, right));
  }, [data.deliverables, query, statusFilter, subjectFilter]);
  const visibleRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const groups = groupDeliverablesByDay(visibleRows, data.timeZone);

  return (
    <StudentShell session={currentSession}>
      <PageHeading
        description="Consulta las fechas y estados de actividades publicadas para tus asignaturas."
        title="Calendario"
      />
      <DataState
        error={data.error}
        loading={data.loading}
        onRetry={() => void data.load()}
      >
        {data.deliverables.some((row) => row.item.dueAt) ? (
          <>
            <div className="student-list-controls student-calendar-controls">
              <Input
                id="student-calendar-search"
                label="Buscar por actividad, asignatura o curso"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                type="search"
                value={query}
              />
              <Select
                id="student-calendar-subject"
                label="Asignatura"
                onChange={(event) => {
                  setSubjectFilter(event.target.value);
                  setPage(1);
                }}
                value={subjectFilter}
              >
                <option value="all">Todas las asignaturas</option>
                {data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subjectName(subject)} · {courseName(subject)}
                  </option>
                ))}
              </Select>
              <Select
                id="student-calendar-status"
                label="Estado"
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="CHANGES_REQUESTED">Cambios solicitados</option>
                <option value="SUBMITTED">En revisión</option>
                <option value="REVIEWED">Revisadas</option>
                <option value="unavailable">Estado no disponible</option>
              </Select>
              <span aria-live="polite">
                {filteredRows.length} fecha
                {filteredRows.length === 1 ? '' : 's'}
              </span>
            </div>
            {data.submissionStatusError ? (
              <Alert
                action={
                  <Button onClick={() => void data.load()} variant="secondary">
                    Actualizar estados
                  </Button>
                }
                title="Algunos estados no se pudieron consultar"
                tone="warning"
              >
                Las fechas se muestran; los estados sin respuesta se indican
                como no disponibles.
              </Alert>
            ) : null}
            {groups.length ? (
              <>
                <div className="calendar-agenda">
                  {groups.map((group) => (
                    <section
                      aria-labelledby={`calendar-day-${group.key}`}
                      className="calendar-day"
                      key={group.key}
                    >
                      <h2 id={`calendar-day-${group.key}`}>{group.label}</h2>
                      <div className="learning-items">
                        {group.rows.map((row) => {
                          const { item, subject } = row;
                          const status = deliverableStatusMeta(row);
                          return (
                            <Link
                              className="learning-item"
                              href={`/estudiante/asignaturas/${subject.id}/items/${item.id}`}
                              key={item.id}
                            >
                              <span
                                className={`learning-item__icon learning-item__icon--${item.type.toLowerCase()}`}
                              >
                                <Icon
                                  name={
                                    item.type === 'ASSESSMENT'
                                      ? 'document'
                                      : 'clipboard'
                                  }
                                />
                              </span>
                              <span className="learning-item__copy">
                                <small>{subjectName(subject)}</small>
                                <strong>{item.title}</strong>
                                <span>{courseName(subject)}</span>
                              </span>
                              <span className="learning-item__meta">
                                <small>
                                  <Icon name="clock" />
                                  {formatLearningInstant(
                                    item.dueAt ?? '',
                                    data.timeZone,
                                  )}
                                </small>
                                <Badge tone={status.tone}>{status.label}</Badge>
                              </span>
                              <Icon
                                className="learning-item__chevron"
                                name="chevron-right"
                              />
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <StudentPagination
                  count={filteredRows.length}
                  label="Paginación del calendario"
                  onPageChange={setPage}
                  page={page}
                  pageSize={pageSize}
                />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="search" />}
                title="No hay fechas con esos filtros"
                description="Cambia la búsqueda o los filtros para ver otras actividades."
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={<Icon name="calendar" />}
            title="Sin fechas próximas"
            description="Cuando tus profesores publiquen actividades o evaluaciones con fecha límite, aparecerán aquí."
          />
        )}
      </DataState>
    </StudentShell>
  );
}
