'use client';

import { Alert, Button, Card, EmptyState, Skeleton } from '@edupay/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

type TeacherSubject = Awaited<
  ReturnType<AcademicApiClient['getTeacherContextSubjects']>
>[number];
type TeacherRoster = Awaited<
  ReturnType<AcademicApiClient['getTeacherCourseSubjectRoster']>
>;

function subjectName(subject: TeacherSubject) {
  return subject.subject?.name ?? `Asignatura ${subject.subjectId.slice(0, 8)}`;
}

function courseName(subject: TeacherSubject) {
  return subject.course?.label ?? `Curso ${subject.courseId.slice(0, 8)}`;
}

function rosterError(error: unknown) {
  if (error instanceof AcademicApiError && error.status === 401) {
    return {
      title: 'Sesión no disponible',
      body: error.message,
    };
  }
  if (error instanceof AcademicApiError && error.status === 403) {
    return {
      title: 'Acceso no autorizado',
      body: 'El servidor no encontró una relación docente activa que permita ver este roster.',
    };
  }
  if (error instanceof AcademicApiError && error.status === 404) {
    return {
      title: 'Asignatura no disponible',
      body: 'Este espacio ya no está disponible para tu sesión.',
    };
  }
  return {
    title: 'No pudimos cargar los estudiantes',
    body: 'Revisa tu conexión e inténtalo nuevamente.',
  };
}

function useTeacherCourseSubjectRoster(
  api: AcademicApiClient,
  courseSubjectId: string,
) {
  const [subject, setSubject] = useState<TeacherSubject | null>(null);
  const [roster, setRoster] = useState<TeacherRoster>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubject(null);
    setRoster([]);

    try {
      // Gate the roster request with the same teacher context used by the
      // subject workspace. An unknown or unassigned subject never gets a
      // roster request from the browser.
      const subjects = await api.getTeacherContextSubjects();
      const nextSubject = subjects.find((item) => item.id === courseSubjectId);
      if (!nextSubject) return;

      setSubject(nextSubject);
      setRoster(await api.getTeacherCourseSubjectRoster(courseSubjectId));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, courseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { error, load, loading, roster, subject };
}

function RosterErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const copy = rosterError(error);
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
    </Alert>
  );
}

export function TeacherCourseSubjectRosterScreen({
  api,
  courseSubjectId,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  courseSubjectId: string;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherCourseSubjectRoster(client, courseSubjectId);
  const missingSubject = !data.loading && !data.error && !data.subject;

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        action={
          <Link
            className="button-link button-link--primary"
            href={`/docente/asignaturas/${courseSubjectId}`}
          >
            <Icon name="chevron-left" />
            Volver a la asignatura
          </Link>
        }
        description={
          data.subject
            ? `${courseName(data.subject)} · Solo incluye estudiantes con acceso académico reconocido por el servidor.`
            : 'Solo puedes consultar el roster de una asignatura con asignación docente activa.'
        }
        title={
          data.subject
            ? `Estudiantes · ${subjectName(data.subject)}`
            : 'Estudiantes de la asignatura'
        }
      />

      {data.loading ? (
        <div aria-label="Cargando estudiantes" className="academic-loading">
          <Skeleton />
          <Skeleton />
        </div>
      ) : data.error ? (
        <RosterErrorState error={data.error} onRetry={() => void data.load()} />
      ) : missingSubject ? (
        <EmptyState
          description="No tienes autorización para ver este roster o la asignatura ya no se encuentra activa."
          icon={<Icon name="people" />}
          title="Asignatura no disponible"
        />
      ) : (
        <Card className="academic-roster">
          <div className="section-heading">
            <div>
              <h2>Estudiantes con acceso</h2>
              <p>
                La lista se entrega según la matrícula del curso y los accesos
                directos vigentes.
              </p>
            </div>
          </div>
          {data.roster.length ? (
            <ul>
              {data.roster.map((entry) => (
                <li key={entry.student.id}>
                  <span>
                    {entry.student.firstName} {entry.student.lastName}
                  </span>
                  <small>
                    {entry.access.includes('DIRECT')
                      ? 'Acceso directo'
                      : 'Curso por defecto'}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay estudiantes disponibles para mostrar.</p>
          )}
        </Card>
      )}
    </AppShell>
  );
}
