'use client';

import { Alert, Badge, Button, Dialog, EmptyState, Skeleton } from '@edupay/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AcademicApiClient } from '@/api/academic-client';

import { errorMessage, recordOriginLabel, type AdminData } from './shared';

export type EnrollmentDeactivationTarget = {
  readonly enrollmentId: string;
  readonly studentName: string;
  readonly courseLabel: string;
};

/**
 * Confirms and closes one MANUAL course enrollment. The enrollment keeps its
 * history (it becomes inactive, it is not deleted) and the API records the
 * audit event and, when enabled, the financial projection change.
 */
export function EnrollmentDeactivationDialog({
  api,
  target,
  onClose,
  onDeactivated,
}: {
  api: AcademicApiClient;
  target: EnrollmentDeactivationTarget | null;
  onClose: () => void;
  onDeactivated: (target: EnrollmentDeactivationTarget) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!target) return null;
  const current = target;

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await api.deactivateEnrollment(current.enrollmentId);
      onDeactivated(current);
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      description={`${current.studentName} dejará de estar matriculado en ${current.courseLabel}.`}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      open
      title="Dar de baja matrícula"
    >
      <div className="academic-form">
        <p>
          La matrícula queda inactiva y conserva su historial; no se borra. Si
          la sincronización con Pagos está activa, Pagos recibe la baja.
        </p>
        {error ? (
          <Alert title="No pudimos dar de baja la matrícula" tone="error">
            {error}
          </Alert>
        ) : null}
        <div className="provisioning-actions">
          <Button disabled={saving} onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            loading={saving}
            onClick={() => void confirm()}
            variant="danger"
          >
            Confirmar baja
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function CourseRoster({
  api,
  course,
  yearReadOnly = false,
}: {
  api: AcademicApiClient;
  course: AdminData['courses'][number];
  yearReadOnly?: boolean;
}) {
  const [deactivationTarget, setDeactivationTarget] =
    useState<EnrollmentDeactivationTarget | null>(null);
  const [notice, setNotice] = useState('');
  const [roster, setRoster] = useState<
    Awaited<ReturnType<AcademicApiClient['getCourseRoster']>>['items']
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [rosterContextId, setRosterContextId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorContextId, setErrorContextId] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      setErrorContextId('');
      void api
        .getCourseRoster(course.id, pageCursor)
        .then((page) => {
          if (sequence === requestSequence.current) {
            setRoster(page.items);
            setTotalCount(page.totalCount);
            setNextCursor(page.nextCursor);
            setRosterContextId(course.id);
          }
        })
        .catch((nextError: unknown) => {
          if (sequence === requestSequence.current) {
            setError(errorMessage(nextError).message);
            setErrorContextId(course.id);
          }
        })
        .finally(() => {
          if (sequence === requestSequence.current) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [api, course.id, pageCursor, retryCount]);

  function changePage(direction: 'previous' | 'next') {
    const cursor =
      direction === 'next'
        ? (nextCursor ?? undefined)
        : pageCursors[pageIndex - 1];
    if (direction === 'next' && !cursor) return;
    if (direction === 'previous' && pageIndex === 0) return;
    const nextPageIndex = pageIndex + (direction === 'next' ? 1 : -1);
    setRosterContextId('');
    setLoading(true);
    setError('');
    setPageCursor(cursor ?? undefined);
    setPageCursors((current) => [
      ...current.slice(0, nextPageIndex),
      cursor ?? undefined,
    ]);
    setPageIndex(nextPageIndex);
  }

  function handleDeactivated(target: EnrollmentDeactivationTarget) {
    setDeactivationTarget(null);
    setNotice(
      `${target.studentName} quedó dado de baja de ${target.courseLabel}.`,
    );
    // The closed enrollment may have been the page cursor: restart at page 1.
    setRosterContextId('');
    setPageCursor(undefined);
    setPageCursors([undefined]);
    setPageIndex(0);
    setRetryCount((current) => current + 1);
  }

  const rosterIsCurrent = rosterContextId === course.id;
  const errorIsCurrent = errorContextId === course.id && Boolean(error);
  const noticeBanner = notice ? (
    <Alert title="Matrícula dada de baja" tone="success">
      {notice}
    </Alert>
  ) : null;
  if (loading)
    return (
      <div className="academic-loading">
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (!rosterIsCurrent && errorIsCurrent)
    return (
      <Alert
        action={
          <Button
            onClick={() => setRetryCount((current) => current + 1)}
            variant="secondary"
          >
            Reintentar
          </Button>
        }
        title="No pudimos cargar el roster"
        tone="error"
      >
        {error}
      </Alert>
    );
  if (!rosterIsCurrent)
    return (
      <div className="academic-loading">
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (totalCount === 0)
    return (
      <>
        {noticeBanner}
        <EmptyState
          description={`Todavía no hay alumnos inscritos en ${course.label}.`}
          title="Roster vacío"
        />
      </>
    );

  return (
    <>
      {noticeBanner}
      {errorIsCurrent ? (
        <Alert
          action={
            <Button
              onClick={() => setRetryCount((current) => current + 1)}
              variant="secondary"
            >
              Reintentar
            </Button>
          }
          title="No pudimos actualizar el roster"
          tone="error"
        >
          {error}
        </Alert>
      ) : null}
      <div className="responsive-table">
        <table>
          <caption className="sr-only">Roster de {course.label}</caption>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Correo</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((item) => (
              <tr key={item.enrollmentId}>
                <td data-label="Alumno">
                  <strong>
                    {item.student.firstName} {item.student.lastName}
                  </strong>
                </td>
                <td data-label="Correo">
                  {item.student.email ?? 'Sin correo'}
                </td>
                <td data-label="Origen">
                  {item.sourceManaged ? (
                    <Badge tone="info">Gestionado por sincronización</Badge>
                  ) : (
                    <Badge tone="neutral">
                      {recordOriginLabel(item.student)}
                    </Badge>
                  )}
                </td>
                <td data-label="Estado">
                  <Badge tone="success">Activo</Badge>
                </td>
                <td data-label="Acción">
                  {item.sourceManaged ? (
                    <span className="table-muted">Se gestiona en EduPay</span>
                  ) : yearReadOnly || course.status === 'ARCHIVED' ? (
                    <span className="table-muted">Solo lectura</span>
                  ) : (
                    <Button
                      aria-label={`Dar de baja a ${item.student.firstName} ${item.student.lastName}`}
                      onClick={() => {
                        setNotice('');
                        setDeactivationTarget({
                          enrollmentId: item.enrollmentId,
                          studentName: `${item.student.firstName} ${item.student.lastName}`,
                          courseLabel: course.label,
                        });
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Dar de baja
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EnrollmentDeactivationDialog
        api={api}
        onClose={() => setDeactivationTarget(null)}
        onDeactivated={handleDeactivated}
        target={deactivationTarget}
      />
      {totalCount > 50 ? (
        <div className="pagination-bar">
          <span className="pagination-info">
            Página {pageIndex + 1} de {Math.ceil(totalCount / 50)} ·{' '}
            {totalCount.toLocaleString('es-CL')} alumnos
          </span>
          <div className="provisioning-actions">
            <Button
              disabled={pageIndex === 0 || loading}
              onClick={() => changePage('previous')}
              variant="secondary"
            >
              Anterior
            </Button>
            <Button
              disabled={!nextCursor || loading}
              onClick={() => changePage('next')}
              variant="secondary"
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export const inconsistentReasonLabels = {
  STUDENT_INACTIVE: 'Alumno inactivo',
  COURSE_ARCHIVED: 'Curso archivado',
} as const;

/**
 * Lists active enrollments whose student is inactive or whose course is
 * archived, so an administrator can close them. They would otherwise keep
 * counting in rosters and in the financial projection.
 */
export function InconsistentEnrollmentsPanel({
  api,
}: {
  api: AcademicApiClient;
}) {
  const [items, setItems] = useState<
    Awaited<
      ReturnType<AcademicApiClient['listInconsistentEnrollments']>
    >['items']
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState<EnrollmentDeactivationTarget | null>(
    null,
  );
  const requestSequence = useRef(0);
  const pageCursor = pageCursors[pageIndex];

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void api
        .listInconsistentEnrollments(pageCursor)
        .then((page) => {
          if (sequence !== requestSequence.current) return;
          setItems(page.items);
          setTotalCount(page.totalCount);
          setNextCursor(page.nextCursor);
        })
        .catch((nextError: unknown) => {
          if (sequence === requestSequence.current) {
            setError(errorMessage(nextError).message);
          }
        })
        .finally(() => {
          if (sequence === requestSequence.current) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [api, pageCursor, reload]);

  function changePage(direction: 'previous' | 'next') {
    if (direction === 'next') {
      if (!nextCursor) return;
      setPageCursors((current) => [
        ...current.slice(0, pageIndex + 1),
        nextCursor,
      ]);
      setPageIndex(pageIndex + 1);
    } else if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  }

  function handleDeactivated(closed: EnrollmentDeactivationTarget) {
    setTarget(null);
    setNotice(
      `${closed.studentName} quedó dado de baja de ${closed.courseLabel}.`,
    );
    setPageCursors([undefined]);
    setPageIndex(0);
    setReload((current) => current + 1);
  }

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="academic-loading">
        <Skeleton />
        <Skeleton />
      </div>
    );
  } else if (error) {
    body = (
      <Alert
        action={
          <Button
            onClick={() => setReload((current) => current + 1)}
            variant="secondary"
          >
            Reintentar
          </Button>
        }
        title="No pudimos cargar las matrículas por revisar"
        tone="error"
      >
        {error}
      </Alert>
    );
  } else if (totalCount === 0) {
    body = (
      <EmptyState
        description="Todas las matrículas activas corresponden a alumnos activos en cursos vigentes."
        title="Sin matrículas por revisar"
      />
    );
  } else {
    body = (
      <>
        <div className="responsive-table">
          <table>
            <caption className="sr-only">Matrículas por revisar</caption>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Curso</th>
                <th>Motivo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const name = `${item.student.firstName} ${item.student.lastName}`;
                const yearReadOnly =
                  item.academicYear.status === 'CLOSED' ||
                  item.academicYear.status === 'ARCHIVED';
                return (
                  <tr key={item.enrollmentId}>
                    <td data-label="Alumno">
                      <strong>{name}</strong>
                    </td>
                    <td data-label="Curso">
                      {item.course.label}
                      <span className="table-muted">
                        {' '}
                        · {item.academicYear.label}
                      </span>
                    </td>
                    <td data-label="Motivo">
                      {item.reasons.map((reason) => (
                        <Badge key={reason} tone="warning">
                          {inconsistentReasonLabels[reason]}
                        </Badge>
                      ))}
                    </td>
                    <td data-label="Acción">
                      {item.sourceManaged ? (
                        <span className="table-muted">
                          Se gestiona en EduPay
                        </span>
                      ) : yearReadOnly ? (
                        <span className="table-muted">
                          Año cerrado: solo lectura
                        </span>
                      ) : (
                        <Button
                          aria-label={`Dar de baja a ${name} de ${item.course.label}`}
                          onClick={() => {
                            setNotice('');
                            setTarget({
                              enrollmentId: item.enrollmentId,
                              studentName: name,
                              courseLabel: item.course.label,
                            });
                          }}
                          size="sm"
                          variant="secondary"
                        >
                          Dar de baja
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalCount > 50 ? (
          <div className="pagination-bar">
            <span className="pagination-info">
              Página {pageIndex + 1} de {Math.ceil(totalCount / 50)} ·{' '}
              {totalCount.toLocaleString('es-CL')} matrículas
            </span>
            <div className="provisioning-actions">
              <Button
                disabled={pageIndex === 0}
                onClick={() => changePage('previous')}
                variant="secondary"
              >
                Anterior
              </Button>
              <Button
                disabled={!nextCursor}
                onClick={() => changePage('next')}
                variant="secondary"
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section
      aria-labelledby="inconsistent-enrollments-heading"
      className="academic-panel"
    >
      <div className="section-heading">
        <div>
          <h2 id="inconsistent-enrollments-heading">Matrículas por revisar</h2>
          <p>
            Matrículas que siguen activas aunque el alumno esté inactivo o el
            curso archivado. Cuentan en los listados y en Pagos hasta que las
            des de baja.
          </p>
        </div>
        {!loading && !error && totalCount > 0 ? (
          <Badge tone="warning">{totalCount} por revisar</Badge>
        ) : null}
      </div>
      {notice ? (
        <Alert title="Matrícula dada de baja" tone="success">
          {notice}
        </Alert>
      ) : null}
      {body}
      <EnrollmentDeactivationDialog
        api={api}
        onClose={() => setTarget(null)}
        onDeactivated={handleDeactivated}
        target={target}
      />
    </section>
  );
}
