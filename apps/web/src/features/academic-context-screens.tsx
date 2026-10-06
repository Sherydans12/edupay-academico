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
import { EmptyTeacherSubjectsIllustration } from '@/components/educational-illustrations';
import { Icon } from '@/components/icons';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';
import { subjectCard } from '@/features/learning-screen-support';

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
  const [selectedCourse, setSelectedCourse] = useState<string>('ALL');
  const [page, setPage] = useState(0);

  // Cursos únicos representados para filtros rápidos en 1 clic
  const courses = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      set.add(courseName(item));
    }
    return Array.from(set).sort();
  }, [items]);

  const filtered = items.filter((item) => {
    const matchesQuery = `${subjectName(item)} ${courseName(item)}`
      .toLocaleLowerCase('es-CL')
      .includes(query.trim().toLocaleLowerCase('es-CL'));
    const matchesCourse =
      selectedCourse === 'ALL' || courseName(item) === selectedCourse;
    return matchesQuery && matchesCourse;
  });

  const pageSize = 9;
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <AppShell dataMode="real" session={currentSession}>
      {/* 1. Header Hero Educativo */}
      <section
        aria-labelledby="teacher-catalog-title"
        className="teacher-catalog-hero"
      >
        <div className="teacher-catalog-hero__main">
          <div className="teacher-catalog-hero__icon">
            <Icon name="book-open" />
          </div>
          <div className="teacher-catalog-hero__content">
            <div className="teacher-catalog-hero__tag">
              <Icon name="sparkles" />
              <span>Gestión Pedagógica</span>
            </div>
            <h1
              className="teacher-catalog-hero__title"
              id="teacher-catalog-title"
            >
              Mis asignaturas
            </h1>
            <p className="teacher-catalog-hero__desc">
              Aquí aparecen las asignaturas en las que tienes una asignación docente activa. Organiza unidades, programa contenidos y acompaña a tus estudiantes.
            </p>
          </div>
        </div>

        <div className="teacher-catalog-hero__stats">
          <div className="teacher-catalog-kpi">
            <span className="teacher-catalog-kpi__number">{items.length}</span>
            <span className="teacher-catalog-kpi__label">
              {items.length === 1 ? 'Espacio activo' : 'Espacios activos'}
            </span>
          </div>
        </div>
      </section>

      <ContextState error={error} loading={loading} onRetry={() => void load()}>
        {items.length ? (
          <>
            {/* 2. Barra de Búsqueda y Filtros */}
            <div className="teacher-catalog-controls teacher-list-controls">
              <div className="teacher-catalog-search-box">
                <Input
                  id="teacher-subject-search"
                  label="Buscar por asignatura o curso"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Escribe el nombre de una materia o nivel..."
                  type="search"
                  value={query}
                />
              </div>

              <div className="teacher-catalog-count-pill" aria-live="polite">
                <Icon name="book-open" />
                <span>
                  {filtered.length} asignatura{filtered.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Quick Course Filter Chips (si hay más de 1 curso) */}
            {courses.length > 1 ? (
              <div
                aria-label="Filtro rápido por curso"
                className="teacher-course-filters"
              >
                <button
                  className={`teacher-course-filter-btn ${
                    selectedCourse === 'ALL'
                      ? 'teacher-course-filter-btn--active'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedCourse('ALL');
                    setPage(0);
                  }}
                  type="button"
                >
                  Todos los cursos ({items.length})
                </button>
                {courses.map((course) => (
                  <button
                    className={`teacher-course-filter-btn ${
                      selectedCourse === course
                        ? 'teacher-course-filter-btn--active'
                        : ''
                    }`}
                    key={course}
                    onClick={() => {
                      setSelectedCourse(course);
                      setPage(0);
                    }}
                    type="button"
                  >
                    {course}
                  </button>
                ))}
              </div>
            ) : null}

            {/* 3. Rejilla de Asignaturas */}
            {filtered.length ? (
              <div className="academic-context-grid teacher-context-grid teacher-catalog-grid">
                {visible.map((item, index) => {
                  const cardMeta = subjectCard(
                    item,
                    page * pageSize + index,
                    'teacher',
                  );
                  const sName = subjectName(item);
                  const cName = courseName(item);

                  return (
                    <Card
                      className="academic-context-card teacher-catalog-card"
                      key={item.id}
                    >
                      <div
                        className={`teacher-subject-card__strip teacher-subject-card__strip--${cardMeta.accent}`}
                      />
                      <div className="teacher-catalog-card__body">
                        <div className="teacher-catalog-card__top">
                          <div className="teacher-catalog-card__tags">
                            <span
                              className={`teacher-subject-card__code teacher-subject-card__code--${cardMeta.accent}`}
                            >
                              {cardMeta.code}
                            </span>
                            <span className="teacher-subject-card__course">
                              {cName}
                            </span>
                          </div>
                          <Badge tone="success">Asignación activa</Badge>
                        </div>

                        <div className="teacher-catalog-card__heading-group">
                          <h2 className="teacher-catalog-card__title">
                            <Link
                              className="teacher-catalog-card__title-link"
                              href={`/docente/asignaturas/${item.id}`}
                            >
                              {sName}
                            </Link>
                          </h2>
                          <p className="teacher-catalog-card__desc">
                            {cName} · Ciclo lectivo regular
                          </p>
                        </div>

                        <div className="teacher-catalog-card__pills">
                          <span className="teacher-pill">
                            <Icon name="layers" />
                            Espacio curricular
                          </span>
                          <span className="teacher-pill">
                            <Icon name="check-circle" />
                            Activa
                          </span>
                        </div>

                        <div className="teacher-catalog-card__actions">
                          <Link
                            className="teacher-card-btn teacher-card-btn--secondary"
                            href={`/docente/asignaturas/${item.id}/estudiantes`}
                          >
                            <Icon name="people" />
                            <span>Ver estudiantes</span>
                          </Link>
                          <Link
                            className="teacher-card-btn teacher-card-btn--primary"
                            href={`/docente/asignaturas/${item.id}`}
                          >
                            <span>Gestionar asignatura</span>
                            <Icon name="arrow-right" />
                          </Link>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                action={
                  query || selectedCourse !== 'ALL' ? (
                    <Button
                      onClick={() => {
                        setQuery('');
                        setSelectedCourse('ALL');
                        setPage(0);
                      }}
                      variant="secondary"
                    >
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
                className="teacher-catalog-empty"
                description="Prueba con otra asignatura o curso."
                icon={
                  <EmptyTeacherSubjectsIllustration className="teacher-catalog-empty__illustration" />
                }
                title="Sin coincidencias"
              />
            )}

            {/* 4. Paginación y Resumen */}
            {filtered.length > pageSize ? (
              <nav
                aria-label="Páginas de asignaturas"
                className="teacher-list-pages teacher-catalog-pagination"
              >
                <Button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  variant="secondary"
                >
                  <Icon name="arrow-left" />
                  Anterior
                </Button>
                <span className="teacher-catalog-pagination__label">
                  Página {page + 1} de {Math.ceil(filtered.length / pageSize)}
                </span>
                <Button
                  disabled={(page + 1) * pageSize >= filtered.length}
                  onClick={() => setPage(page + 1)}
                  variant="secondary"
                >
                  Siguiente
                  <Icon name="arrow-right" />
                </Button>
              </nav>
            ) : null}

            <div className="teacher-catalog-footer-summary">
              <span>
                Mostrando {visible.length} de {filtered.length}{' '}
                {filtered.length === 1 ? 'asignatura' : 'asignaturas'}
                {selectedCourse !== 'ALL'
                  ? ` · Filtrado por ${selectedCourse}`
                  : ''}
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            className="teacher-catalog-empty"
            description="Cuando tengas una asignación docente activa, aparecerá aquí."
            icon={
              <EmptyTeacherSubjectsIllustration className="teacher-catalog-empty__illustration" />
            }
            title="No tienes asignaturas asignadas"
          />
        )}
      </ContextState>
    </AppShell>
  );
}
