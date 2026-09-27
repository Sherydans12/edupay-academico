'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
} from '@edupay/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

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

function contextError(error: unknown) {
  if (error instanceof AcademicApiError && error.status === 401)
    return { title: 'Sesión no disponible', body: error.message };
  if (error instanceof AcademicApiError && error.status === 403)
    return {
      title: 'Acceso no autorizado',
      body: 'El servidor no encontró una relación académica activa que permita ver esta información.',
    };
  if (error instanceof AcademicApiError && error.status === 404)
    return {
      title: 'Registro no encontrado',
      body: 'Este espacio ya no está disponible.',
    };
  return {
    title: 'No pudimos cargar tus asignaturas',
    body: 'Revisa tu conexión e inténtalo nuevamente.',
  };
}

function useContextSubjects(
  api: AcademicApiClient,
  role: 'student' | 'teacher',
) {
  const [items, setItems] = useState<
    Awaited<ReturnType<AcademicApiClient['getStudentContextSubjects']>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(
        await (role === 'student'
          ? api.getStudentContextSubjects()
          : api.getTeacherContextSubjects()),
      );
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, role]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { error, items, load, loading };
}

function ContextState({
  children,
  error,
  loading,
  onRetry,
}: {
  children: ReactNode;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div aria-label="Cargando asignaturas" className="academic-loading">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (error) {
    const copy = contextError(error);
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
  return children;
}

function subjectName(item: {
  subject?: { name: string } | undefined;
  subjectId: string;
}) {
  return item.subject?.name ?? `Asignatura ${item.subjectId.slice(0, 8)}`;
}

function courseName(item: {
  course?: { label: string } | undefined;
  courseId: string;
}) {
  return item.course?.label ?? `Curso ${item.courseId.slice(0, 8)}`;
}

export function TeacherAcademicSubjectsScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { error, items, load, loading } = useContextSubjects(client, 'teacher');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = items.filter((item) =>
    `${subjectName(item)} ${courseName(item)}`
      .toLocaleLowerCase('es-CL')
      .includes(query.trim().toLocaleLowerCase('es-CL')),
  );
  const pageSize = 12;
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Aquí aparecen las asignaturas en las que tienes una asignación docente activa."
        title="Mis espacios de enseñanza"
      />
      <ContextState error={error} loading={loading} onRetry={() => void load()}>
        {items.length ? (
          <>
            <div className="teacher-list-controls">
              <Input
                id="teacher-subject-search"
                label="Buscar por asignatura o curso"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                type="search"
                value={query}
              />
              <span aria-live="polite">
                {filtered.length} asignatura{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
            {filtered.length ? (
              <div className="academic-context-grid teacher-context-grid">
                {visible.map((item) => (
                  <Card className="academic-context-card" key={item.id}>
                    <div className="academic-context-card__mark">
                      {subjectName(item).slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <h2>{subjectName(item)}</h2>
                      <p>{courseName(item)}</p>
                      <Badge tone="success">Asignación activa</Badge>
                    </div>
                    <div className="context-card__actions">
                      <Link
                        className="button-link button-link--secondary"
                        href={`/docente/asignaturas/${item.id}/estudiantes`}
                      >
                        <Icon name="people" />
                        Ver estudiantes
                      </Link>
                      <Link
                        className="button-link button-link--primary"
                        href={`/docente/asignaturas/${item.id}`}
                      >
                        Abrir espacio <Icon name="chevron-right" />
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Icon name="book" />}
                title="Sin coincidencias"
                description="Prueba con otra asignatura o curso."
              />
            )}
            {filtered.length > pageSize ? (
              <nav
                aria-label="Páginas de asignaturas"
                className="teacher-list-pages"
              >
                <Button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  variant="secondary"
                >
                  Anterior
                </Button>
                <span>
                  Página {page + 1} de {Math.ceil(filtered.length / pageSize)}
                </span>
                <Button
                  disabled={(page + 1) * pageSize >= filtered.length}
                  onClick={() => setPage(page + 1)}
                  variant="secondary"
                >
                  Siguiente
                </Button>
              </nav>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<Icon name="book" />}
            title="No tienes asignaturas asignadas"
            description="Cuando tengas una asignación docente activa, aparecerá aquí."
          />
        )}
      </ContextState>
    </AppShell>
  );
}
