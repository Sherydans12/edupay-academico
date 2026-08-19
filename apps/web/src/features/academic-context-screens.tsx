'use client';

import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '@edupay/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { useTrustedCurrentSession, type TrustedCurrentSession } from '@/auth/current-session';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

function contextError(error: unknown) {
  if (error instanceof AcademicApiError && error.status === 401) return { title: 'Sesión no disponible', body: error.message };
  if (error instanceof AcademicApiError && error.status === 403) return { title: 'Acceso no autorizado', body: 'El servidor no encontró una relación académica activa que permita ver esta información.' };
  if (error instanceof AcademicApiError && error.status === 404) return { title: 'Registro no encontrado', body: 'Este espacio ya no está disponible.' };
  return { title: 'No pudimos cargar tus asignaturas', body: 'Revisa tu conexión e inténtalo nuevamente.' };
}

function useContextSubjects(api: AcademicApiClient, role: 'student' | 'teacher') {
  const [items, setItems] = useState<Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await (role === 'student' ? api.getStudentContextSubjects() : api.getTeacherContextSubjects()));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, role]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { error, items, load, loading };
}

function ContextState({ children, error, loading, onRetry }: { children: ReactNode; error: unknown; loading: boolean; onRetry: () => void }) {
  if (loading) return <div aria-label="Cargando asignaturas" className="academic-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (error) {
    const copy = contextError(error);
    return <Alert action={<Button onClick={onRetry} variant="secondary">Reintentar</Button>} title={copy.title} tone={copy.title === 'Acceso no autorizado' ? 'warning' : 'error'}>{copy.body}</Alert>;
  }
  return children;
}

function subjectName(item: { subject?: { name: string } | undefined; subjectId: string }) {
  return item.subject?.name ?? `Asignatura ${item.subjectId.slice(0, 8)}`;
}

function courseName(item: { course?: { label: string } | undefined; courseId: string }) {
  return item.course?.label ?? `Curso ${item.courseId.slice(0, 8)}`;
}

export function TeacherAcademicSubjectsScreen({ api, session = demoSessions.teacher }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { error, items, load, loading } = useContextSubjects(client, 'teacher');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Awaited<ReturnType<AcademicApiClient['getTeacherCourseSubjectRoster']>>>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  async function showRoster(id: string) {
    setSelectedId(id);
    setRosterLoading(true);
    try { setRoster(await client.getTeacherCourseSubjectRoster(id)); }
    catch { setRoster([]); }
    finally { setRosterLoading(false); }
  }

  return <AppShell dataMode="real" session={currentSession}>
    <PageHeading description="Solo aparecen los CourseSubjects donde el servidor reconoce una asignación docente activa." title="Mis espacios de enseñanza" />
    <ContextState error={error} loading={loading} onRetry={() => void load()}>
      {items.length ? <div className="academic-context-grid">{items.map((item) => <Card className="academic-context-card" key={item.id}>
        <div className="academic-context-card__mark">{subjectName(item).slice(0, 3).toUpperCase()}</div>
        <div><h2>{subjectName(item)}</h2><p>{courseName(item)}</p><Badge tone="success">Asignado por Académico</Badge></div>
        <div className="context-card__actions"><Button onClick={() => void showRoster(item.id)} variant="secondary"><Icon name="people" />Ver roster</Button><Link className="button-link button-link--primary" href={`/docente/asignaturas/${item.id}`}>Gestionar ruta <Icon name="chevron-right" /></Link></div>
        <div className="academic-context-card__boundary"><Icon name="layers" /><span>Contenido conectado al Learning API</span></div>
        {selectedId === item.id ? <div aria-live="polite" className="academic-roster">{rosterLoading ? <Skeleton /> : roster.length ? <ul>{roster.map((entry) => <li key={entry.student.id}><span>{entry.student.firstName} {entry.student.lastName}</span><small>{entry.access.includes('DIRECT') ? 'Acceso directo' : 'Curso por defecto'}</small></li>)}</ul> : <p>Roster vacío o no disponible.</p>}</div> : null}
      </Card>)}</div> : <EmptyState icon={<Icon name="book" />} title="No tienes CourseSubjects asignados" description="Un administrador debe asignarte a un CourseSubject activo para que puedas ver estudiantes autorizados." />}
    </ContextState>
  </AppShell>;
}
