'use client';

import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '@edupay/ui';
import type { CourseSubjectLearningRoute, LearningItem } from '@edupay/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { LearningAttachmentList } from '@/components/learning-attachment-list';
import { StudentSubmissionWorkflow } from '@/components/student-submission-workflow';
import { LearningRoute, PageHeading, SubjectCard } from '@/components/page-primitives';
import { useTrustedCurrentSession, type TrustedCurrentSession } from '@/auth/current-session';
import { demoSessions } from '@/demo/demo-data';
import {
  courseName,
  deliverableItems,
  errorCopy,
  formatDay,
  formatInstant,
  isEffectivelyVisible,
  subjectCard,
  subjectName,
  visibleStudentUnits,
} from '@/features/learning-screen-support';

type LearningRoute = CourseSubjectLearningRoute;

function useStudentWorkspace(api: AcademicApiClient) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>>([]);
  const [routes, setRoutes] = useState<Array<{ route: LearningRoute; subject: (typeof subjects)[number] }>>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSubjects = await api.getStudentContextSubjects();
      const nextRoutes = await Promise.all(nextSubjects.map(async (subject) => ({
        route: await api.getLearningRoute(subject.id),
        subject,
      })));
      setSubjects(nextSubjects);
      setRoutes(nextRoutes);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { error, load, loading, routes, subjects };
}

function useStudentRoute(api: AcademicApiClient, requestedCourseSubjectId?: string, loadRoute = true) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>>([]);
  const [route, setRoute] = useState<LearningRoute | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const selected = subjects.find((subject) => subject.id === requestedCourseSubjectId) ?? (requestedCourseSubjectId ? undefined : subjects[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSubjects = await api.getStudentContextSubjects();
      setSubjects(nextSubjects);
      const nextSubject = nextSubjects.find((subject) => subject.id === requestedCourseSubjectId) ?? (requestedCourseSubjectId ? undefined : nextSubjects[0]);
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

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { error, load, loading, route, selected, subjects };
}

function DataState({ children, error, loading, onRetry }: { children: React.ReactNode; error: unknown; loading: boolean; onRetry: () => void }) {
  if (loading) return <div aria-label="Cargando contenido de aprendizaje" className="academic-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (error) {
    const copy = errorCopy(error);
    return <Alert action={<Button onClick={onRetry} variant="secondary">Reintentar</Button>} title={copy.title} tone={copy.title === 'Acceso no autorizado' ? 'warning' : 'error'}>{copy.body}{error instanceof AcademicApiError && error.requestId !== 'unavailable' ? <small className="request-id">Referencia: {error.requestId}</small> : null}</Alert>;
  }
  return children;
}

function subjectCards(subjects: Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>) {
  return subjects.map((subject, index) => subjectCard(subject, index, 'student'));
}

function StudentShell({ children, session }: { children: React.ReactNode; session: TrustedCurrentSession }) {
  const currentSession = useTrustedCurrentSession(session).session;
  return <AppShell dataMode="real" session={currentSession}>{children}</AppShell>;
}

export function StudentDashboardScreen({ api, session = demoSessions.student }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentWorkspace(client);
  const attention = data.routes
    .flatMap(({ route, subject }) => deliverableItems(visibleStudentUnits(route.units)).map((item) => ({ item, subject })))
    .filter(({ item }) => item.dueAt)
    .sort((left, right) => new Date(left.item.dueAt ?? '').getTime() - new Date(right.item.dueAt ?? '').getTime());
  const next = attention[0];

  return <AppShell dataMode="real" session={currentSession}>
    <PageHeading description={`${formatDay(new Date().toISOString())} · Tu ruta se actualiza desde Académico.`} title={`Hola, ${currentSession.displayName.split(' ')[0]}`} />
    <DataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>
      {next ? <section aria-labelledby="next-title" className="student-next">
        <div className="student-next__copy">
          <Badge tone="warning"><Icon name="clock" />Próxima entrega</Badge>
          <h2 id="next-title">Tu próximo paso: {next.item.title}</h2>
          <p>{subjectName(next.subject)} · {courseName(next.subject)} · vence {formatInstant(next.item.dueAt ?? '')}</p>
          <Link className="button-link button-link--accent" href={`/estudiante/asignaturas/${next.subject.id}/items/${next.item.id}`}>Abrir actividad <Icon name="chevron-right" /></Link>
        </div>
        <div aria-label="Ruta hacia tu entrega" className="student-next__route">
          <div className="route-step route-step--done"><Icon name="check" /><span>Explorar</span></div><span />
          <div className="route-step route-step--done"><Icon name="check" /><span>Revisar</span></div><span />
          <div className="route-step route-step--active"><Icon name="document" /><span>Entregar</span></div>
        </div>
      </section> : <Card className="student-next student-next--empty"><div><Badge tone="success"><Icon name="check" />Ruta al día</Badge><h2>No tienes entregas con fecha próxima</h2><p>Revisa tus asignaturas para continuar con el contenido publicado.</p><Link className="button-link button-link--accent" href="/estudiante/asignaturas">Ver asignaturas <Icon name="chevron-right" /></Link></div></Card>}

      <div className="dashboard-layout">
        <section aria-labelledby="attention-title" className="content-section">
          <div className="section-heading"><div><h2 id="attention-title">Próximas entregas</h2><p>Solo aparecen actividades y evaluaciones visibles para ti.</p></div></div>
          <div className="attention-list">
            {attention.length ? attention.slice(0, 5).map(({ item, subject }) => <Link className="attention-row" href={`/estudiante/asignaturas/${subject.id}/items/${item.id}`} key={item.id}>
              <span className="attention-mark attention-mark--warning"><Icon name="clock" /></span>
              <span className="attention-copy"><small>{subjectName(subject)} · {courseName(subject)}</small><strong>{item.title}</strong><span>Vence {formatInstant(item.dueAt ?? '')}</span></span>
              <Badge tone="warning">{item.type === 'ASSESSMENT' ? 'Evaluación' : 'Actividad'}</Badge><Icon className="attention-chevron" name="chevron-right" />
            </Link>) : <EmptyState icon={<Icon name="calendar" />} title="Sin entregas próximas" description="Cuando una actividad o evaluación tenga fecha, aparecerá aquí." />}
          </div>
        </section>
        <aside className="teacher-note"><Icon name="layers" /><div><h2>Contenido actualizado</h2><p>Las rutas visibles y sus fechas vienen del Learning API. El servidor decide qué CourseSubjects y contenidos puedes consultar.</p><small>{data.subjects.length} espacio{data.subjects.length === 1 ? '' : 's'} efectivo{data.subjects.length === 1 ? '' : 's'}</small></div></aside>
      </div>

      <section aria-labelledby="subjects-title" className="content-section subject-preview">
        <div className="section-heading"><div><h2 id="subjects-title">Tus asignaturas</h2><p>Abre una ruta para ver sus unidades y contenidos publicados.</p></div><Link href="/estudiante/asignaturas">Ver todas <Icon name="chevron-right" /></Link></div>
        {data.subjects.length ? <div className="subject-grid">{subjectCards(data.subjects).slice(0, 4).map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div> : <EmptyState icon={<Icon name="book" />} title="No tienes asignaturas efectivas" description="Académico aún no ha encontrado un CourseSubject activo para tu cuenta." />}
      </section>
    </DataState>
  </AppShell>;
}

export function StudentSubjectsScreen({ api, session = demoSessions.student }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { error, load, loading, subjects } = useStudentRoute(client, undefined, false);
  return <AppShell dataMode="real" session={currentSession}><PageHeading description="Tus CourseSubjects efectivos se calculan en Académico a partir de tus inscripciones activas." title="Asignaturas" /><DataState error={error} loading={loading} onRetry={() => void load()}>{subjects.length ? <div className="subject-grid subject-grid--overview">{subjectCards(subjects).map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div> : <EmptyState icon={<Icon name="book" />} title="Aún no tienes asignaturas efectivas" description="Cuando Académico registre una inscripción activa o una asignación directa, aparecerá aquí." />}</DataState></AppShell>;
}

export function StudentSubjectScreen({ api, courseSubjectId, session = demoSessions.student }: { api?: AcademicApiClient; courseSubjectId?: string; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentRoute(client, courseSubjectId);
  const units = data.route ? visibleStudentUnits(data.route.units) : [];
  const dueCount = deliverableItems(units).filter((item) => item.dueAt).length;
  const missingSubject = !data.loading && !data.error && (!data.selected || !data.route);
  return <StudentShell session={currentSession}><DataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>{missingSubject ? <EmptyState icon={<Icon name="book" />} title="CourseSubject no disponible" description="No tienes acceso a este espacio o ya no está activo." /> : data.selected && data.route ? <>
    <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/estudiante/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><span>{subjectName(data.selected)}</span></nav>
    <section className="subject-hero"><div className="subject-hero__mark">{subjectName(data.selected).slice(0, 3).toUpperCase()}</div><div><h1>{subjectName(data.selected)}</h1><p>{courseName(data.selected)} · CourseSubject activo</p></div><div className="subject-hero__progress"><span>Contenido visible</span><strong>{units.reduce((sum, unit) => sum + unit.items.length, 0)}</strong><small>elementos publicados</small></div></section>
    <div className="route-intro"><div><h2>Tu ruta de aprendizaje</h2><p>El servidor muestra unidades activas y contenido efectivamente publicado.</p></div><Badge tone={dueCount ? 'warning' : 'success'}><Icon name={dueCount ? 'clock' : 'check'} />{dueCount ? `${dueCount} entrega${dueCount === 1 ? '' : 's'} con fecha` : 'Sin entregas con fecha'}</Badge></div>
    <LearningRoute audience="student" courseSubjectId={data.selected.id} units={units} />
  </> : null}</DataState></StudentShell>;
}

function useStudentItem(api: AcademicApiClient, courseSubjectId?: string, learningItemId?: string) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>>([]);
  const [item, setItem] = useState<LearningItem | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const nextSubjects = await api.getStudentContextSubjects();
      setSubjects(nextSubjects);
      let nextItem: LearningItem | undefined;
      if (learningItemId) {
        nextItem = await api.getLearningItem(learningItemId);
        if (courseSubjectId && nextItem.courseSubjectId !== courseSubjectId) nextItem = undefined;
      } else {
        const subject = nextSubjects.find((candidate) => candidate.id === courseSubjectId) ?? nextSubjects[0];
        if (subject) {
          const route = await api.getLearningRoute(subject.id);
          nextItem = deliverableItems(visibleStudentUnits(route.units)).sort((left, right) => new Date(left.dueAt ?? '').getTime() - new Date(right.dueAt ?? '').getTime())[0];
        }
      }
      if (!nextItem || !isEffectivelyVisible(nextItem)) setItem(null);
      else setItem(nextItem);
    } catch (nextError) { setError(nextError); }
    finally { setLoading(false); }
  }, [api, courseSubjectId, learningItemId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const subject = subjects.find((candidate) => candidate.id === item?.courseSubjectId);
  return { error, item, load, loading, subject };
}

export function StudentAssignmentScreen({ api, courseSubjectId, learningItemId, session = demoSessions.student }: { api?: AcademicApiClient; courseSubjectId?: string; learningItemId?: string; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useStudentItem(client, courseSubjectId, learningItemId);
  return <StudentShell session={currentSession}><DataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>{data.item && data.subject ? <>
    <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/estudiante/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><Link href={`/estudiante/asignaturas/${data.subject.id}`}>{subjectName(data.subject)}</Link><Icon name="chevron-right" /><span>{data.item.title}</span></nav>
    <div className="assignment-layout"><article className="assignment-content"><div className="assignment-title"><Badge tone={data.item.publicationStatus === 'SCHEDULED' ? 'info' : 'success'}><Icon name="check" />{data.item.publicationStatus === 'SCHEDULED' ? 'Disponible por publicación efectiva' : 'Publicado'}</Badge><h1>{data.item.title}</h1><p>{data.item.description ?? 'Contenido de aprendizaje publicado para tu CourseSubject.'}</p><div className="item-context"><span>{subjectName(data.subject)}</span><span>{courseName(data.subject)}</span><span>{data.item.type === 'ASSESSMENT' ? 'Evaluación en documento' : data.item.type === 'ASSIGNMENT' ? 'Actividad' : data.item.type === 'MATERIAL' ? 'Material' : 'Anuncio'}</span>{data.item.dueAt ? <span>Vence {formatInstant(data.item.dueAt)}</span> : null}</div></div>
      {data.item.instructions ? <section><h2>Instrucciones</h2><div className="learning-rich-text">{data.item.instructions}</div></section> : null}
      {data.item.content ? <section><h2>Contenido</h2><div className="learning-rich-text">{data.item.content}</div></section> : null}
      {data.item.body ? <section><h2>Mensaje</h2><div className="learning-rich-text">{data.item.body}</div></section> : null}
      {data.item.type !== 'ANNOUNCEMENT' ? <LearningAttachmentList api={client} learningItemId={data.item.id} /> : null}
      {data.item.dueAt ? <Alert title="Fecha de entrega" tone="warning">{formatInstant(data.item.dueAt)}. La hora y la condición de atraso serán determinadas por el servidor.</Alert> : null}
      </article><aside>{data.item.type === 'ASSIGNMENT' || data.item.type === 'ASSESSMENT' ? <StudentSubmissionWorkflow api={client} item={data.item} /> : <Card className="item-side-note"><Icon name="layers" /><h2>Contenido publicado</h2><p>Este tipo de contenido no solicita una entrega.</p></Card>}</aside></div>
  </> : <EmptyState icon={<Icon name="document" />} title="Contenido no disponible" description="Este contenido no está publicado para ti, fue archivado o el enlace ya no es válido." />}</DataState></StudentShell>;
}

export function StudentPlaceholderScreen({ title }: { title: string }) {
  const session = useTrustedCurrentSession(demoSessions.student).session;
  return <StudentShell session={session}><PageHeading description="Esta navegación está preparada para una fase posterior del MVP." title={title} /><Card className="placeholder-panel"><Icon name="layers" /><h2>Fundación lista</h2><p>La ruta existe para validar el shell responsive, pero su flujo aún no está implementado ni conectado a datos académicos.</p><Button disabled>Disponible más adelante</Button></Card></StudentShell>;
}
