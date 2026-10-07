'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
  Textarea,
} from '@edupay/ui';
import type {
  LearningItem,
  LearningUnitWithItems,
  Submission,
  SubmissionRevision,
} from '@edupay/contracts';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { formatFileSize } from '@/components/file-upload-queue';
import { Icon } from '@/components/icons';
import { ScrollableTabsBar } from './scrollable-tabs-bar';

export type Roster = Awaited<
  ReturnType<AcademicApiClient['getTeacherCourseSubjectRoster']>
>;

export function getTeacherRoster(
  api: AcademicApiClient,
  courseSubjectId: string,
): Promise<Roster> {
  return typeof api.getTeacherCourseSubjectRoster === 'function'
    ? api.getTeacherCourseSubjectRoster(courseSubjectId)
    : Promise.resolve([]);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function publicationLabel(status?: string): string {
  if (status === 'PUBLISHED') return 'Publicado';
  if (status === 'SCHEDULED') return 'Programado';
  if (status === 'ARCHIVED') return 'Archivado';
  return 'Borrador';
}

function publicationTone(
  status?: string,
): 'success' | 'neutral' | 'info' | 'warning' {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'SCHEDULED') return 'info';
  if (status === 'ARCHIVED') return 'warning';
  return 'neutral';
}

export function submissionStatus(status: Submission['status']) {
  if (status === 'CHANGES_REQUESTED')
    return { label: 'Cambios solicitados', tone: 'warning' as const };
  if (status === 'REVIEWED')
    return { label: 'Revisada', tone: 'success' as const };
  if (status === 'SUBMITTED')
    return { label: 'Enviada', tone: 'info' as const };
  return { label: 'Pendiente', tone: 'neutral' as const };
}

export function studentName(studentId: string, roster: Roster): string {
  const student = roster.find(
    (entry) => entry.student.id === studentId,
  )?.student;
  return student
    ? `${student.firstName} ${student.lastName}`
    : `Estudiante ${studentId.slice(0, 8)}`;
}

export function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (first && second) {
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }
  return (name.slice(0, 2) || 'ES').toUpperCase();
}

export function latestRevision(
  submission: Submission,
): SubmissionRevision | undefined {
  return submission.revisions[submission.revisions.length - 1];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function useCurrentTimestamp(): number | null {
  const [timestamp, setTimestamp] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setTimestamp(Date.now());
    const initialTimer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  return timestamp;
}

export function TeacherDeliverablesCatalog({
  items,
  units,
  roster,
  onSelectActivity,
}: {
  items: LearningItem[];
  units?: LearningUnitWithItems[] | undefined;
  roster: Roster;
  onSelectActivity: (item: LearningItem) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ASSIGNMENT' | 'ASSESSMENT'>('ALL');
  const currentTimestamp = useCurrentTimestamp();

  const unitMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!units) return map;
    for (const unit of units) {
      for (const itm of unit.items) {
        map.set(itm.id, unit.title);
      }
      map.set(unit.id, unit.title);
    }
    return map;
  }, [units]);

  const counts = useMemo(() => {
    let assignments = 0;
    let assessments = 0;
    for (const item of items) {
      if (item.type === 'ASSESSMENT') assessments++;
      else assignments++;
    }
    return {
      all: items.length,
      assessments,
      assignments,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (!query) return true;
      const titleMatch = item.title.toLowerCase().includes(query);
      const descMatch = item.description?.toLowerCase().includes(query) ?? false;
      const unitTitle = (unitMap.get(item.id) || unitMap.get(item.learningUnitId) || '').toLowerCase();
      const unitMatch = unitTitle.includes(query);
      return titleMatch || descMatch || unitMatch;
    });
  }, [items, typeFilter, search, unitMap]);

  if (!items.length) {
    return (
      <EmptyState
        description="Publica o crea actividades y evaluaciones en el plan de estudios para comenzar a recibir entregas."
        icon={<Icon name="review" />}
        title="No hay actividades con entrega para revisar"
      />
    );
  }

  return (
    <div className="teacher-deliverables-catalog">
      {/* Hero Header Card */}
      <div className="submissions-hero-card">
        <div className="submissions-hero-card__main">
          <div aria-hidden="true" className="submissions-hero-card__icon">
            <Icon name="review" />
          </div>
          <div className="submissions-hero-card__text">
            <h3>Bandeja de Entregas y Evaluaciones</h3>
            <p>
              Supervisa las tareas y evaluaciones enviadas por tus estudiantes, organiza las revisiones pendientes y realiza retroalimentación pedagógica.
            </p>
          </div>
        </div>
        <div className="submissions-hero-card__stats">
          <div className="submissions-stat-pill">
            <Icon name="file-text" />
            <span>
              <strong>{items.length}</strong> {items.length === 1 ? 'actividad evaluable' : 'actividades evaluables'}
            </span>
          </div>
          {roster.length ? (
            <div className="submissions-stat-pill">
              <Icon name="people" />
              <span>
                <strong>{roster.length}</strong> {roster.length === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Toolbar: Search and Filter Chips */}
      <div className="teacher-deliverables-toolbar">
        <div className="teacher-deliverables-search">
          <Input
            id="deliverables-search"
            label="Buscar actividad o evaluación"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por actividad o unidad…"
            type="search"
            value={search}
          />
        </div>
        <ScrollableTabsBar ariaLabel="Filtros por tipo de actividad entregable">
          <div className="teacher-deliverables-chips">
            <button
              aria-pressed={typeFilter === 'ALL'}
              className={`teacher-route-filter-chip ${typeFilter === 'ALL' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('ALL')}

              type="button"
            >
              <span>Todas</span>
              <span className="chip-badge">{counts.all}</span>
            </button>
            <button
              aria-pressed={typeFilter === 'ASSIGNMENT'}
              className={`teacher-route-filter-chip ${typeFilter === 'ASSIGNMENT' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('ASSIGNMENT')}

              type="button"
            >
              <Icon name="file-text" />
              <span>Actividades</span>
              <span className="chip-badge">{counts.assignments}</span>
            </button>
            <button
              aria-pressed={typeFilter === 'ASSESSMENT'}
              className={`teacher-route-filter-chip ${typeFilter === 'ASSESSMENT' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('ASSESSMENT')}

              type="button"
            >
              <Icon name="award" />
              <span>Evaluaciones</span>
              <span className="chip-badge">{counts.assessments}</span>
            </button>
          </div>
        </ScrollableTabsBar>
      </div>

      {/* Grid of Deliverables */}
      {filteredItems.length ? (
        <div className="teacher-deliverables-grid">
          {filteredItems.map((item) => {
            const unitTitle = unitMap.get(item.id) || unitMap.get(item.learningUnitId);
            const isPastDue =
              item.dueAt && currentTimestamp !== null
                ? new Date(item.dueAt).getTime() < currentTimestamp
                : false;
            return (
              <article className="teacher-deliverable-card" key={item.id}>
                <div
                  className={`teacher-deliverable-card__strip teacher-deliverable-card__strip--${item.type.toLowerCase()}`}
                />
                <div className="teacher-deliverable-card__content">
                  <div className="teacher-deliverable-card__header">
                    <div className="teacher-deliverable-card__top">
                      <div
                        aria-hidden="true"
                        className={`teacher-deliverable-card__icon-box teacher-deliverable-card__icon-box--${item.type.toLowerCase()}`}
                      >
                        <Icon name={item.type === 'ASSESSMENT' ? 'award' : 'file-text'} />
                      </div>
                      <div className="teacher-deliverable-card__badge-row">
                        <Badge tone={item.type === 'ASSESSMENT' ? 'creative' : 'info'}>
                          {item.type === 'ASSESSMENT' ? 'Evaluación' : 'Actividad'}
                        </Badge>
                        <Badge tone={publicationTone(item.publicationStatus)}>
                          {publicationLabel(item.publicationStatus)}
                        </Badge>
                      </div>
                    </div>
                    {unitTitle ? (
                      <div className="teacher-deliverable-card__unit-row">
                        <span className="teacher-deliverable-card__unit-chip" title={unitTitle}>
                          <Icon name="layers" />
                          <span>{unitTitle}</span>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="teacher-deliverable-card__body">
                    <h4 className="teacher-deliverable-card__title">{item.title}</h4>
                    {item.description ? (
                      <p className="teacher-deliverable-card__description">{item.description}</p>
                    ) : (
                      <p className="teacher-deliverable-card__description teacher-deliverable-card__description--empty">
                        Sin descripción adicional
                      </p>
                    )}
                  </div>

                  <div className="teacher-deliverable-card__meta">
                    <div className="teacher-deliverable-card__due">
                      <div className="teacher-deliverable-card__due-icon">
                        <Icon name="calendar" />
                      </div>
                      <div className="teacher-deliverable-card__due-text">
                        <small>Fecha límite</small>
                        <strong>{item.dueAt ? formatDate(item.dueAt) : 'Sin fecha límite'}</strong>
                      </div>
                    </div>
                    {item.dueAt ? (
                      <span
                        className={`teacher-deliverable-due-tag ${isPastDue ? 'teacher-deliverable-due-tag--past' : 'teacher-deliverable-due-tag--active'}`}
                      >
                        <Icon name={isPastDue ? 'alert-triangle' : 'clock'} />
                        <span>{isPastDue ? 'Vencida' : 'Vigente'}</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="teacher-deliverable-card__footer">
                    <Button
                      aria-label={`Ver entregas de ${item.title}`}
                      className="teacher-deliverable-card__action-btn"
                      onClick={() => onSelectActivity(item)}
                      size="md"
                      type="button"
                      variant="primary"
                    >
                      <Icon name="users" />
                      <span>Ver entregas</span>
                      <Icon className="btn-arrow" name="arrow-right" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="teacher-route-empty-filter-notice">
          <Icon name="search" />
          <p>No se encontraron actividades que coincidan con la búsqueda.</p>
          <Button
            onClick={() => {
              setSearch('');
              setTypeFilter('ALL');
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            Restablecer filtros
          </Button>
        </div>
      )}
    </div>
  );
}

export function TeacherActivitySubmissionsView({
  api,
  item,
  unitTitle,
  roster,
  onBack,
}: {
  api: AcademicApiClient;
  item: LearningItem;
  unitTitle?: string | undefined;
  roster: Roster;
  onBack: () => void;
}) {
  const currentTimestamp = useCurrentTimestamp();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED' | 'LATE' | 'UNSUBMITTED'
  >('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listSubmissions(item.id);
      setSubmissions(data);
    } catch (err) {
      setError(
        err instanceof AcademicApiError
          ? err.message
          : 'No pudimos cargar las entregas para esta actividad.',
      );
    } finally {
      setLoading(false);
    }
  }, [api, item.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Metrics
  const metrics = useMemo(() => {
    let pending = 0;
    let reviewed = 0;
    let changes = 0;
    let late = 0;
    const submittedIds = new Set<string>();

    for (const sub of submissions) {
      submittedIds.add(sub.studentId);
      if (sub.status === 'SUBMITTED') pending++;
      else if (sub.status === 'REVIEWED') reviewed++;
      else if (sub.status === 'CHANGES_REQUESTED') changes++;

      const latest = latestRevision(sub);
      if (latest?.isLate) late++;
    }

    const unsubmittedStudents = roster.filter((r) => !submittedIds.has(r.student.id));

    return {
      changes,
      late,
      pending,
      reviewed,
      submittedIds,
      total: submissions.length,
      unsubmittedCount: unsubmittedStudents.length,
      unsubmittedStudents,
    };
  }, [submissions, roster]);

  // Filtered lists
  const filteredSubmissions = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return submissions.filter((sub) => {
      // Status filtering
      if (statusFilter === 'SUBMITTED' && sub.status !== 'SUBMITTED') return false;
      if (statusFilter === 'REVIEWED' && sub.status !== 'REVIEWED') return false;
      if (statusFilter === 'CHANGES_REQUESTED' && sub.status !== 'CHANGES_REQUESTED')
        return false;
      if (statusFilter === 'LATE' && !latestRevision(sub)?.isLate) return false;

      // Student name filtering
      if (query) {
        const student = studentName(sub.studentId, roster).toLowerCase();
        if (!student.includes(query)) return false;
      }
      return true;
    });
  }, [submissions, statusFilter, studentSearch, roster]);

  const filteredUnsubmitted = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return metrics.unsubmittedStudents.filter((entry) => {
      if (!query) return true;
      const fullName = `${entry.student.firstName} ${entry.student.lastName}`.toLowerCase();
      return fullName.includes(query);
    });
  }, [metrics.unsubmittedStudents, studentSearch]);

  const isShowingUnsubmitted = statusFilter === 'UNSUBMITTED';
  const totalItems = isShowingUnsubmitted
    ? filteredUnsubmitted.length
    : filteredSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedSubmissions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, page, pageSize]);

  const paginatedUnsubmitted = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUnsubmitted.slice(start, start + pageSize);
  }, [filteredUnsubmitted, page, pageSize]);

  const isPastDue =
    item.dueAt && currentTimestamp !== null
      ? new Date(item.dueAt).getTime() < currentTimestamp
      : false;

  return (
    <div className="teacher-activity-submissions-view">
      {/* Top Nav: Back button and Breadcrumb */}
      <div className="teacher-activity-submissions-nav">
        <Button
          aria-label="Volver a actividades"
          className="teacher-activity-back-btn"
          onClick={onBack}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="arrow-left" />
          <span>Volver a actividades</span>
        </Button>
        <nav aria-label="Ruta de navegación" className="teacher-activity-breadcrumb">
          <span>Entregas</span>
          <span className="teacher-activity-breadcrumb-sep">/</span>
          {unitTitle ? (
            <>
              <span>{unitTitle}</span>
              <span className="teacher-activity-breadcrumb-sep">/</span>
            </>
          ) : null}
          <strong className="teacher-activity-breadcrumb-current">{item.title}</strong>
        </nav>
      </div>

      {/* Header Banner */}
      <div className="teacher-activity-submissions-banner">
        <div className={`teacher-activity-submissions-banner__strip teacher-activity-submissions-banner__strip--${item.type.toLowerCase()}`} />
        <div className="teacher-activity-submissions-banner__content">
          <div className="teacher-activity-submissions-banner__info">
            <div aria-hidden="true" className={`teacher-activity-submissions-banner__icon teacher-activity-submissions-banner__icon--${item.type.toLowerCase()}`}>
              <Icon name={item.type === 'ASSESSMENT' ? 'award' : 'file-text'} />
            </div>
            <div className="teacher-activity-submissions-banner__text">
              <h2>{item.title}</h2>
              <div className="teacher-activity-submissions-banner__pills">
                <Badge tone={item.type === 'ASSESSMENT' ? 'creative' : 'info'}>
                  <Icon name={item.type === 'ASSESSMENT' ? 'award' : 'file-text'} />
                  {item.type === 'ASSESSMENT' ? 'Evaluación' : 'Actividad'}
                </Badge>
                {unitTitle ? (
                  <span className="teacher-deliverable-card__unit-chip">
                    <Icon name="layers" />
                    <span>{unitTitle}</span>
                  </span>
                ) : null}
                <Badge tone={publicationTone(item.publicationStatus)}>
                  {publicationLabel(item.publicationStatus)}
                </Badge>
                <span className="teacher-deliverable-card__due">
                  <Icon name="calendar" />
                  <span>{item.dueAt ? `Plazo: ${formatDate(item.dueAt)}` : 'Sin fecha límite'}</span>
                  {item.dueAt ? (
                    <span
                      className={`teacher-deliverable-due-tag ${isPastDue ? 'teacher-deliverable-due-tag--past' : 'teacher-deliverable-due-tag--active'}`}
                    >
                      {isPastDue ? 'Vencida' : 'Vigente'}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="teacher-activity-kpis">
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--total">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="file-text" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.total}</span>
            <span className="teacher-activity-kpi-card__label">Total entregas</span>
          </div>
        </div>
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--pending">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="clock" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.pending}</span>
            <span className="teacher-activity-kpi-card__label">Por revisar</span>
          </div>
        </div>
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--reviewed">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="check-circle" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.reviewed}</span>
            <span className="teacher-activity-kpi-card__label">Revisadas</span>
          </div>
        </div>
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--changes">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="alert-circle" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.changes}</span>
            <span className="teacher-activity-kpi-card__label">Con cambios</span>
          </div>
        </div>
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--late">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="clock" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.late}</span>
            <span className="teacher-activity-kpi-card__label">Atrasadas</span>
          </div>
        </div>
        <div className="teacher-activity-kpi-card teacher-activity-kpi-card--unsubmitted">
          <div aria-hidden="true" className="teacher-activity-kpi-card__icon">
            <Icon name="people" />
          </div>
          <div className="teacher-activity-kpi-card__content">
            <span className="teacher-activity-kpi-card__value">{metrics.unsubmittedCount}</span>
            <span className="teacher-activity-kpi-card__label">Sin entrega aún</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="teacher-submissions-controls">
        <div className="teacher-submissions-controls__search">
          <Input
            id="student-submission-search"
            label="Buscar estudiante"
            onChange={(e) => {
              setStudentSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar estudiante por nombre…"
            type="search"
            value={studentSearch}
          />
        </div>
        <ScrollableTabsBar ariaLabel="Filtros por estado de revisión de entregas">
          <div className="teacher-submissions-controls__chips">
            <button
              aria-pressed={statusFilter === 'ALL'}
              className={`teacher-route-filter-chip ${statusFilter === 'ALL' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('ALL');
                setPage(1);
              }}

              type="button"
            >
              <span>Todas</span>
              <span className="chip-badge">{metrics.total}</span>
            </button>
            <button
              aria-pressed={statusFilter === 'SUBMITTED'}
              className={`teacher-route-filter-chip ${statusFilter === 'SUBMITTED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('SUBMITTED');
                setPage(1);
              }}

              type="button"
            >
              <Icon name="clock" />
              <span>Por revisar</span>
              <span className="chip-badge">{metrics.pending}</span>
            </button>
            <button
              aria-pressed={statusFilter === 'REVIEWED'}
              className={`teacher-route-filter-chip ${statusFilter === 'REVIEWED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('REVIEWED');
                setPage(1);
              }}

              type="button"
            >
              <Icon name="check-circle" />
              <span>Revisadas</span>
              <span className="chip-badge">{metrics.reviewed}</span>
            </button>
            <button
              aria-pressed={statusFilter === 'CHANGES_REQUESTED'}
              className={`teacher-route-filter-chip ${statusFilter === 'CHANGES_REQUESTED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('CHANGES_REQUESTED');
                setPage(1);
              }}

              type="button"
            >
              <Icon name="alert-circle" />
              <span>Con cambios</span>
              <span className="chip-badge">{metrics.changes}</span>
            </button>
            <button
              aria-pressed={statusFilter === 'LATE'}
              className={`teacher-route-filter-chip ${statusFilter === 'LATE' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('LATE');
                setPage(1);
              }}

              type="button"
            >
              <Icon name="clock" />
              <span>Atrasadas</span>
              <span className="chip-badge">{metrics.late}</span>
            </button>
            <button
              aria-pressed={statusFilter === 'UNSUBMITTED'}
              className={`teacher-route-filter-chip ${statusFilter === 'UNSUBMITTED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => {
                setStatusFilter('UNSUBMITTED');
                setPage(1);
              }}

              type="button"
            >
              <Icon name="people" />
              <span>Sin entrega</span>
              <span className="chip-badge">{metrics.unsubmittedCount}</span>
            </button>
          </div>
        </ScrollableTabsBar>
      </div>

      {/* Submissions List */}
      <section
        aria-labelledby={`submissions-${item.id}`}
        className="submission-list submission-list--panel"
      >
        {loading ? (
          <div className="academic-loading">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : error ? (
          <Alert
            action={
              <Button onClick={() => void load()} variant="secondary">
                Reintentar
              </Button>
            }
            title="No pudimos cargar las entregas"
            tone="error"
          >
            {error}
          </Alert>
        ) : isShowingUnsubmitted ? (
          filteredUnsubmitted.length ? (
            <div className="submission-rows-container">
              {paginatedUnsubmitted.map((entry) => {
                const fullName = `${entry.student.firstName} ${entry.student.lastName}`;
                const initials = studentInitials(fullName);
                return (
                  <div
                    className="submission-row submission-row--teacher submission-row--unsubmitted"
                    key={entry.student.id}
                  >
                    <div className="submission-row__top-group">
                      <span aria-hidden="true" className="submission-row__avatar">
                        {initials}
                      </span>
                      <span className="submission-row__main">
                        <strong>{fullName}</strong>
                        <small>Estudiante matriculado en la asignatura</small>
                      </span>
                    </div>
                    <div className="submission-row__status-group">
                      <span className="submission-time">
                        <small style={{ color: 'var(--text-tertiary)' }}>Sin entrega registrada</small>
                      </span>
                      <Badge tone="neutral">Sin entrega aún</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              description={
                studentSearch
                  ? 'No hay estudiantes sin entrega que coincidan con la búsqueda.'
                  : '¡Excelente! Todos los estudiantes matriculados ya han realizado su entrega.'
              }
              icon={<Icon name="check-circle" />}
              title="Sin estudiantes pendientes"
            />
          )
        ) : filteredSubmissions.length ? (
          <div className="submission-rows-container">
            {paginatedSubmissions.map((submission) => {
              const latest = latestRevision(submission);
              const status = submissionStatus(submission.status);
              const student = studentName(submission.studentId, roster);
              const initials = studentInitials(student);
              return (
                <div className="submission-row submission-row--teacher" key={submission.id}>
                  <div className="submission-row__top-group">
                    <span aria-hidden="true" className="submission-row__avatar">
                      {initials}
                    </span>
                    <span className="submission-row__main">
                      <strong>{student}</strong>
                      <small>
                        Revisión {latest?.revisionNumber ?? '—'} ·{' '}
                        {latest ? formatDate(latest.submittedAt) : 'Sin fecha'}
                      </small>
                    </span>
                  </div>
                  <div className="submission-row__status-group">
                    <span className="submission-time">
                      {latest?.isLate ? (
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
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <Link
                    aria-label={`Revisar entrega de ${student}`}
                    className="ui-button ui-button--primary ui-button--sm submission-row__review-btn"
                    href={`/docente/revisiones/${submission.id}`}
                  >
                    <Icon name="review" />
                    <span>Revisar entrega</span>
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            description={
              studentSearch || statusFilter !== 'ALL'
                ? 'No se encontraron entregas que coincidan con los filtros aplicados.'
                : 'Las entregas de los estudiantes aparecerán aquí conforme sean enviadas.'
            }
            icon={<Icon name="review" />}
            title={
              studentSearch || statusFilter !== 'ALL'
                ? 'Sin coincidencias'
                : 'Sin entregas todavía'
            }
          />
        )}

        {/* Pagination bar */}
        {totalItems > pageSize ? (
          <div className="teacher-submissions-pagination">
            <span className="teacher-submissions-pagination__info">
              Mostrando {(page - 1) * pageSize + 1} -{' '}
              {Math.min(page * pageSize, totalItems)} de {totalItems} estudiantes
            </span>
            <div className="teacher-submissions-pagination__actions">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="chevron-left" />
                <span>Anterior</span>
              </Button>
              <span className="teacher-submissions-pagination__info">
                Página {page} de {totalPages}
              </span>
              <Button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                size="sm"
                type="button"
                variant="secondary"
              >
                <span>Siguiente</span>
                <Icon name="chevron-right" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TeacherSubmissionList({
  api,
  item,
  roster,
}: {
  api: AcademicApiClient;
  item: LearningItem;
  roster: Roster;
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubmissions(await api.listSubmissions(item.id));
    } catch (nextError) {
      setError(
        nextError instanceof AcademicApiError
          ? nextError.message
          : 'No pudimos cargar las entregas.',
      );
    } finally {
      setLoading(false);
    }
  }, [api, item.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <section
      aria-labelledby={`submissions-${item.id}`}
      className="submission-list submission-list--panel"
    >
      <div className="submission-list__heading">
        <div>
          <h3 id={`submissions-${item.id}`}>{item.title}</h3>
          <p>Vista de entregas autorizadas para este contenido.</p>
        </div>
        <Badge tone="info">
          {submissions.length} entrega{submissions.length === 1 ? '' : 's'}
        </Badge>
      </div>
      {loading ? (
        <div className="academic-loading">
          <Skeleton />
          <Skeleton />
        </div>
      ) : error ? (
        <Alert
          action={
            <Button onClick={() => void load()} variant="secondary">
              Reintentar
            </Button>
          }
          title="No pudimos cargar las entregas"
          tone="error"
        >
          {error}
        </Alert>
      ) : submissions.length ? (
        <div className="submission-rows-container">
          {submissions.map((submission) => {
            const latest = latestRevision(submission);
            const status = submissionStatus(submission.status);
            const student = studentName(submission.studentId, roster);
            return (
              <div className="submission-row submission-row--teacher submission-row--interactive" key={submission.id}>
                <div className="submission-row__top-group">
                  <span className="submission-row__avatar" aria-hidden="true">
                    {studentInitials(student)}
                  </span>
                  <div className="submission-row__main">
                    <strong>{student}</strong>
                    <small>
                      Revisión {latest?.revisionNumber ?? '—'} ·{' '}
                      {latest ? formatDate(latest.submittedAt) : 'Sin envío'}
                    </small>
                  </div>
                </div>
                <div className="submission-row__status-group">
                  <span className="submission-time">
                    {latest?.isLate ? (
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
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <Link
                  aria-label={`Revisar entrega de ${student}`}
                  className="ui-button ui-button--primary ui-button--sm submission-row__review-btn"
                  href={`/docente/revisiones/${submission.id}`}
                >
                  <Icon name="review" />
                  <span>Revisar entrega</span>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          description="Las entregas de los estudiantes aparecerán aquí cuando sean enviadas."
          icon={<Icon name="review" />}
          title="Sin entregas todavía"
        />
      )}
    </section>
  );
}

export function TeacherSubmissionQueue({
  api,
  items,
  courseSubjectId,
  units,
  mode = 'catalog',
  initialSelectedItemId,
}: {
  api: AcademicApiClient;
  items: LearningItem[];
  courseSubjectId: string;
  units?: LearningUnitWithItems[] | undefined;
  mode?: 'catalog' | 'stack' | undefined;
  initialSelectedItemId?: string | null | undefined;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialSelectedItemId ?? null,
  );
  const [roster, setRoster] = useState<Roster>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialSelectedItemId) return;
    const timer = window.setTimeout(
      () => setSelectedItemId(initialSelectedItemId),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [initialSelectedItemId]);

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      setError('');
      setLoading(true);
      void getTeacherRoster(api, courseSubjectId)
        .then((nextRoster) => {
          if (mounted) setRoster(nextRoster);
        })
        .catch((nextError) => {
          if (mounted) {
            setRoster([]);
            setError(
              nextError instanceof AcademicApiError
                ? nextError.message
                : 'No pudimos cargar la lista de estudiantes.',
            );
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 0);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [api, courseSubjectId]);

  if (!items.length) {
    return (
      <EmptyState
        description="Publica una actividad o evaluación para recibir entregas."
        icon={<Icon name="review" />}
        title="No hay actividades para revisar"
      />
    );
  }

  if (loading) {
    return (
      <div
        aria-label="Cargando estudiantes autorizados"
        className="academic-loading"
      >
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Alert title="No pudimos cargar la lista de estudiantes" tone="error">
        {error}
      </Alert>
    );
  }

  if (mode === 'stack') {
    return (
      <div className="teacher-submissions-stack">
        {items.map((item) => (
          <TeacherSubmissionList
            api={api}
            item={item}
            key={item.id}
            roster={roster}
          />
        ))}
      </div>
    );
  }

  const selectedItem = selectedItemId ? items.find((i) => i.id === selectedItemId) : null;
  const unitForSelectedItem = selectedItem && units
    ? units.find((u) => u.items.some((i) => i.id === selectedItem.id) || u.id === selectedItem.learningUnitId)?.title
    : undefined;

  if (selectedItem) {
    return (
      <TeacherActivitySubmissionsView
        api={api}
        item={selectedItem}
        onBack={() => setSelectedItemId(null)}
        roster={roster}
        unitTitle={unitForSelectedItem}
      />
    );
  }

  return (
    <TeacherDeliverablesCatalog
      items={items}
      onSelectActivity={(item) => setSelectedItemId(item.id)}
      roster={roster}
      units={units}
    />
  );
}

function reviewLabel(
  action: SubmissionRevision['reviews'][number]['action'],
): string {
  if (action === 'REVIEWED') return 'Revisión completada';
  if (action === 'CHANGES_REQUESTED') return 'Cambios solicitados';
  return 'Comentario';
}

export function TeacherSubmissionDetail({
  api,
  submissionId,
}: {
  api: AcademicApiClient;
  submissionId: string | undefined;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [item, setItem] = useState<LearningItem | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [activitySubmissions, setActivitySubmissions] = useState<Submission[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const loadRequestId = useRef(0);
  const [loadedSubmissionId, setLoadedSubmissionId] = useState<
    string | undefined
  >();
  const submissionIdRef = useRef(submissionId);

  useLayoutEffect(() => {
    submissionIdRef.current = submissionId;
  }, [submissionId]);

  useEffect(() => {
    const requestId = ++loadRequestId.current;
    const isCurrentRequest = () => loadRequestId.current === requestId;
    if (!submissionId) return;

    void (async () => {
      try {
        const nextSubmission = await api.getSubmission(submissionId);
        const nextItem = await api.getLearningItem(nextSubmission.learningItemId);
        const [nextRoster, siblings] = await Promise.all([
          getTeacherRoster(api, nextItem.courseSubjectId).catch(() => []),
          typeof api.listSubmissions === 'function'
            ? api.listSubmissions(nextItem.id).catch(() => [])
            : Promise.resolve([] as Submission[]),
        ]);
        if (!isCurrentRequest()) return;
        setSubmission(nextSubmission);
        setItem(nextItem);
        setRoster(nextRoster);
        setActivitySubmissions(siblings);
        setSelectedRevisionId(
          nextSubmission.revisions[nextSubmission.revisions.length - 1]?.id ?? '',
        );
        setComment('');
        setError('');
        setSuccess('');
        setSaving(false);
        setLoadedSubmissionId(submissionId);
      } catch (nextError) {
        if (!isCurrentRequest()) return;
        setSubmission(null);
        setItem(null);
        setRoster([]);
        setActivitySubmissions([]);
        setSelectedRevisionId('');
        setComment('');
        setSaving(false);
        setError(
          nextError instanceof AcademicApiError && nextError.status === 404
            ? 'La entrega no está disponible para tu sesión.'
            : 'No pudimos cargar esta entrega.',
        );
        setLoadedSubmissionId(submissionId);
      } finally {
        if (isCurrentRequest()) setLoading(false);
      }
    })();

    return () => {
      loadRequestId.current += 1;
    };
  }, [api, submissionId]);

  useEffect(() => {
    if (!comment.trim()) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [comment]);

  useEffect(() => {
    const protectPendingReview = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        target.origin === current.origin &&
        target.pathname === current.pathname &&
        target.search === current.search &&
        target.hash
      ) return;

      if (saving) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        comment.trim() &&
        !window.confirm('Tienes un comentario sin enviar. ¿Salir y descartarlo?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', protectPendingReview, true);
    return () => document.removeEventListener('click', protectPendingReview, true);
  }, [comment, saving]);

  async function review(
    action: 'COMMENTED' | 'REVIEWED' | 'CHANGES_REQUESTED',
  ) {
    if (!selectedRevisionId) return;
    const targetSubmissionId = submissionId;
    const targetLoadRequestId = loadRequestId.current;
    const targetRevisionId = selectedRevisionId;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const nextSubmission = await api.reviewSubmissionRevision(
        targetRevisionId,
        { action, comment: comment.trim() || undefined },
      );
      if (
        submissionIdRef.current !== targetSubmissionId ||
        loadRequestId.current !== targetLoadRequestId
      ) return;
      setSubmission(nextSubmission);
      setComment('');
      setSuccess(
        action === 'COMMENTED'
          ? 'Comentario agregado sin cambiar el estado de la entrega.'
          : action === 'REVIEWED'
            ? 'La revisión quedó marcada como completada.'
            : 'Se solicitaron cambios al estudiante.',
      );
    } catch (nextError) {
      if (
        submissionIdRef.current !== targetSubmissionId ||
        loadRequestId.current !== targetLoadRequestId
      ) return;
      setError(
        nextError instanceof AcademicApiError
          ? nextError.message
          : 'No pudimos guardar la revisión.',
      );
    } finally {
      if (
        submissionIdRef.current === targetSubmissionId &&
        loadRequestId.current === targetLoadRequestId
      ) setSaving(false);
    }
  }

  async function download(fileId: string, filename: string) {
    try {
      const response = await api.downloadFile(fileId);
      downloadBlob(response.blob, response.filename ?? filename);
    } catch {
      setError('No pudimos descargar este archivo. Inténtalo nuevamente.');
    }
  }

  const selectedRevision = submission
    ? (submission.revisions.find(
        (revision) => revision.id === selectedRevisionId,
      ) ?? latestRevision(submission))
    : undefined;
  const status = submission ? submissionStatus(submission.status) : null;
  if (!submissionId || loading || loadedSubmissionId !== submissionId)
    return (
      !submissionId ? (
        <EmptyState
          icon={<Icon name="review" />}
          title="Entrega no disponible"
          description="Selecciona una entrega autorizada para revisar."
        />
      ) : (
        <div aria-label="Cargando entrega" className="academic-loading">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )
    );
  if (!submission || !item)
    return (
      <EmptyState
        icon={<Icon name="review" />}
        title="Entrega no disponible"
        description={error || 'Selecciona una entrega autorizada para revisar.'}
      />
    );

  const studentFullName = studentName(submission.studentId, roster);
  const currentSubIndex = activitySubmissions.findIndex((s) => s.id === submission.id);
  const prevSub = currentSubIndex > 0 ? activitySubmissions[currentSubIndex - 1] : null;
  const nextSub =
    currentSubIndex >= 0 && currentSubIndex < activitySubmissions.length - 1
      ? activitySubmissions[currentSubIndex + 1]
      : null;

  return (
    <div className="teacher-submission-view">
      {/* Top Navigation & Breadcrumbs */}
      <div className="teacher-submission-nav">
        <div className="teacher-submission-nav__actions">
          <Link
            className="ui-button ui-button--secondary ui-button--sm teacher-submission-back-btn"
            href={
              item.courseSubjectId
                ? `/docente/asignaturas/${item.courseSubjectId}`
                : '/docente/revisiones'
            }
          >
            <Icon name="arrow-left" />
            <span>Volver a entregas</span>
          </Link>
          <Link
            className="ui-button ui-button--secondary ui-button--sm teacher-submission-all-reviews-btn"
            href="/docente/revisiones"
          >
            <Icon name="review" />
            <span>Bandeja de revisiones</span>
          </Link>
        </div>

        {activitySubmissions.length > 1 ? (
          <div className="teacher-submission-pager">
            {prevSub ? (
              <Link
                aria-label="Entrega anterior"
                className="ui-button ui-button--secondary ui-button--sm teacher-submission-pager__btn"
                href={`/docente/revisiones/${prevSub.id}`}
                title={`Entrega anterior: ${studentName(prevSub.studentId, roster)}`}
              >
                <Icon name="chevron-left" />
                <span className="teacher-submission-pager__label">Anterior</span>
              </Link>
            ) : (
              <span className="teacher-submission-pager__disabled">
                <Icon name="chevron-left" />
                <span className="teacher-submission-pager__label">Anterior</span>
              </span>
            )}
            <span className="teacher-submission-pager__counter">
              {currentSubIndex + 1} de {activitySubmissions.length}
            </span>
            {nextSub ? (
              <Link
                aria-label="Siguiente entrega"
                className="ui-button ui-button--secondary ui-button--sm teacher-submission-pager__btn"
                href={`/docente/revisiones/${nextSub.id}`}
                title={`Siguiente entrega: ${studentName(nextSub.studentId, roster)}`}
              >
                <span className="teacher-submission-pager__label">Siguiente</span>
                <Icon name="chevron-right" />
              </Link>
            ) : (
              <span className="teacher-submission-pager__disabled">
                <span className="teacher-submission-pager__label">Siguiente</span>
                <Icon name="chevron-right" />
              </span>
            )}
          </div>
        ) : null}

        <nav aria-label="Ruta de navegación" className="teacher-submission-breadcrumb">
          <span>Entregas</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-truncate" title={item.title}>
            {item.title}
          </span>
          <span className="breadcrumb-sep">/</span>
          <strong className="breadcrumb-current">{studentFullName}</strong>
        </nav>
      </div>

      {/* Signature Hero Banner */}
      <div className="teacher-submission-hero">
        <div
          className={`teacher-submission-hero__strip teacher-submission-hero__strip--${item.type.toLowerCase()}`}
        />
        <div className="teacher-submission-hero__content">
          <div aria-hidden="true" className="teacher-submission-hero__avatar">
            {studentInitials(studentFullName)}
          </div>
          <div className="teacher-submission-hero__info">
            <div className="teacher-submission-hero__title-row">
              <h2>{studentFullName}</h2>
              <Badge tone={status?.tone ?? 'info'}>{status?.label}</Badge>
            </div>
            <p className="teacher-submission-hero__activity">
              <Icon name={item.type === 'ASSESSMENT' ? 'award' : 'file-text'} />
              <span>{item.title}</span>
            </p>
            <div className="teacher-submission-hero__pills">
              <Badge tone={item.type === 'ASSESSMENT' ? 'creative' : 'info'}>
                {item.type === 'ASSESSMENT' ? 'Evaluación' : 'Actividad'}
              </Badge>
              {selectedRevision?.isLate ? (
                <Badge tone="warning">
                  <Icon name="clock" /> Atrasada
                </Badge>
              ) : (
                <Badge tone="success">
                  <Icon name="check" /> A tiempo
                </Badge>
              )}
              <span className="teacher-submission-hero__rev-chip">
                <Icon name="history" />
                <span>
                  Revisión {selectedRevision?.revisionNumber ?? 1} de {submission.revisions.length}
                </span>
              </span>
              {item.dueAt ? (
                <span className="teacher-submission-hero__due-chip">
                  <Icon name="calendar" />
                  <span>Plazo: {formatDate(item.dueAt)}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="review-layout">
        <section className="review-history-panel" id="review-history-panel">
          <div className="section-heading">
            <div>
              <h2>Historial completo</h2>
              <p>
                {item.title} · {studentFullName}
              </p>
            </div>
            <Badge tone={status?.tone ?? 'info'}>{status?.label}</Badge>
          </div>
          {error ? (
            <Alert title="No se pudo completar la acción" tone="error">
              {error}
            </Alert>
          ) : null}
          {success ? (
            <Alert title="Revisión guardada" tone="success">
              {success}
            </Alert>
          ) : null}
          <div className="revision-list">
            {submission.revisions.map((revision) => {
              const isSelected = revision.id === selectedRevision?.id;
              return (
                <article
                  className={`revision-card${isSelected ? ' revision-card--selected' : ''}${revision.isLate ? ' revision-card--late' : ''}`}
                  key={revision.id}
                >
                  <header className="revision-card__header">
                    <button
                      className="revision-select"
                      onClick={() => setSelectedRevisionId(revision.id)}
                      type="button"
                    >
                      <div className="revision-select__top">
                        <span className="revision-badge">
                          Revisión {revision.revisionNumber}
                        </span>
                        {isSelected ? (
                          <span className="revision-selected-indicator">
                            <Icon name="check" /> Seleccionada
                          </span>
                        ) : (
                          <span className="revision-click-hint">
                            Clic para seleccionar
                          </span>
                        )}
                      </div>
                      <span className="revision-select__date">
                        <Icon name="calendar" />
                        Enviada el {formatDate(revision.submittedAt)} · Plazo efectivo {formatDate(revision.effectiveDueAt)}
                      </span>
                    </button>
                    <Badge tone={revision.isLate ? 'warning' : 'success'}>
                      <Icon name={revision.isLate ? 'clock' : 'check'} />
                      {revision.isLate ? 'Atrasada' : 'A tiempo'}
                    </Badge>
                  </header>

                  {revision.studentComment ? (
                    <div className="revision-comment">
                      <div className="revision-comment__header">
                        <Icon name="message" />
                        <strong>Comentario del estudiante</strong>
                      </div>
                      <p className="revision-comment__body">“{revision.studentComment}”</p>
                    </div>
                  ) : null}

                  <div className="revision-files">
                    <div className="revision-files__title">
                      <Icon name="file-text" />
                      <strong>Archivos adjuntos ({revision.files.length})</strong>
                    </div>
                    <div className="revision-files__grid">
                      {revision.files.map((file) => (
                        <div className="revision-file-card" key={file.id}>
                          <div className="revision-file-card__icon" aria-hidden="true">
                            <Icon name="file-text" />
                          </div>
                          <div className="revision-file-card__info">
                            <span className="revision-file-card__name" title={file.originalFilename}>
                              {file.originalFilename}
                            </span>
                            <span className="revision-file-card__size">
                              {formatFileSize(file.sizeBytes)}
                            </span>
                          </div>
                          <Button
                            aria-label={`Descargar ${file.originalFilename}`}
                            className="revision-file-card__download-btn"
                            onClick={() =>
                              void download(file.id, file.originalFilename)
                            }
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            <Icon name="download" />
                            <span>Descargar</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {revision.reviews.length ? (
                    <div className="revision-reviews">
                      <div className="revision-reviews__title">
                        <Icon name="history" />
                        <strong>Historial de revisiones del docente</strong>
                      </div>
                      <div className="revision-reviews__timeline">
                        {revision.reviews.map((reviewEntry) => (
                          <div className="review-entry" key={reviewEntry.id}>
                            <div className="review-entry__badge-date">
                              <Badge
                                tone={
                                  reviewEntry.action === 'CHANGES_REQUESTED'
                                    ? 'warning'
                                    : reviewEntry.action === 'REVIEWED'
                                      ? 'success'
                                      : 'info'
                                }
                              >
                                {reviewLabel(reviewEntry.action)}
                              </Badge>
                              <small>
                                <Icon name="clock" />
                                {formatDate(reviewEntry.createdAt)}
                              </small>
                            </div>
                            <div className="review-entry__comment">
                              {reviewEntry.comment ?? 'Sin comentario adicional.'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <a
            className="teacher-review-mobile-jump-btn"
            href="#teacher-review-panel"
          >
            <Icon name="review" />
            <span>Revisar y retroalimentar esta entrega ↓</span>
          </a>
        </section>

        <aside className="review-panel" id="teacher-review-panel">
          <div className="review-panel__header">
            <div className="review-panel__icon-box" aria-hidden="true">
              <Icon name="review" />
            </div>
            <div>
              <h3>Revisión</h3>
              <p>Revisión {selectedRevision?.revisionNumber ?? '—'} · {status?.label}</p>
            </div>
          </div>

          {submission.status === 'REVIEWED' ? (
            <div className="review-panel__status-banner review-panel__status-banner--reviewed">
              <Icon name="check-circle" />
              <div>
                <strong>Entrega completada</strong>
                <p>Esta entrega ya fue marcada como revisada. Puedes añadir comentarios de seguimiento si es necesario.</p>
              </div>
            </div>
          ) : submission.status === 'CHANGES_REQUESTED' ? (
            <div className="review-panel__status-banner review-panel__status-banner--changes">
              <Icon name="alert-triangle" />
              <div>
                <strong>Cambios solicitados</strong>
                <p>Se ha pedido una nueva versión corregida al estudiante. Si lo necesitas, puedes agregar más indicaciones.</p>
              </div>
            </div>
          ) : (
            <div className="review-panel__status-banner review-panel__status-banner--pending">
              <Icon name="clock" />
              <div>
                <strong>Pendiente de revisión</strong>
                <p>Examina los archivos adjuntos y selecciona la acción correspondiente para completar la revisión.</p>
              </div>
            </div>
          )}

          <div className="review-panel__form-group">
            <Textarea
              id="teacher-review-comment"
              label="Comentario para el estudiante"
              onChange={(event) => setComment(event.target.value)}
              placeholder="Escribe una orientación constructiva, observaciones o sugerencias concretas para el estudiante…"
              value={comment}
            />
            {comment.trim() ? (
              <p className="form-hint" role="status">
                Comentario sin enviar. Si navegas a otra entrega, se te pedirá
                confirmación antes de descartarlo.
              </p>
            ) : null}
          </div>

          <div className="review-actions">
            <Button
              className="review-actions__btn-primary"
              disabled={submission.status !== 'SUBMITTED' || saving}
              loading={saving}
              onClick={() => void review('REVIEWED')}
              type="button"
              variant="primary"
            >
              <Icon name="check" />
              <span>Marcar revisada</span>
            </Button>
            <div className="review-actions__secondary-row">
              <Button
                className="review-action--changes"
                disabled={submission.status !== 'SUBMITTED' || saving}
                loading={saving}
                onClick={() => void review('CHANGES_REQUESTED')}
                type="button"
                variant="accent"
              >
                <Icon name="review" />
                <span>Solicitar cambios</span>
              </Button>
              <Button
                disabled={!comment.trim() || saving}
                loading={saving}
                onClick={() => void review('COMMENTED')}
                type="button"
                variant="secondary"
              >
                <Icon name="message" />
                <span>Comentar</span>
              </Button>
            </div>
          </div>
          <p className="integration-note">
            <Icon name="layers" />
            <span>
              “Marcar revisada” y “Solicitar cambios” actualizan el estado oficial de la entrega. “Comentar” solo añade una entrada al historial de retroalimentación.
            </span>
          </p>
          <a
            className="teacher-review-mobile-jump-up-btn"
            href="#review-history-panel"
          >
            <Icon name="arrow-up" />
            <span>Volver a ver archivos adjuntos ↑</span>
          </a>
        </aside>
      </div>
    </div>
  );
}
