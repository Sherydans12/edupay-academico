'use client';

import { Alert, Badge, Button, Skeleton } from '@edupay/ui';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';

import {
  errorMessage,
  formatBytes,
  statusLabel,
  type AdminData,
} from './shared';
import {
  formatYearRange,
  yearStatusTone,
  nextYearLabel,
  AcademicYearForm,
  type AcademicYearRecord,
} from './year-context';
import { AcademicPreparationPanel } from './preparation';
import { enrollmentSectionHref } from './enrollments-view';

export function StorageUsageOverview({ api }: { api: AcademicApiClient }) {
  const [usage, setUsage] = useState<Awaited<
    ReturnType<AcademicApiClient['getStorageUsage']>
  > | null>(null);
  const [policy, setPolicy] = useState<Awaited<
    ReturnType<AcademicApiClient['getStoragePolicy']>
  > | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof api.getStorageUsage !== 'function') return;
    let mounted = true;
    void Promise.all([api.getStorageUsage(), api.getStoragePolicy()])
      .then(([nextUsage, nextPolicy]) => {
        if (mounted) {
          setUsage(nextUsage);
          setPolicy(nextPolicy);
        }
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  if (!usage && !error) return null;
  if (error) {
    return (
      <Alert title="No pudimos cargar el almacenamiento" tone="info">
        La información de archivos permanece protegida y no afecta las descargas
        autorizadas.
      </Alert>
    );
  }
  if (!usage) return null;

  const tone =
    usage.state === 'FULL' || usage.state === 'CRITICAL'
      ? 'warning'
      : usage.state === 'NORMAL'
        ? 'success'
        : 'info';

  return (
    <section
      aria-labelledby="storage-usage-title"
      className="academic-panel storage-usage-panel"
    >
      <div className="section-heading">
        <div>
          <h2 id="storage-usage-title">Almacenamiento del tenant</h2>
          <p>
            Cuota agregada para operación académica. Esta vista no lista
            archivos ni sustituye la autorización de cada descarga.
          </p>
        </div>
        <Badge tone={tone}>{usage.state}</Badge>
      </div>
      <div className="storage-usage-grid">
        <div>
          <strong>{usage.allocationPercentage}%</strong>
          <span>asignación</span>
        </div>
        <div>
          <strong>{usage.fileCount}</strong>
          <span>archivos</span>
        </div>
        <div>
          <strong>{usage.blobCount}</strong>
          <span>blobs físicos</span>
        </div>
      </div>
      <div
        aria-label={`Asignación de almacenamiento: ${usage.allocationPercentage}%`}
        className="storage-meter"
      >
        <span style={{ width: `${usage.allocationPercentage}%` }} />
      </div>
      <dl className="storage-usage-details">
        <div>
          <dt>Usado</dt>
          <dd>{formatBytes(usage.usedBytes)}</dd>
        </div>
        <div>
          <dt>Reservado</dt>
          <dd>{formatBytes(usage.reservedBytes)}</dd>
        </div>
        <div>
          <dt>Disponible</dt>
          <dd>{formatBytes(usage.availableBytes)}</dd>
        </div>
        <div>
          <dt>Cuota del tenant</dt>
          <dd>{formatBytes(usage.quotaBytes)}</dd>
        </div>
      </dl>
      {policy ? (
        <p className="integration-note">
          <Icon name="layers" />
          Máximo por archivo: {formatBytes(policy.maxFileSizeBytes)} ·{' '}
          {policy.allowedExtensions.join(', ')}
        </p>
      ) : null}
    </section>
  );
}

export function SyncStatusOverview({ api }: { api: AcademicApiClient }) {
  const [status, setStatus] = useState<Awaited<
    ReturnType<AcademicApiClient['getSyncStatus']>
  > | null>(null);

  useEffect(() => {
    if (typeof api.getSyncStatus !== 'function') return;
    const timer = window.setTimeout(() => {
      void api
        .getSyncStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [api]);

  if (!status) return null;
  return (
    <section aria-labelledby="sync-status-title" className="academic-panel">
      <div className="section-heading">
        <div>
          <h2 id="sync-status-title">Sincronización EduPay</h2>
          <p>
            {status.configured
              ? `${status.configuration?.sourceTenantId} · ${status.configuration?.academicYearLabel}`
              : 'La sincronización aún no está configurada para este tenant.'}
          </p>
        </div>
        <Badge
          tone={status.lastRun?.status === 'SUCCEEDED' ? 'success' : 'neutral'}
        >
          {status.lastRun?.status ??
            (status.configuration?.enabled ? 'Pendiente' : 'Deshabilitada')}
        </Badge>
      </div>
      {status.lastRun ? (
        <p>
          Última ejecución:{' '}
          {status.lastRun.mode === 'FULL'
            ? 'reconciliación completa'
            : 'incremental'}{' '}
          · {status.lastRun.counts.failed + status.lastRun.counts.conflicted}{' '}
          conflictos o fallas.
        </p>
      ) : null}
    </section>
  );
}

export function YearPanorama({
  api,
  year,
}: {
  api: AcademicApiClient;
  year: AcademicYearRecord;
}) {
  const [overview, setOverview] = useState<Awaited<
    ReturnType<AcademicApiClient['getAcademicYearOverview']>
  > | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setOverview(null);
      setError('');
      void Promise.resolve()
        .then(() => api.getAcademicYearOverview(year.id))
        .then((value) => {
          if (!cancelled) setOverview(value);
        })
        .catch((nextError: unknown) => {
          if (!cancelled) setError(errorMessage(nextError).message);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, year.id, retry]);

  return (
    <section
      aria-labelledby="academic-year-panorama-title"
      className="academic-panel"
    >
      <div className="section-heading">
        <div>
          <h2 id="academic-year-panorama-title">Panorama de {year.label}</h2>
          <p>Cursos y matrículas activas del año en contexto.</p>
        </div>
      </div>
      {error ? (
        <Alert
          action={
            <Button
              onClick={() => setRetry((current) => current + 1)}
              variant="secondary"
            >
              Reintentar
            </Button>
          }
          title="No pudimos cargar el panorama del año"
          tone="error"
        >
          {error}
        </Alert>
      ) : !overview ? (
        <div className="academic-loading">
          <Skeleton />
        </div>
      ) : (
        <dl className="academic-year-panorama">
          <div>
            <dt>Cursos activos</dt>
            <dd>{overview.courses.active}</dd>
          </div>
          <div>
            <dt>Cursos en borrador</dt>
            <dd>{overview.courses.draft}</dd>
          </div>
          <div>
            <dt>Alumnos matriculados</dt>
            <dd>{overview.activeEnrollments.toLocaleString('es-CL')}</dd>
          </div>
          <div>
            <dt>Sincronizados desde EduPay</dt>
            <dd>
              {overview.sourceManagedActiveEnrollments.toLocaleString('es-CL')}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function NextYearPreparation({
  api,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const activeYears = data.academicYears.filter(
    (year) => year.status === 'ACTIVE',
  );
  const baseYear = activeYears.length === 1 ? activeYears[0] : undefined;
  const nextLabel = nextYearLabel(baseYear);
  const nextYear = nextLabel
    ? data.academicYears.find((year) => year.label.trim() === nextLabel)
    : undefined;
  const nextCourses = nextYear
    ? data.courses.filter(
        (course) =>
          course.academicYearId === nextYear.id && course.status !== 'ARCHIVED',
      ).length
    : 0;
  const [preview, setPreview] = useState<Awaited<
    ReturnType<AcademicApiClient['copyAcademicYearCourses']>
  > | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  if (!baseYear || !nextLabel) return null;
  const base = baseYear;

  async function copyCourses(dryRun: boolean) {
    if (!nextYear) return;
    setWorking(true);
    setError('');
    try {
      const response = await api.copyAcademicYearCourses(nextYear.id, {
        sourceAcademicYearId: base.id,
        dryRun,
      });
      if (dryRun) {
        setPreview(response);
      } else {
        setPreview(null);
        setResult(
          response.createdCount === 1
            ? `Se creó 1 curso en borrador en ${nextYear.label}.`
            : `Se crearon ${response.createdCount} cursos en borrador en ${nextYear.label}.`,
        );
        onSaved();
      }
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      aria-labelledby="academic-next-year-title"
      className="academic-panel academic-next-year"
    >
      <div className="section-heading">
        <div>
          <h2 id="academic-next-year-title">Preparar {nextLabel}</h2>
          <p>
            {base.label} sigue activo. {nextLabel} se prepara en borrador: sus
            cursos y matrículas no cambian el año en curso.
          </p>
        </div>
        <Badge tone={nextYear ? yearStatusTone(nextYear.status) : 'neutral'}>
          {nextYear ? statusLabel(nextYear.status) : 'Por crear'}
        </Badge>
      </div>
      {!nextYear ? (
        <AcademicYearForm
          api={api}
          initialLabel={nextLabel}
          onSaved={onSaved}
          title={`1. Crear el año ${nextLabel}`}
        />
      ) : (
        <div className="academic-next-year__steps">
          <p>
            <strong>1. Año {nextYear.label} creado</strong> ·{' '}
            {formatYearRange(nextYear)}
          </p>
          <div>
            <p>
              <strong>2. Cursos de {nextYear.label}</strong> ·{' '}
              {nextCourses === 1 ? '1 curso' : `${nextCourses} cursos`}
            </p>
            {nextYear.status === 'CLOSED' || nextYear.status === 'ARCHIVED' ? (
              <p className="table-muted">El año es de solo lectura.</p>
            ) : preview ? (
              <div className="academic-next-year__preview">
                {preview.toCreate.length ? (
                  <>
                    <p>
                      Se crearán en borrador {preview.toCreate.length} cursos
                      con los nombres de {base.label}:
                    </p>
                    <ul>
                      {preview.toCreate.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    Todos los cursos de {base.label} ya existen en{' '}
                    {nextYear.label}.
                  </p>
                )}
                {preview.alreadyPresent.length ? (
                  <p className="table-muted">
                    Ya existen y no se tocan:{' '}
                    {preview.alreadyPresent.join(', ')}.
                  </p>
                ) : null}
                <div className="provisioning-actions">
                  <Button
                    disabled={working}
                    onClick={() => setPreview(null)}
                    variant="secondary"
                  >
                    Cancelar
                  </Button>
                  {preview.toCreate.length ? (
                    <Button
                      loading={working}
                      onClick={() => void copyCourses(false)}
                    >
                      Crear {preview.toCreate.length} cursos en borrador
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button
                loading={working}
                onClick={() => {
                  setResult('');
                  void copyCourses(true);
                }}
                variant="secondary"
              >
                Revisar cursos a copiar desde {base.label}
              </Button>
            )}
          </div>
          <p>
            <strong>3. Matrículas {nextYear.label}</strong> · Incorpora a los
            alumnos nuevos en los cursos de {nextYear.label} desde{' '}
            <Link href={enrollmentSectionHref('admit')}>Matrículas</Link>. El
            avance de curso se hace al cierre de {base.label}.
          </p>
        </div>
      )}
      {result ? (
        <Alert title="Cursos preparados" tone="success">
          {result}
        </Alert>
      ) : null}
      {error ? (
        <Alert title="No pudimos preparar los cursos" tone="error">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}

type HomeTask = {
  action: string;
  detail: string;
  href: string;
  id: string;
  title: string;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The first panel of Inicio: what needs attention in the year in context,
 * each item linking to the screen that resolves it, plus the frequent tasks.
 */
function NextSteps({
  api,
  contextYear,
  data,
}: {
  api: AcademicApiClient;
  contextYear: AcademicYearRecord | undefined;
  data: AdminData;
}) {
  const [review, setReview] = useState<
    | { state: 'loading' }
    | { state: 'ready'; count: number }
    | { state: 'error' }
  >({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.resolve()
        .then(() => api.listInconsistentEnrollments())
        .then((page) => {
          if (!cancelled) setReview({ state: 'ready', count: page.totalCount });
        })
        .catch(() => {
          if (!cancelled) setReview({ state: 'error' });
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api]);

  const tasks: HomeTask[] = [];
  const readOnly =
    contextYear?.status === 'CLOSED' || contextYear?.status === 'ARCHIVED';
  if (!contextYear) {
    tasks.push({
      action: 'Ir a Cursos',
      detail: 'Crea el año en «Años académicos» o elige uno en el selector.',
      href: '/administracion/estructura',
      id: 'year',
      title: 'Elige o crea un año académico',
    });
  } else if (!readOnly) {
    const yearCourses = data.courses.filter(
      (course) =>
        course.academicYearId === contextYear.id &&
        course.status !== 'ARCHIVED',
    );
    const coursesWithSubjects = new Set(
      data.courseSubjects
        .filter((item) => item.status === 'ACTIVE')
        .map((item) => item.courseId),
    );
    const withoutSubjects = yearCourses.filter(
      (course) => !coursesWithSubjects.has(course.id),
    ).length;
    const drafts = yearCourses.filter(
      (course) => course.status === 'DRAFT',
    ).length;
    if (yearCourses.length === 0) {
      tasks.push({
        action: 'Ir a Cursos',
        detail:
          contextYear.status === 'DRAFT'
            ? 'Créalos uno a uno o cópialos del año activo en «Preparar» más abajo.'
            : 'Crea los cursos del año para poder matricular.',
        href: '/administracion/estructura',
        id: 'no-courses',
        title: `${contextYear.label} aún no tiene cursos`,
      });
    }
    if (withoutSubjects > 0) {
      tasks.push({
        action: 'Revisar cursos',
        detail:
          'Asocia asignaturas y profesores desde el detalle de cada curso.',
        href: '/administracion/estructura',
        id: 'without-subjects',
        title: `${countLabel(withoutSubjects, 'curso', 'cursos')} de ${contextYear.label} sin asignaturas`,
      });
    }
    if (drafts > 0 && contextYear.status === 'ACTIVE') {
      tasks.push({
        action: 'Revisar cursos',
        detail: 'Revisa si ya corresponde activarlos.',
        href: '/administracion/estructura',
        id: 'draft-courses',
        title: `${countLabel(drafts, 'curso', 'cursos')} de ${contextYear.label} en borrador`,
      });
    }
  }
  if (review.state === 'ready' && review.count > 0) {
    tasks.push({
      action: 'Revisar matrículas',
      detail: 'Matrículas activas de alumnos inactivos o en cursos archivados.',
      href: enrollmentSectionHref('review'),
      id: 'review',
      title: `${countLabel(review.count, 'matrícula', 'matrículas')} por revisar`,
    });
  }

  return (
    <section
      aria-labelledby="admin-next-steps-title"
      className="academic-panel admin-next-steps"
    >
      <div className="section-heading">
        <div>
          <h2 id="admin-next-steps-title">Qué hacer ahora</h2>
          <p>
            {contextYear
              ? `Pendientes de ${contextYear.label} y de la institución.`
              : 'Pendientes de la institución.'}
          </p>
        </div>
      </div>
      {tasks.length ? (
        <ol className="admin-task-route">
          {tasks.map((task, index) => (
            <li className="admin-task-route__item" key={task.id}>
              <span aria-hidden="true" className="admin-task-route__marker">
                {index + 1}
              </span>
              <span className="admin-task-route__copy">
                <strong>{task.title}</strong>
                <small>{task.detail}</small>
              </span>
              <Link
                className="ui-button ui-button--secondary ui-button--sm"
                href={task.href}
              >
                {task.action}
              </Link>
            </li>
          ))}
        </ol>
      ) : review.state === 'loading' ? (
        <p className="admin-next-steps__status" role="status">
          Revisando pendientes…
        </p>
      ) : (
        <p className="admin-next-steps__status admin-next-steps__status--clear">
          <Icon name="check-circle" />
          {contextYear
            ? `Sin pendientes para ${contextYear.label}.`
            : 'Sin pendientes.'}
        </p>
      )}
      {review.state === 'error' ? (
        <p className="table-muted">
          No pudimos revisar las matrículas pendientes.{' '}
          <Link href={enrollmentSectionHref('review')}>Abrir Por revisar</Link>
        </p>
      ) : null}
      <nav aria-label="Tareas frecuentes" className="admin-quick-actions">
        <span className="admin-quick-actions__label">Tareas frecuentes</span>
        <Link
          className="admin-quick-action"
          href={enrollmentSectionHref('admit')}
        >
          <Icon name="plus" /> Incorporar alumno nuevo
        </Link>
        <Link
          className="admin-quick-action"
          href={enrollmentSectionHref('enroll')}
        >
          <Icon name="clipboard" /> Matricular alumno existente
        </Link>
        <Link
          className="admin-quick-action"
          href={enrollmentSectionHref('promotion')}
        >
          <Icon name="arrow-right" /> Avance anual
        </Link>
        <Link className="admin-quick-action" href="/administracion/estructura">
          <Icon name="layers" /> Ver cursos
        </Link>
      </nav>
    </section>
  );
}

export function AdminOverview({
  api,
  contextYear,
  data,
  onRetryPreparation,
  onSaved,
}: {
  api: AcademicApiClient;
  contextYear: AcademicYearRecord | undefined;
  data: AdminData;
  onRetryPreparation: () => void;
  onSaved: () => void;
}) {
  // The base preparation leads the page only when it needs attention; once
  // ready it moves to the system status, next to sync and storage.
  const preparationNeedsAttention =
    Boolean(data.academicPreparationError) ||
    (data.academicPreparation !== null && !data.academicPreparation.ready);
  return (
    <div className="academic-stack">
      <NextSteps api={api} contextYear={contextYear} data={data} />
      {preparationNeedsAttention ? (
        <AcademicPreparationPanel
          data={data}
          onRetry={onRetryPreparation}
          showStructureLink
        />
      ) : null}
      <NextYearPreparation api={api} data={data} onSaved={onSaved} />
      {contextYear ? (
        <YearPanorama api={api} key={contextYear.id} year={contextYear} />
      ) : null}
      <details className="admin-support-details">
        <summary>Estado del sistema</summary>
        <div className="admin-support-details__content">
          {preparationNeedsAttention ? null : (
            <AcademicPreparationPanel
              data={data}
              onRetry={onRetryPreparation}
            />
          )}
          <SyncStatusOverview api={api} />
          <StorageUsageOverview api={api} />
        </div>
      </details>
    </div>
  );
}
