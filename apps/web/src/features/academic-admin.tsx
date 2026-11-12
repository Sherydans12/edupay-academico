'use client';

import { courseEnrollmentPromotionOverrideLimit } from '@edupay/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@edupay/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';

import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { createAcademicApiClient } from '@/api/client-factory';
import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import {
  AccountProvisioning,
  type AccountProvisioningActions,
} from '@/components/account-provisioning';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

type AdminView = 'overview' | 'structure' | 'people';

interface AdminData {
  academicYears: Awaited<
    ReturnType<AcademicApiClient['listAcademicYears']>
  >['items'];
  courses: Awaited<ReturnType<AcademicApiClient['listCourses']>>['items'];
  students: Awaited<ReturnType<AcademicApiClient['listStudents']>>['items'];
  teachers: Awaited<ReturnType<AcademicApiClient['listTeachers']>>['items'];
  subjects: Awaited<ReturnType<AcademicApiClient['listSubjects']>>['items'];
  courseSubjects: Awaited<
    ReturnType<AcademicApiClient['listCourseSubjects']>
  >['items'];
  studentsNextCursor?: string | null;
  teachersNextCursor?: string | null;
  subjectsNextCursor?: string | null;
  studentsTotalCount?: number;
  teachersTotalCount?: number;
  academicPreparation: Awaited<
    ReturnType<AcademicApiClient['getAcademicPreparationStatus']>
  > | null;
  academicPreparationError: unknown | null;
}

interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number | undefined;
}

async function loadAllPages<T>(
  loadPage: (cursor?: string) => Promise<CursorPage<T>>,
): Promise<CursorPage<T>> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let totalCount: number | undefined;

  while (true) {
    const page = await loadPage(cursor);
    items.push(...page.items);
    totalCount ??= page.totalCount;

    if (page.nextCursor === null) {
      return totalCount === undefined
        ? { items, nextCursor: null }
        : { items, nextCursor: null, totalCount };
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error('La paginación devolvió un cursor repetido.');
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

const emptyData: AdminData = {
  academicYears: [],
  courses: [],
  students: [],
  teachers: [],
  subjects: [],
  courseSubjects: [],
  studentsNextCursor: null,
  teachersNextCursor: null,
  subjectsNextCursor: null,
  studentsTotalCount: 0,
  teachersTotalCount: 0,
  academicPreparation: null,
  academicPreparationError: null,
};

function preferredAcademicYearId(
  data: Pick<AdminData, 'academicYears' | 'academicPreparation'>,
): string {
  const selectedActiveYearId =
    data.academicPreparation?.academicYears.selectedActiveYearId;
  if (selectedActiveYearId) return selectedActiveYearId;

  const activeYears = data.academicYears.filter(
    (year) => year.status === 'ACTIVE',
  );
  if (activeYears.length === 1) return activeYears[0]?.id ?? '';
  if (activeYears.length > 1) return '';

  return data.academicYears.find((year) => year.status === 'DRAFT')?.id ?? '';
}

function errorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof AcademicApiError) {
    if (error.status === 401)
      return { title: 'Sesión no disponible', message: error.message };
    if (error.status === 403) {
      return {
        title: 'Sin permiso para este espacio',
        message:
          'Tu sesión está autenticada, pero tu rol no puede administrar la estructura académica de este tenant.',
      };
    }
    if (error.status === 409) {
      return {
        title: 'La configuración entra en conflicto',
        message: error.message,
      };
    }
    return {
      title: 'No pudimos completar la acción',
      message: `${error.message}${error.requestId !== 'unavailable' ? ` Código de solicitud: ${error.requestId}.` : ''}`,
    };
  }
  if (error instanceof Error) {
    return { title: 'No pudimos completar la acción', message: error.message };
  }
  return {
    title: 'No pudimos cargar la información',
    message:
      'Inténtalo nuevamente. Si el problema continúa, informa el código de solicitud a soporte.',
  };
}

function useAdminData(api: AcademicApiClient, contextKey: string) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setData((current) => ({
      ...current,
      academicPreparation: null,
      academicPreparationError: null,
    }));

    const [coreResult, preparationResult] = await Promise.allSettled([
      Promise.all([
        loadAllPages((cursor) => api.listAcademicYears(cursor)),
        loadAllPages((cursor) => api.listCourses(undefined, cursor)),
        api.listStudents(),
        api.listTeachers(),
        loadAllPages((cursor) => api.listSubjects(cursor)),
        loadAllPages((cursor) => api.listCourseSubjects(undefined, cursor)),
      ]),
      api.getAcademicPreparationStatus(),
    ]);

    if (sequence !== requestSequence.current) return;

    if (coreResult.status === 'rejected') {
      setError(coreResult.reason);
      setLoading(false);
      return;
    }

    const [
      academicYears,
      courses,
      students,
      teachers,
      subjects,
      courseSubjects,
    ] = coreResult.value;
    setData({
      academicYears: academicYears.items,
      courses: courses.items,
      students: students.items,
      teachers: teachers.items,
      subjects: subjects.items,
      courseSubjects: courseSubjects.items,
      studentsNextCursor: students.nextCursor,
      teachersNextCursor: teachers.nextCursor,
      subjectsNextCursor: subjects.nextCursor,
      studentsTotalCount: students.totalCount ?? students.items.length,
      teachersTotalCount: teachers.totalCount ?? teachers.items.length,
      academicPreparation:
        preparationResult.status === 'fulfilled'
          ? preparationResult.value
          : null,
      academicPreparationError:
        preparationResult.status === 'rejected'
          ? preparationResult.reason
          : null,
    });
    setLoading(false);
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [contextKey, reload]);

  return { data, error, loading, reload, setData };
}

function DataState({
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
  if (loading) {
    return (
      <div
        aria-label="Cargando información académica"
        className="academic-loading"
      >
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (error) {
    const copy = errorMessage(error);
    return (
      <Alert
        action={
          <Button onClick={onRetry} variant="secondary">
            Reintentar
          </Button>
        }
        title={copy.title}
        tone={
          copy.title === 'Sin permiso para este espacio' ? 'warning' : 'error'
        }
      >
        {copy.message}
      </Alert>
    );
  }
  return <>{children}</>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function statusLabel(status: string) {
  return status === 'ACTIVE'
    ? 'Activo'
    : status === 'DRAFT'
      ? 'Borrador'
      : status === 'CLOSED'
        ? 'Cerrado'
        : 'Archivado';
}

function StorageUsageOverview({ api }: { api: AcademicApiClient }) {
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

function SyncStatusOverview({ api }: { api: AcademicApiClient }) {
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

type PreparationStatus = Awaited<
  ReturnType<AcademicApiClient['getAcademicPreparationStatus']>
>['status'];

function preparationStatusLabel(status: PreparationStatus): string {
  return status === 'READY'
    ? 'Preparada'
    : status === 'BLOCKED'
      ? 'Requiere revisión'
      : 'Pendiente';
}

function preparationTone(
  status: PreparationStatus,
): 'neutral' | 'success' | 'warning' {
  return status === 'READY'
    ? 'success'
    : status === 'BLOCKED'
      ? 'warning'
      : 'neutral';
}

function AcademicPreparationPanel({
  data,
  onRetry,
  showStructureLink = false,
}: {
  data: AdminData;
  onRetry: () => void;
  showStructureLink?: boolean;
}) {
  const preparation = data.academicPreparation;
  const preparationError = data.academicPreparationError;

  if (preparationError) {
    const copy = errorMessage(preparationError);
    return (
      <section
        aria-labelledby="academic-preparation-title"
        className="academic-panel academic-preparation-panel"
      >
        <div className="academic-preparation-panel__header">
          <div>
            <h2 id="academic-preparation-title">Preparación académica base</h2>
            <p>
              Indicador derivado para año académico y cursos. No representa la
              preparación completa del colegio.
            </p>
          </div>
          <Badge tone="error">No disponible</Badge>
        </div>
        <div className="academic-preparation-panel__error" role="alert">
          <Icon name="alert-triangle" />
          <div>
            <strong>No pudimos validar la estructura base</strong>
            <p>
              {copy.message} No mostramos un estado listo hasta obtener una
              respuesta válida.
            </p>
          </div>
          <Button onClick={onRetry} size="sm" variant="secondary">
            Reintentar validación
          </Button>
        </div>
      </section>
    );
  }

  if (!preparation) return null;

  const yearCheck = preparation.checks.find(
    (check) => check.code === 'ACADEMIC_YEAR',
  );
  const courseCheck = preparation.checks.find(
    (check) => check.code === 'COURSES',
  );
  const selectedYear = preparation.academicYears.selectedActiveYearId
    ? data.academicYears.find(
        (year) => year.id === preparation.academicYears.selectedActiveYearId,
      )
    : null;
  const overallMessage =
    preparation.status === 'READY'
      ? `La estructura base está lista para continuar con asignaturas y personas${selectedYear ? ` en ${selectedYear.label}` : ''}.`
      : preparation.status === 'BLOCKED'
        ? 'Resuelve la revisión indicada antes de considerar lista la estructura base.'
        : (yearCheck?.message ??
          courseCheck?.message ??
          'Completa los pasos pendientes.');
  const steps = [
    {
      label: 'Año académico',
      status: yearCheck?.status ?? 'ACTION_REQUIRED',
      detail:
        preparation.academicYears.active === 1
          ? 'Un año activo'
          : `${preparation.academicYears.active} activos`,
    },
    {
      label: 'Cursos',
      status: courseCheck?.status ?? 'ACTION_REQUIRED',
      detail:
        preparation.courses.activeInSelectedYear === null
          ? 'Espera el año activo'
          : `${preparation.courses.activeInSelectedYear} activos${
              preparation.courses.draftInSelectedYear
                ? ` · ${preparation.courses.draftInSelectedYear} borrador${
                    preparation.courses.draftInSelectedYear === 1 ? '' : 'es'
                  }`
                : ''
            }`,
    },
    {
      label: 'Validación',
      status: preparation.status,
      detail: preparationStatusLabel(preparation.status),
    },
  ];

  return (
    <section
      aria-labelledby="academic-preparation-title"
      className="academic-panel academic-preparation-panel"
    >
      <div className="academic-preparation-panel__header">
        <div>
          <h2 id="academic-preparation-title">Preparación académica base</h2>
          <p>
            Sigue la ruta mínima para dejar listo el año y sus cursos. Este
            indicador no evalúa asignaturas, personas ni matrículas.
          </p>
        </div>
        <Badge tone={preparationTone(preparation.status)}>
          {preparationStatusLabel(preparation.status)}
        </Badge>
      </div>

      <div
        aria-label="Ruta de preparación: año, cursos y validación"
        className="academic-preparation-route"
        role="list"
      >
        {steps.map((step, index) => (
          <div
            className={`academic-preparation-step academic-preparation-step--${step.status.toLowerCase()}`}
            key={step.label}
            role="listitem"
          >
            <span className="academic-preparation-step__marker">
              {step.status === 'READY' ? <Icon name="check" /> : index + 1}
            </span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </div>
        ))}
      </div>

      <div
        className="academic-preparation-summary"
        aria-label="Resumen de preparación"
      >
        <div>
          <strong>{preparation.academicYears.total}</strong>
          <span>años académicos</span>
        </div>
        <div>
          <strong>
            {preparation.courses.activeInSelectedYear === null
              ? '—'
              : preparation.courses.activeInSelectedYear}
          </strong>
          <span>cursos activos en el año seleccionado</span>
        </div>
      </div>

      <div
        className={`academic-preparation-next academic-preparation-next--${preparation.status.toLowerCase()}`}
        role="status"
      >
        <Icon
          name={preparation.status === 'READY' ? 'check' : 'alert-triangle'}
        />
        <div>
          <strong>
            {preparation.status === 'READY'
              ? 'Estructura base preparada'
              : (yearCheck?.action ??
                courseCheck?.action ??
                'Revisar estructura')}
          </strong>
          <p>{overallMessage}</p>
        </div>
        {showStructureLink && preparation.status !== 'READY' ? (
          <a
            className="academic-preparation-panel__link"
            href="/administracion/estructura"
          >
            Abrir estructura <Icon name="chevron-right" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function AdminOverview({
  api,
  data,
  onRetryPreparation,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onRetryPreparation: () => void;
}) {
  const activeYears = data.academicYears.filter(
    (year) => year.status === 'ACTIVE',
  );
  const currentYearLabel =
    activeYears.length === 1
      ? activeYears[0]?.label
      : activeYears.length > 1
        ? 'Varios activos'
        : '—';
  return (
    <>
      <AcademicPreparationPanel
        data={data}
        onRetry={onRetryPreparation}
        showStructureLink
      />
      <nav
        aria-label="Accesos de administración"
        className="admin-module-links"
      >
        <Link className="admin-module-link" href="/administracion/estructura">
          <span className="admin-module-link__icon">
            <Icon name="layers" />
          </span>
          <span className="admin-module-link__copy">
            <strong>Estructura académica</strong>
            <small>
              {data.academicYears.length} años · {data.courses.length} cursos ·{' '}
              {data.subjects.length} asignaturas
            </small>
          </span>
          <Icon className="admin-module-link__arrow" name="chevron-right" />
        </Link>
        <Link className="admin-module-link" href="/administracion/personas">
          <span className="admin-module-link__icon">
            <Icon name="people" />
          </span>
          <span className="admin-module-link__copy">
            <strong>Personas y accesos</strong>
            <small>
              {data.studentsTotalCount ?? data.students.length} alumnos ·{' '}
              {data.teachersTotalCount ?? data.teachers.length} profesores
            </small>
          </span>
          <Icon className="admin-module-link__arrow" name="chevron-right" />
        </Link>
        <Link
          className="admin-module-link"
          href="/administracion/configuracion"
        >
          <span className="admin-module-link__icon">
            <Icon name="settings" />
          </span>
          <span className="admin-module-link__copy">
            <strong>Configuración institucional</strong>
            <small>Datos usados en documentos y fechas académicas</small>
          </span>
          <Icon className="admin-module-link__arrow" name="chevron-right" />
        </Link>
      </nav>
      <div className="compact-stats academic-stats">
        <Card className="compact-stat">
          <span>
            <Icon name="people" />
          </span>
          <div>
            <strong>{data.studentsTotalCount ?? data.students.length}</strong>
            <small>alumnos registrados</small>
          </div>
        </Card>
        <Card className="compact-stat">
          <span>
            <Icon name="book" />
          </span>
          <div>
            <strong>{data.courseSubjects.length}</strong>
            <small>asignaturas en cursos</small>
          </div>
        </Card>
        <Card className="compact-stat">
          <span>
            <Icon name="calendar" />
          </span>
          <div>
            <strong>{currentYearLabel}</strong>
            <small>
              {activeYears.length > 1
                ? 'años académicos activos'
                : 'año académico activo'}
            </small>
          </div>
        </Card>
      </div>
      <details className="admin-support-details">
        <summary>Integraciones y almacenamiento</summary>
        <div className="admin-support-details__content">
          <SyncStatusOverview api={api} />
          <StorageUsageOverview api={api} />
        </div>
      </details>
    </>
  );
}

function AcademicYearForm({
  api,
  onSaved,
}: {
  api: AcademicApiClient;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createAcademicYear({ label, startDate, endDate });
      setLabel('');
      setStartDate('');
      setEndDate('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>Nuevo año académico</h3>
      <div className="academic-form__fields">
        <Input
          id="academic-year-label"
          label="Nombre"
          placeholder="2027"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          id="academic-year-start"
          label="Inicio"
          required
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          id="academic-year-end"
          label="Término"
          required
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button loading={saving} type="submit">
        Crear año
      </Button>
    </form>
  );
}

function CourseForm({
  api,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const [academicYearId, setAcademicYearId] = useState(
    preferredAcademicYearId(data),
  );
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedYear = data.academicYears.find(
    (year) => year.id === academicYearId,
  );
  const canCreateCourse =
    selectedYear?.status === 'ACTIVE' || selectedYear?.status === 'DRAFT';
  const canCreateActive = selectedYear?.status === 'ACTIVE';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!academicYearId || !label.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createCourse({ academicYearId, label: label.trim(), status });
      setLabel('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>Nuevo curso</h3>
      <div className="academic-form__fields">
        <Select
          id="new-course-year"
          hint={
            canCreateCourse
              ? 'Los años cerrados o archivados se conservan en solo lectura.'
              : 'Selecciona un año activo o en borrador para crear un curso.'
          }
          label="Año del nuevo curso"
          required
          value={academicYearId}
          onChange={(e) => {
            const nextYearId = e.target.value;
            setAcademicYearId(nextYearId);
            if (
              data.academicYears.find((year) => year.id === nextYearId)
                ?.status !== 'ACTIVE'
            ) {
              setStatus('DRAFT');
            }
          }}
        >
          <option value="">Selecciona un año</option>
          {data.academicYears.map((year) => (
            <option
              disabled={year.status === 'CLOSED' || year.status === 'ARCHIVED'}
              key={year.id}
              value={year.id}
            >
              {year.label} · {statusLabel(year.status)}
            </option>
          ))}
        </Select>
        <Input
          id="new-course-label"
          label="Nombre del curso"
          placeholder="8º Básico B"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Select
          id="new-course-status"
          label="Estado"
          hint={
            canCreateActive
              ? 'Puedes activar el curso ahora o dejarlo en borrador.'
              : 'Los cursos se activan después de activar su año académico.'
          }
          value={status}
          onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'ACTIVE')}
        >
          <option disabled={!canCreateActive} value="ACTIVE">
            Activo
          </option>
          <option value="DRAFT">Borrador</option>
        </Select>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        disabled={!canCreateCourse || !academicYearId || !label.trim()}
        loading={saving}
        type="submit"
      >
        Crear curso
      </Button>
    </form>
  );
}

function ActivateAcademicRecord({
  label,
  onActivate,
  onSaved,
}: {
  label: string;
  onActivate: () => Promise<unknown>;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function activate() {
    setSaving(true);
    setError(null);
    try {
      await onActivate();
      onSaved();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="academic-lifecycle-action">
      <Button
        loading={saving}
        onClick={() => void activate()}
        size="sm"
        variant="secondary"
      >
        {label}
      </Button>
      {error ? (
        <span className="form-error" role="alert">
          {errorMessage(error).message}
        </span>
      ) : null}
    </div>
  );
}

function SubjectCatalog({
  api,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editSubject, setEditSubject] = useState<
    AdminData['subjects'][number] | null
  >(null);
  const [editName, setEditName] = useState('');
  const [actionError, setActionError] = useState('');

  async function createSubjectSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createSubject({ name: name.trim() });
      setName('');
      setSuccess('La asignatura quedó disponible en el catálogo del tenant.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateSubjectSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editSubject || !editName.trim()) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.updateSubject(editSubject.id, { name: editName.trim() });
      setEditSubject(null);
      setSuccess('El nombre de la asignatura se actualizó.');
      onSaved();
    } catch (nextError) {
      setActionError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveSubject(id: string) {
    setActionError('');
    setSuccess('');
    try {
      await api.updateSubject(id, { status: 'ARCHIVED' });
      setSuccess('La asignatura se archivó y su historia quedó conservada.');
      onSaved();
    } catch (nextError) {
      setActionError(errorMessage(nextError).message);
    }
  }

  return (
    <section className="academic-panel">
      <div className="section-heading">
        <div>
          <h2>Catálogo de asignaturas</h2>
          <p>
            Catálogo base reutilizable en todos los cursos del establecimiento.
          </p>
        </div>
      </div>
      {actionError ? (
        <Alert title="Error al actualizar asignatura" tone="error">
          {actionError}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Catálogo actualizado" tone="success">
          {success}
        </Alert>
      ) : null}
      <form className="academic-form" onSubmit={createSubjectSubmit}>
        <h3>Nueva asignatura</h3>
        <div className="academic-form__fields">
          <Input
            id="subject-name"
            label="Nombre de la asignatura"
            placeholder="Ciencias Naturales"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={!name.trim()} loading={saving} type="submit">
          Crear asignatura
        </Button>
      </form>

      <div className="responsive-table">
        <table>
          <caption className="sr-only">Catálogo de asignaturas</caption>
          <thead>
            <tr>
              <th>Asignatura</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((subject) => (
              <tr key={subject.id}>
                <td data-label="Asignatura">
                  <strong>{subject.name}</strong>
                </td>
                <td data-label="Estado">
                  <Badge
                    tone={subject.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(subject.status)}
                  </Badge>
                </td>
                <td data-label="Acciones">
                  <div className="table-actions">
                    {subject.status === 'ACTIVE' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditSubject(subject);
                            setEditName(subject.name);
                          }}
                        >
                          Renombrar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void archiveSubject(subject.id)}
                        >
                          Archivar
                        </Button>
                      </>
                    ) : (
                      <small className="archived-hint">Solo lectura</small>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.subjects.length === 0 ? (
          <EmptyState
            description="Crea la primera asignatura para comenzar a armar el catálogo."
            title="Aún no hay asignaturas"
          />
        ) : null}
      </div>

      {editSubject ? (
        <Dialog
          description="Actualiza el nombre oficial de la asignatura en el catálogo."
          onOpenChange={(open) => !open && setEditSubject(null)}
          open={Boolean(editSubject)}
          title="Renombrar asignatura"
        >
          <form className="academic-form" onSubmit={updateSubjectSubmit}>
            <Input
              id="edit-subject-name"
              label="Nombre de la asignatura"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            {actionError ? (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditSubject(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!editName.trim()}
                loading={saving}
                type="submit"
              >
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

function CourseSubjectTeacherManager({
  api,
  courseSubjectId,
  teachers,
  readOnly = false,
  onUpdated,
}: {
  api: AcademicApiClient;
  courseSubjectId: string;
  teachers: AdminData['teachers'];
  readOnly?: boolean;
  onUpdated: () => void;
}) {
  const [assigned, setAssigned] = useState<
    Awaited<ReturnType<AcademicApiClient['getAssignedTeachers']>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const reloadAssigned = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await api.getAssignedTeachers(courseSubjectId);
      setAssigned(list);
    } catch (nextError) {
      setLoadError(errorMessage(nextError).message);
    } finally {
      setLoading(false);
    }
  }, [api, courseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reloadAssigned(), 0);
    return () => window.clearTimeout(timer);
  }, [reloadAssigned]);

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!selectedTeacherId || readOnly) return;
    setBusy(true);
    setError('');
    try {
      await api.assignCourseSubjectTeachers({
        courseSubjectId,
        teacherIds: [selectedTeacherId],
      });
      setSelectedTeacherId('');
      await reloadAssigned();
      onUpdated();
    } catch (err) {
      setError(errorMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (readOnly) return;
    setBusy(true);
    setError('');
    try {
      await api.deactivateTeacherAssignment(assignmentId);
      await reloadAssigned();
      onUpdated();
    } catch (err) {
      setError(errorMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  const assignedTeacherIds = new Set(assigned.map((a) => a.teacherId));
  const availableTeachers = teachers.filter(
    (t) => t.status === 'ACTIVE' && !assignedTeacherIds.has(t.id),
  );

  return (
    <div className="course-subject-teachers">
      <h4>Profesores asignados</h4>
      {loadError ? (
        <Alert
          action={
            <Button onClick={() => void reloadAssigned()} variant="secondary">
              Reintentar
            </Button>
          }
          title="No pudimos cargar las responsabilidades"
          tone="error"
        >
          {loadError}
        </Alert>
      ) : null}
      {loading ? (
        <Skeleton />
      ) : assigned.length ? (
        <ul className="teacher-badge-list">
          {assigned.map((item) => (
            <li key={item.id} className="teacher-assignment-chip">
              <span>
                {item.teacher
                  ? `${item.teacher.firstName} ${item.teacher.lastName}`
                  : item.teacherId}
              </span>
              <button
                aria-label={`Desasignar a ${item.teacher?.firstName ?? 'profesor'}`}
                className="chip-remove-button"
                disabled={busy || readOnly}
                type="button"
                onClick={() => void handleUnassign(item.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : loadError ? null : (
        <p className="empty-subtext">Sin profesores asignados actualmente.</p>
      )}

      {availableTeachers.length > 0 && !readOnly ? (
        <form className="assign-teacher-inline" onSubmit={handleAssign}>
          <Select
            id={`assign-teacher-${courseSubjectId}`}
            label="Asignar profesor"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
          >
            <option value="">Selecciona un profesor</option>
            {availableTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </Select>
          <Button
            disabled={!selectedTeacherId || busy}
            loading={busy}
            size="sm"
            type="submit"
          >
            Asignar
          </Button>
        </form>
      ) : null}
      {readOnly ? (
        <p className="empty-subtext">
          El año o curso está cerrado; las asignaciones existentes se conservan
          y no se pueden modificar.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CourseSubjectManagement({
  api,
  data,
  selectedCourse,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  selectedCourse: AdminData['courses'][number];
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState('');
  const [defaultForCourse, setDefaultForCourse] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editItem, setEditItem] = useState<
    AdminData['courseSubjects'][number] | null
  >(null);
  const [editDefault, setEditDefault] = useState(true);
  const [editSortOrder, setEditSortOrder] = useState('0');

  const courseSubjects = data.courseSubjects.filter(
    (cs) => cs.courseId === selectedCourse.id,
  );
  const courseYear = data.academicYears.find(
    (year) => year.id === selectedCourse.academicYearId,
  );
  const canMutate = Boolean(
    courseYear &&
    !['CLOSED', 'ARCHIVED'].includes(courseYear.status) &&
    selectedCourse.status !== 'ARCHIVED',
  );
  const readOnlyMessage =
    courseYear?.status === 'CLOSED' || courseYear?.status === 'ARCHIVED'
      ? 'El año académico está cerrado o archivado. Puedes consultar la configuración, pero no modificarla.'
      : 'El curso está archivado. Puedes consultar la historia, pero no modificarla.';
  const existingSubjectIds = new Set(
    courseSubjects
      .filter((cs) => cs.status === 'ACTIVE')
      .map((cs) => cs.subjectId),
  );
  const availableSubjects = data.subjects.filter(
    (s) => s.status === 'ACTIVE' && !existingSubjectIds.has(s.id),
  );

  async function handleAddCourseSubject(event: FormEvent) {
    event.preventDefault();
    if (!subjectId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createCourseSubject({
        courseId: selectedCourse.id,
        subjectId,
        defaultForCourse,
        sortOrder: parseInt(sortOrder, 10) || 0,
      });
      setSubjectId('');
      setSortOrder('0');
      setSuccess('La asignatura quedó asociada a este curso.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCourseSubject(event: FormEvent) {
    event.preventDefault();
    if (!editItem) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateCourseSubject(editItem.id, {
        defaultForCourse: editDefault,
        sortOrder: parseInt(editSortOrder, 10) || 0,
      });
      setEditItem(null);
      setSuccess('La configuración de la asignatura se actualizó.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveCourseSubject(id: string) {
    setError('');
    setSuccess('');
    try {
      await api.updateCourseSubject(id, { status: 'ARCHIVED' });
      setSuccess('La asociación se archivó y su historia quedó conservada.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    }
  }

  return (
    <div className="course-subjects-container">
      <div className="section-subheading">
        <h3>Asignaturas de {selectedCourse.label}</h3>
        <p>
          Configura las asignaturas impartidas en este curso, su orden y
          profesores a cargo.
        </p>
      </div>

      {!canMutate ? (
        <Alert title="Configuración en solo lectura" tone="warning">
          {readOnlyMessage}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Asociación actualizada" tone="success">
          {success}
        </Alert>
      ) : null}

      <form className="academic-form" onSubmit={handleAddCourseSubject}>
        <h3>Agregar asignatura al curso</h3>
        <div className="academic-form__fields">
          <Select
            id="add-subject-select"
            label="Asignatura del catálogo"
            required
            disabled={!canMutate}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Selecciona una asignatura</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            id="course-subject-sort-order"
            label="Orden de presentación"
            min="0"
            disabled={!canMutate}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <Checkbox
          checked={defaultForCourse}
          description="Todos los alumnos inscritos en este curso cursarán esta asignatura por defecto."
          disabled={!canMutate}
          id="course-subject-default"
          label="Asignación general para todos los alumnos del curso"
          onChange={(e) => setDefaultForCourse(e.target.checked)}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          disabled={!subjectId || saving || !canMutate}
          loading={saving}
          type="submit"
        >
          Agregar asignatura al curso
        </Button>
      </form>

      <div className="course-subjects-list">
        {courseSubjects.map((cs) => {
          const subjectName =
            cs.subject?.name ??
            data.subjects.find((s) => s.id === cs.subjectId)?.name ??
            'Asignatura';
          return (
            <Card key={cs.id} className="course-subject-card">
              <div className="course-subject-card__header">
                <div>
                  <h4>{subjectName}</h4>
                  <div className="course-subject-meta">
                    <Badge tone={cs.defaultForCourse ? 'info' : 'neutral'}>
                      {cs.defaultForCourse
                        ? 'General del curso'
                        : 'Asignación directa'}
                    </Badge>
                    <Badge
                      tone={cs.status === 'ACTIVE' ? 'success' : 'neutral'}
                    >
                      {statusLabel(cs.status)}
                    </Badge>
                    <span className="sort-order-tag">
                      Orden: {cs.sortOrder}
                    </span>
                  </div>
                </div>
                <div className="card-header-actions">
                  {cs.status === 'ACTIVE' ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canMutate}
                        onClick={() => {
                          setEditItem(cs);
                          setEditDefault(cs.defaultForCourse);
                          setEditSortOrder(String(cs.sortOrder));
                        }}
                      >
                        Configurar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canMutate}
                        onClick={() => void handleArchiveCourseSubject(cs.id)}
                      >
                        Archivar
                      </Button>
                    </>
                  ) : (
                    <small className="archived-hint">Archivado</small>
                  )}
                </div>
              </div>

              {cs.status === 'ACTIVE' ? (
                <CourseSubjectTeacherManager
                  api={api}
                  courseSubjectId={cs.id}
                  readOnly={!canMutate}
                  teachers={data.teachers}
                  onUpdated={onSaved}
                />
              ) : null}
            </Card>
          );
        })}
        {courseSubjects.length === 0 ? (
          <EmptyState
            description="Este curso aún no tiene asignaturas asignadas. Elige una del catálogo arriba."
            title="Sin asignaturas en este curso"
          />
        ) : null}
      </div>

      {editItem ? (
        <Dialog
          description="Modifica la configuración de la asignatura en este curso."
          onOpenChange={(open) => !open && setEditItem(null)}
          open={Boolean(editItem)}
          title="Configurar asignatura del curso"
        >
          <form className="academic-form" onSubmit={handleUpdateCourseSubject}>
            <Input
              id="edit-cs-sort"
              label="Orden de presentación"
              min="0"
              type="number"
              value={editSortOrder}
              onChange={(e) => setEditSortOrder(e.target.value)}
            />
            <Checkbox
              checked={editDefault}
              description="Habilita la asignatura para todos los alumnos del curso."
              id="edit-cs-default"
              label="Asignación general del curso"
              onChange={(e) => setEditDefault(e.target.checked)}
            />
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditItem(null)}>
                Cancelar
              </Button>
              <Button loading={saving} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function CourseRoster({
  api,
  course,
}: {
  api: AcademicApiClient;
  course: AdminData['courses'][number];
}) {
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

  const rosterIsCurrent = rosterContextId === course.id;
  const errorIsCurrent = errorContextId === course.id && Boolean(error);
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
      <EmptyState
        description={`Todavía no hay alumnos inscritos en ${course.label}.`}
        title="Roster vacío"
      />
    );

  return (
    <>
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
                    <Badge tone="neutral">Registro manual</Badge>
                  )}
                </td>
                <td data-label="Estado">
                  <Badge tone="success">Activo</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function SubjectCoverageSummary({
  activeSubjectCount,
  coursesWithoutSubjects,
  selectedYear,
  subjectCounts,
  totalCourses,
  onSelectCourse,
  onOpenAssociations,
}: {
  activeSubjectCount: number;
  coursesWithoutSubjects: AdminData['courses'];
  selectedYear: AdminData['academicYears'][number] | undefined;
  subjectCounts: Map<string, number>;
  totalCourses: number;
  onSelectCourse: (courseId: string) => void;
  onOpenAssociations: () => void;
}) {
  const [pendingPageIndex, setPendingPageIndex] = useState(0);
  const pendingPageSize = 25;
  const pendingPageCount = Math.max(
    1,
    Math.ceil(coursesWithoutSubjects.length / pendingPageSize),
  );
  const visiblePendingPageIndex = Math.min(
    pendingPageIndex,
    pendingPageCount - 1,
  );
  const visiblePendingCourses = coursesWithoutSubjects.slice(
    visiblePendingPageIndex * pendingPageSize,
    (visiblePendingPageIndex + 1) * pendingPageSize,
  );

  if (!selectedYear) {
    return (
      <section
        aria-labelledby="academic-subject-progress-title"
        className="academic-panel academic-subject-progress-panel"
      >
        <div className="section-heading">
          <div>
            <h2 id="academic-subject-progress-title">Asignaturas del año</h2>
            <p>
              Selecciona un año académico para revisar sus cursos y las
              asociaciones existentes.
            </p>
          </div>
          <Badge tone="neutral">Sin contexto</Badge>
        </div>
      </section>
    );
  }

  if (totalCourses === 0) {
    return (
      <section
        aria-labelledby="academic-subject-progress-title"
        className="academic-panel academic-subject-progress-panel"
      >
        <div className="section-heading">
          <div>
            <h2 id="academic-subject-progress-title">
              Asignaturas del año {selectedYear.label}
            </h2>
            <p>
              Cuando existan cursos en este año podrás revisar sus asociaciones
              de asignaturas desde aquí.
            </p>
          </div>
          <Badge tone="neutral">Sin cursos en este año</Badge>
        </div>
        <p className="academic-subject-progress-confirmation" role="status">
          Sin cursos en este año.
        </p>
      </section>
    );
  }

  const pendingCount = coursesWithoutSubjects.length;

  return (
    <section
      aria-labelledby="academic-subject-progress-title"
      className="academic-panel academic-subject-progress-panel"
    >
      <div className="section-heading">
        <div>
          <h2 id="academic-subject-progress-title">
            Asignaturas del año {selectedYear.label}
          </h2>
          <p>
            Seguimiento de asociaciones activas por curso. Este avance es
            independiente del indicador de estructura base y no define
            asignaturas obligatorias para el colegio.
          </p>
        </div>
        <Badge tone={pendingCount ? 'warning' : 'success'}>
          {pendingCount
            ? `${pendingCount} curso${pendingCount === 1 ? '' : 's'} por revisar`
            : 'Sin pendientes en este corte'}
        </Badge>
      </div>

      <div
        aria-label="Resumen de asignaturas del año"
        className="academic-subject-progress-summary"
      >
        <div>
          <strong>{activeSubjectCount}</strong>
          <span>asignaturas activas en el catálogo</span>
        </div>
        <div>
          <strong>{totalCourses}</strong>
          <span>cursos en este año</span>
        </div>
        <div>
          <strong>{totalCourses - pendingCount}</strong>
          <span>cursos con al menos una asociación activa</span>
        </div>
      </div>

      {pendingCount ? (
        <div className="academic-subject-progress-pending" role="list">
          <div>
            <h3>Acciones pendientes en este año</h3>
            <p>
              Revisa cada curso sin asociación activa. Las asociaciones
              archivadas siguen formando parte de la historia.
            </p>
          </div>
          {visiblePendingCourses.map((course) => (
            <div
              className="academic-subject-progress-row"
              key={course.id}
              role="listitem"
            >
              <div>
                <strong>{course.label}</strong>
                <span>
                  {statusLabel(course.status)} · Sin asociaciones activas
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onSelectCourse(course.id);
                  onOpenAssociations();
                }}
              >
                Configurar curso <Icon name="chevron-right" />
              </Button>
            </div>
          ))}
          {pendingCount > pendingPageSize ? (
            <div className="pagination-bar">
              <span className="pagination-info">
                Página {visiblePendingPageIndex + 1} de {pendingPageCount} ·{' '}
                {pendingCount} cursos
              </span>
              <div className="provisioning-actions">
                <Button
                  disabled={visiblePendingPageIndex === 0}
                  onClick={() =>
                    setPendingPageIndex(visiblePendingPageIndex - 1)
                  }
                  variant="secondary"
                >
                  Anterior
                </Button>
                <Button
                  disabled={visiblePendingPageIndex >= pendingPageCount - 1}
                  onClick={() =>
                    setPendingPageIndex(visiblePendingPageIndex + 1)
                  }
                  variant="secondary"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="academic-subject-progress-confirmation" role="status">
          Cada curso de este contexto tiene al menos una asignatura asociada.
          Puedes seguir ajustando orden, alcance y profesores desde “Asignaturas
          del Curso”.
        </p>
      )}

      {totalCourses > 0 ? (
        <p className="integration-note">
          <Icon name="layers" />
          Asociaciones activas en el contexto:{' '}
          {Array.from(subjectCounts.values()).reduce(
            (total, count) => total + count,
            0,
          )}
        </p>
      ) : null}
    </section>
  );
}

interface AdminTabOption<T extends string> {
  label: ReactNode;
  value: T;
}

function AdminTabList<T extends string>({
  idPrefix,
  label,
  onSelect,
  options,
  selected,
}: {
  idPrefix: string;
  label: string;
  onSelect(value: T): void;
  options: AdminTabOption<T>[];
  selected: T;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = options.length - 1;
    else return;

    event.preventDefault();
    const next = options[nextIndex];
    if (!next) return;
    onSelect(next.value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div aria-label={label} className="admin-tabs-nav" role="tablist">
      {options.map((option, index) => (
        <button
          aria-selected={selected === option.value}
          className={`admin-tab-button ${selected === option.value ? 'admin-tab-button--active' : ''}`}
          id={`${idPrefix}-tab-${option.value}`}
          key={option.value}
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          role="tab"
          tabIndex={selected === option.value ? 0 : -1}
          type="button"
          onClick={() => onSelect(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StructureView({
  api,
  data,
  onSaved,
  onRetryPreparation,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
  onRetryPreparation: () => void;
}) {
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [coursePageIndex, setCoursePageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<
    'years-courses' | 'subjects' | 'course-subjects'
  >('years-courses');
  const availableYears = useMemo(
    () => data.academicYears.filter((year) => year.status !== 'ARCHIVED'),
    [data.academicYears],
  );
  const resolvedSelectedYearId = availableYears.some(
    (year) => year.id === selectedYearId,
  )
    ? selectedYearId
    : preferredAcademicYearId(data);
  const selectedYear = data.academicYears.find(
    (year) => year.id === resolvedSelectedYearId,
  );
  const scopedCourses = useMemo(
    () =>
      data.courses.filter(
        (course) =>
          course.academicYearId === resolvedSelectedYearId &&
          course.status !== 'ARCHIVED',
      ),
    [data.courses, resolvedSelectedYearId],
  );
  const resolvedSelectedCourseId = scopedCourses.some(
    (course) => course.id === selectedCourseId,
  )
    ? selectedCourseId
    : (scopedCourses[0]?.id ?? '');
  const selectedCourse = scopedCourses.find(
    (course) => course.id === resolvedSelectedCourseId,
  );
  const coursePageSize = 25;
  const coursePageCount = Math.max(
    1,
    Math.ceil(data.courses.length / coursePageSize),
  );
  const visibleCoursePageIndex = Math.min(coursePageIndex, coursePageCount - 1);
  const visibleCourses = data.courses.slice(
    visibleCoursePageIndex * coursePageSize,
    (visibleCoursePageIndex + 1) * coursePageSize,
  );
  const subjectCounts = useMemo(
    () =>
      new Map(
        scopedCourses.map((course) => [
          course.id,
          data.courseSubjects.filter(
            (courseSubject) =>
              courseSubject.courseId === course.id &&
              courseSubject.status === 'ACTIVE',
          ).length,
        ]),
      ),
    [data.courseSubjects, scopedCourses],
  );
  const coursesWithoutSubjects = scopedCourses.filter(
    (course) => (subjectCounts.get(course.id) ?? 0) === 0,
  );

  const activeSubjectCount = data.subjects.filter(
    (subject) => subject.status === 'ACTIVE',
  ).length;

  return (
    <div className="academic-stack academic-structure-stack">
      <details className="academic-preparation-disclosure">
        <summary>
          <span className="academic-preparation-disclosure__copy">
            <strong>Preparación académica base</strong>
            <small>
              Evalúa años y cursos; no asignaturas, personas ni matrículas.
            </small>
          </span>
          <Badge tone={data.academicPreparation?.ready ? 'success' : 'warning'}>
            {data.academicPreparation?.ready
              ? 'Preparada'
              : data.academicPreparation
                ? 'Requiere atención'
                : 'Sin validar'}
          </Badge>
          <span className="academic-preparation-disclosure__action">
            Ver detalle <Icon name="chevron-down" />
          </span>
        </summary>
        <div className="academic-preparation-disclosure__content">
          <AcademicPreparationPanel data={data} onRetry={onRetryPreparation} />
        </div>
      </details>
      <section
        aria-labelledby="academic-structure-scope-title"
        className="academic-panel academic-structure-scope"
      >
        <div className="section-heading">
          <div>
            <h2 id="academic-structure-scope-title">
              Contexto de configuración
            </h2>
            <p>Las asociaciones usan este año y curso.</p>
          </div>
          <Badge
            tone={selectedYear?.status === 'ACTIVE' ? 'success' : 'neutral'}
          >
            {selectedYear ? statusLabel(selectedYear.status) : 'Sin año'}
          </Badge>
        </div>
        <div className="academic-form__fields academic-structure-scope__fields">
          <Select
            id="academic-structure-scope-year"
            label="Año académico"
            value={resolvedSelectedYearId}
            onChange={(event) => {
              setSelectedYearId(event.target.value);
              setSelectedCourseId('');
            }}
          >
            <option value="">Selecciona un año</option>
            {availableYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label} · {statusLabel(year.status)}
              </option>
            ))}
          </Select>
          <Select
            disabled={!scopedCourses.length}
            hint={selectedYear ? undefined : 'Primero selecciona un año.'}
            id="academic-structure-scope-course"
            label="Curso"
            value={resolvedSelectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
          >
            <option value="">Selecciona un curso</option>
            {scopedCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
          </Select>
        </div>
        {selectedYear?.status === 'CLOSED' ||
        selectedYear?.status === 'ARCHIVED' ? (
          <p className="integration-note">
            <Icon name="archive" />
            Este año es de solo lectura. Su historia se conserva sin permitir
            nuevas asociaciones.
          </p>
        ) : null}
      </section>
      <AdminTabList<'years-courses' | 'subjects' | 'course-subjects'>
        idPrefix="admin-structure"
        label="Secciones de estructura académica"
        onSelect={setActiveTab}
        options={[
          { value: 'years-courses', label: 'Años y Cursos' },
          { value: 'subjects', label: 'Catálogo de Asignaturas' },
          { value: 'course-subjects', label: 'Asignaturas del Curso' },
        ]}
        selected={activeTab}
      />

      {activeTab === 'years-courses' ? (
        <div
          aria-labelledby="admin-structure-tab-years-courses"
          className="admin-tab-panel"
          id="admin-structure-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <>
            <section className="academic-panel">
              <div className="section-heading">
                <div>
                  <h2>Años académicos</h2>
                  <p>
                    Periodos lectivos del establecimiento. Los años cerrados o
                    archivados se conservan para auditoría.
                  </p>
                </div>
              </div>
              <AcademicYearForm api={api} onSaved={onSaved} />
              <div className="responsive-table">
                <table>
                  <caption className="sr-only">Años académicos</caption>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Periodo</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.academicYears.map((year) => (
                      <tr key={year.id}>
                        <td data-label="Nombre">
                          <strong>{year.label}</strong>
                        </td>
                        <td data-label="Periodo">
                          {year.startDate} → {year.endDate}
                        </td>
                        <td data-label="Estado">
                          <Badge
                            tone={
                              year.status === 'ACTIVE' ? 'success' : 'neutral'
                            }
                          >
                            {statusLabel(year.status)}
                          </Badge>
                        </td>
                        <td data-label="Acción">
                          {year.status === 'DRAFT' ? (
                            <ActivateAcademicRecord
                              label="Activar año"
                              onActivate={() =>
                                api.updateAcademicYear(year.id, {
                                  status: 'ACTIVE',
                                })
                              }
                              onSaved={onSaved}
                            />
                          ) : (
                            <span className="table-muted">Sin acción</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.academicYears.length === 0 ? (
                  <EmptyState
                    description="Crea el primer año académico para comenzar a configurar cursos."
                    title="Aún no hay años"
                  />
                ) : null}
              </div>
            </section>

            <section className="academic-panel">
              <div className="section-heading">
                <div>
                  <h2>Cursos y roster</h2>
                  <p>
                    Cursos organizados por año académico y su lista de alumnos
                    inscritos.
                  </p>
                </div>
              </div>
              <CourseForm api={api} data={data} onSaved={onSaved} />
              {data.courses.length ? (
                <div className="course-readiness-list">
                  <div className="course-readiness-list__heading">
                    <div>
                      <h3>Cursos creados</h3>
                      <p>
                        Activa los cursos después de activar su año académico.
                      </p>
                    </div>
                    <span>{data.courses.length} total</span>
                  </div>
                  {visibleCourses.map((course) => {
                    const courseYear = data.academicYears.find(
                      (year) => year.id === course.academicYearId,
                    );
                    const yearIsReadOnly =
                      !courseYear ||
                      courseYear.status === 'CLOSED' ||
                      courseYear.status === 'ARCHIVED';
                    const canActivateCourse =
                      course.status === 'DRAFT' &&
                      course.source !== 'EDUPAY' &&
                      courseYear?.status === 'ACTIVE';
                    return (
                      <div className="course-readiness-row" key={course.id}>
                        <div>
                          <strong>{course.label}</strong>
                          <span>
                            {courseYear?.label ?? 'Año no disponible'}
                            {course.source === 'EDUPAY' ? ' · EduPay' : ''}
                          </span>
                        </div>
                        <Badge
                          tone={
                            course.status === 'ACTIVE' ? 'success' : 'neutral'
                          }
                        >
                          {statusLabel(course.status)}
                        </Badge>
                        {canActivateCourse ? (
                          <ActivateAcademicRecord
                            label="Activar curso"
                            onActivate={() =>
                              api.updateCourse(course.id, { status: 'ACTIVE' })
                            }
                            onSaved={onSaved}
                          />
                        ) : (
                          <span className="table-muted">
                            {yearIsReadOnly
                              ? 'Solo lectura'
                              : course.status === 'DRAFT' &&
                                  courseYear?.status === 'DRAFT'
                                ? 'Activa el año primero'
                                : 'Sin acción'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {data.courses.length > coursePageSize ? (
                    <div className="pagination-bar">
                      <span className="pagination-info">
                        Página {visibleCoursePageIndex + 1} de {coursePageCount}{' '}
                        · {data.courses.length} cursos
                      </span>
                      <div className="provisioning-actions">
                        <Button
                          disabled={visibleCoursePageIndex === 0}
                          onClick={() =>
                            setCoursePageIndex(visibleCoursePageIndex - 1)
                          }
                          variant="secondary"
                        >
                          Anterior
                        </Button>
                        <Button
                          disabled={
                            visibleCoursePageIndex >= coursePageCount - 1
                          }
                          onClick={() =>
                            setCoursePageIndex(visibleCoursePageIndex + 1)
                          }
                          variant="secondary"
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {selectedCourse ? (
                <>
                  <p className="course-context-note">
                    <Icon name="layers" />
                    Roster del curso en contexto:{' '}
                    <strong>{selectedCourse.label}</strong>
                  </p>
                  <CourseRoster
                    api={api}
                    course={selectedCourse}
                    key={selectedCourse.id}
                  />
                </>
              ) : (
                <EmptyState
                  description="Elige un año y un curso en el contexto de configuración para revisar su roster."
                  title="Selecciona un curso"
                />
              )}
            </section>
          </>
        </div>
      ) : null}

      {activeTab === 'subjects' ? (
        <div
          aria-labelledby="admin-structure-tab-subjects"
          className="admin-tab-panel"
          id="admin-structure-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <SubjectCatalog api={api} data={data} onSaved={onSaved} />
        </div>
      ) : null}

      {activeTab === 'course-subjects' ? (
        <div
          aria-labelledby="admin-structure-tab-course-subjects"
          className="admin-tab-panel"
          id="admin-structure-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <SubjectCoverageSummary
            activeSubjectCount={activeSubjectCount}
            coursesWithoutSubjects={coursesWithoutSubjects}
            onOpenAssociations={() => setActiveTab('course-subjects')}
            onSelectCourse={setSelectedCourseId}
            selectedYear={selectedYear}
            subjectCounts={subjectCounts}
            totalCourses={scopedCourses.length}
          />
          <section className="academic-panel">
            <div className="section-heading">
              <div>
                <h2>Asignaturas por curso</h2>
                <p>
                  Asocia asignaturas a cada curso específico y asigna a los
                  profesores responsables.
                </p>
              </div>
            </div>
            {selectedCourse ? (
              <CourseSubjectManagement
                api={api}
                data={data}
                selectedCourse={selectedCourse}
                onSaved={onSaved}
              />
            ) : (
              <EmptyState
                description="Selecciona un curso para gestionar sus asignaturas."
                title="Sin curso seleccionado"
              />
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PersonForm({
  api,
  kind,
  onSaved,
}: {
  api: AcademicApiClient;
  kind: 'student' | 'teacher';
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (kind === 'student') {
        await api.createStudent({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
        });
      } else {
        await api.createTeacher({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
        });
      }
      setFirstName('');
      setLastName('');
      setEmail('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>{kind === 'student' ? 'Nuevo alumno manual' : 'Nuevo profesor'}</h3>
      <div className="academic-form__fields">
        <Input
          id={`${kind}-first-name`}
          label="Nombres"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Input
          id={`${kind}-last-name`}
          label="Apellidos"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <Input
          id={`${kind}-email`}
          label="Correo electrónico (opcional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        disabled={!firstName.trim() || !lastName.trim()}
        loading={saving}
        type="submit"
      >
        {kind === 'student' ? 'Crear alumno manual' : 'Crear profesor'}
      </Button>
    </form>
  );
}

function StudentsView({
  api,
  initialStudents,
  initialCursor,
  initialTotalCount,
  identityActions,
  onSaved,
}: {
  api: AcademicApiClient;
  initialStudents: AdminData['students'];
  initialCursor?: string | null | undefined;
  initialTotalCount?: number | undefined;
  identityActions?: AccountProvisioningActions | undefined;
  onSaved: () => void;
}) {
  const [pageStudents, setPageStudents] = useState<
    AdminData['students'] | null
  >(null);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(
    initialCursor,
  );
  const [totalCount, setTotalCount] = useState<number | undefined>(
    initialTotalCount,
  );
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [paginationError, setPaginationError] = useState('');
  const [loadingPage, setLoadingPage] = useState(false);
  const searchSequence = useRef(0);
  const [editStudent, setEditStudent] = useState<
    AdminData['students'][number] | null
  >(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const displayedStudents = pageStudents ?? initialStudents;
  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / 50));

  const handleSearch = useCallback(
    async (query: string) => {
      const sequence = ++searchSequence.current;
      const normalizedQuery = query.trim();
      setSearchError('');
      setPaginationError('');
      setLoadingPage(false);
      if (!normalizedQuery) {
        setPageStudents(null);
        setNextCursor(initialCursor);
        setTotalCount(initialTotalCount);
        setPageCursors([undefined]);
        setPageIndex(0);
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const res = await api.listStudents(normalizedQuery);
        if (sequence === searchSequence.current) {
          setPageStudents(res.items);
          setNextCursor(res.nextCursor);
          setTotalCount(res.totalCount);
          setPageCursors([undefined]);
          setPageIndex(0);
        }
      } catch (error) {
        if (sequence === searchSequence.current)
          setSearchError(errorMessage(error).message);
      } finally {
        if (sequence === searchSequence.current) setSearching(false);
      }
    },
    [api, initialCursor, initialTotalCount],
  );

  async function handlePageChange(direction: 'previous' | 'next') {
    const cursor =
      direction === 'next'
        ? (nextCursor ?? undefined)
        : pageCursors[pageIndex - 1];
    if (direction === 'next' && !cursor) return;
    if (direction === 'previous' && pageIndex === 0) return;
    const targetPageIndex = pageIndex + (direction === 'next' ? 1 : -1);
    const sequence = ++searchSequence.current;
    const query = searchTerm.trim();
    setLoadingPage(true);
    setPaginationError('');
    try {
      const res = await api.listStudents(query || undefined, cursor);
      if (sequence === searchSequence.current) {
        setPageStudents(res.items);
        setNextCursor(res.nextCursor);
        setTotalCount(res.totalCount);
        setPageCursors((current) => [
          ...current.slice(0, targetPageIndex),
          cursor,
        ]);
        setPageIndex(targetPageIndex);
      }
    } catch (error) {
      if (sequence === searchSequence.current)
        setPaginationError(errorMessage(error).message);
    } finally {
      if (sequence === searchSequence.current) setLoadingPage(false);
    }
  }

  async function handleUpdateStudent(e: FormEvent) {
    e.preventDefault();
    if (!editStudent) return;
    setSavingEdit(true);
    setEditError('');
    try {
      if (editStudent.source === 'EDUPAY') {
        // Name is managed by EduPay; only email can be modified
        await api.updateStudent(editStudent.id, {
          email: editEmail.trim() || null,
        });
      } else {
        await api.updateStudent(editStudent.id, {
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          email: editEmail.trim() || null,
        });
      }
      setEditStudent(null);
      onSaved();
    } catch (err) {
      setEditError(errorMessage(err).message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="people-subview">
      <div className="section-heading">
        <div>
          <h2>Alumnos</h2>
          <p>
            Alumnos sincronizados desde EduPay y registros locales. Puedes crear
            y vincular acceso a la plataforma sin duplicar fichas.
          </p>
        </div>
      </div>

      <details className="admin-create-disclosure">
        <summary>
          <span>
            <strong>Incorporar alumno</strong>
            <small>Crear una ficha manual; el correo es opcional.</small>
          </span>
          <span className="admin-create-disclosure__action">Nuevo alumno</span>
        </summary>
        <PersonForm api={api} kind="student" onSaved={onSaved} />
      </details>

      <div className="search-filter-toolbar">
        <div className="search-input-wrapper">
          <Input
            id="student-search-input"
            label="Buscar alumno"
            placeholder="Buscar por nombre, apellido, correo o identificador..."
            aria-busy={searching}
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              void handleSearch(val);
            }}
          />
        </div>
        {searching ? (
          <span
            aria-live="polite"
            className="searching-indicator"
            role="status"
          >
            Buscando alumnos…
          </span>
        ) : null}
      </div>
      {searchError ? (
        <Alert title="No pudimos buscar alumnos" tone="error">
          {searchError}
        </Alert>
      ) : null}
      {paginationError ? (
        <Alert title="No pudimos cambiar de página" tone="error">
          {paginationError}
        </Alert>
      ) : null}

      <div className="responsive-table">
        <table>
          <caption className="sr-only">Listado de alumnos</caption>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Correo</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Acceso Identity</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayedStudents.map((student) => (
              <tr key={student.id}>
                <td data-label="Alumno">
                  <strong>
                    {student.firstName} {student.lastName}
                  </strong>
                </td>
                <td data-label="Correo">{student.email ?? 'Sin correo'}</td>
                <td data-label="Origen">
                  {student.source === 'EDUPAY' ? (
                    <Badge tone="info">Gestionado por EduPay</Badge>
                  ) : (
                    <Badge tone="neutral">Registro manual</Badge>
                  )}
                </td>
                <td data-label="Estado">
                  <Badge
                    tone={student.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(student.status)}
                  </Badge>
                </td>
                <td data-label="Acceso Identity">
                  <AccountProvisioning
                    api={api}
                    identityActions={identityActions}
                    kind="student"
                    person={student}
                    onLinked={onSaved}
                  />
                </td>
                <td data-label="Acciones">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditStudent(student);
                      setEditFirstName(student.firstName);
                      setEditLastName(student.lastName);
                      setEditEmail(student.email ?? '');
                      setEditError('');
                    }}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayedStudents.length === 0 ? (
          <EmptyState
            description={
              searchTerm
                ? 'No se encontraron alumnos que coincidan con la búsqueda.'
                : 'Aún no hay alumnos registrados.'
            }
            title="Sin alumnos"
          />
        ) : null}
      </div>

      {displayedStudents.length > 0 ? (
        <div className="pagination-bar">
          <span className="pagination-info">
            {totalCount !== undefined
              ? `${totalCount} ${searchTerm.trim() ? 'resultados' : 'alumnos'} · `
              : ''}
            Página {pageIndex + 1} de {totalPages}
          </span>
          <div className="provisioning-actions">
            <Button
              disabled={pageIndex === 0 || loadingPage || searching}
              loading={loadingPage && pageIndex > 0}
              variant="secondary"
              onClick={() => void handlePageChange('previous')}
            >
              Anterior
            </Button>
            <Button
              disabled={!nextCursor || loadingPage || searching}
              loading={loadingPage && Boolean(nextCursor)}
              variant="secondary"
              onClick={() => void handlePageChange('next')}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      {editStudent ? (
        <Dialog
          description={
            editStudent.source === 'EDUPAY'
              ? 'Los nombres son autoritativos desde EduPay y no se pueden modificar. Puedes actualizar el correo de contacto.'
              : 'Edita los datos del alumno registrado manualmente.'
          }
          onOpenChange={(open) => !open && setEditStudent(null)}
          open={Boolean(editStudent)}
          title="Editar alumno"
        >
          <form className="academic-form" onSubmit={handleUpdateStudent}>
            {editStudent.source === 'EDUPAY' ? (
              <Alert title="Registro gestionado por EduPay" tone="info">
                El nombre y apellido provienen de la sincronización con EduPay y
                se mantienen protegidos contra sobreescritura accidental.
              </Alert>
            ) : null}
            {editStudent.identityUserId ? (
              <Alert title="Cuenta vinculada con Identity" tone="info">
                Esta cuenta ya tiene acceso de Identity vinculado. El correo de
                inicio de sesión es gestionado autoritativamente por Identity y
                no puede modificarse de forma desacoplada desde Académico.
              </Alert>
            ) : null}
            <Input
              disabled={editStudent.source === 'EDUPAY'}
              id="edit-student-firstname"
              label="Nombres"
              required
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
            />
            <Input
              disabled={editStudent.source === 'EDUPAY'}
              id="edit-student-lastname"
              label="Apellidos"
              required
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
            />
            <Input
              disabled={Boolean(editStudent.identityUserId)}
              id="edit-student-email"
              label="Correo electrónico"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditStudent(null)}>
                Cancelar
              </Button>
              <Button loading={savingEdit} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function TeachersView({
  api,
  initialTeachers,
  initialCursor,
  initialTotalCount,
  identityActions,
  onSaved,
}: {
  api: AcademicApiClient;
  initialTeachers: AdminData['teachers'];
  initialCursor?: string | null | undefined;
  initialTotalCount?: number | undefined;
  identityActions?: AccountProvisioningActions | undefined;
  onSaved: () => void;
}) {
  const [queriedTeachers, setQueriedTeachers] = useState<
    AdminData['teachers'] | null
  >(null);
  const [queriedCursor, setQueriedCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [queriedTotalCount, setQueriedTotalCount] = useState<
    number | undefined
  >(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [paginationError, setPaginationError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const searchSequence = useRef(0);
  const [editTeacher, setEditTeacher] = useState<
    AdminData['teachers'][number] | null
  >(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const displayedTeachers = queriedTeachers ?? initialTeachers;
  const currentCursor =
    queriedTeachers !== null ? queriedCursor : initialCursor;
  const currentTotalCount =
    queriedTeachers !== null ? queriedTotalCount : initialTotalCount;

  const handleSearch = useCallback(
    async (query: string) => {
      const sequence = ++searchSequence.current;
      const normalizedQuery = query.trim();
      setSearchError('');
      setPaginationError('');
      setLoadingMore(false);
      if (!normalizedQuery) {
        setQueriedTeachers(null);
        setQueriedCursor(undefined);
        setQueriedTotalCount(undefined);
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const res = await api.listTeachers(normalizedQuery);
        if (sequence === searchSequence.current) {
          setQueriedTeachers(res.items);
          setQueriedCursor(res.nextCursor);
          setQueriedTotalCount(res.totalCount);
        }
      } catch (error) {
        if (sequence === searchSequence.current)
          setSearchError(errorMessage(error).message);
      } finally {
        if (sequence === searchSequence.current) setSearching(false);
      }
    },
    [api],
  );

  async function handleLoadMore() {
    if (!currentCursor) return;
    const sequence = searchSequence.current;
    const query = searchTerm.trim();
    const cursor = currentCursor;
    setLoadingMore(true);
    setPaginationError('');
    try {
      const res = await api.listTeachers(query || undefined, cursor);
      if (sequence === searchSequence.current) {
        setQueriedTeachers((prev) => [
          ...(prev ?? initialTeachers),
          ...res.items,
        ]);
        setQueriedCursor(res.nextCursor);
        setQueriedTotalCount(res.totalCount);
      }
    } catch (error) {
      if (sequence === searchSequence.current)
        setPaginationError(errorMessage(error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUpdateTeacher(e: FormEvent) {
    e.preventDefault();
    if (!editTeacher) return;
    setSavingEdit(true);
    setEditError('');
    try {
      await api.updateTeacher(editTeacher.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        email: editEmail.trim() || null,
      });
      setEditTeacher(null);
      onSaved();
    } catch (err) {
      setEditError(errorMessage(err).message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="people-subview">
      <div className="section-heading">
        <div>
          <h2>Profesores</h2>
          <p>
            Docentes del establecimiento. Gestiona sus datos, invitaciones de
            acceso y asignaciones a cursos.
          </p>
        </div>
      </div>

      <details className="admin-create-disclosure">
        <summary>
          <span>
            <strong>Incorporar profesor</strong>
            <small>Crear una ficha académica; el correo es opcional.</small>
          </span>
          <span className="admin-create-disclosure__action">
            Nuevo profesor
          </span>
        </summary>
        <PersonForm api={api} kind="teacher" onSaved={onSaved} />
      </details>

      <div className="search-filter-toolbar">
        <div className="search-input-wrapper">
          <Input
            id="teacher-search-input"
            label="Buscar profesor"
            placeholder="Buscar por nombre, apellido o correo..."
            aria-busy={searching}
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              void handleSearch(val);
            }}
          />
        </div>
        {searching ? (
          <span
            aria-live="polite"
            className="searching-indicator"
            role="status"
          >
            Buscando profesores…
          </span>
        ) : null}
      </div>
      {searchError ? (
        <Alert title="No pudimos buscar profesores" tone="error">
          {searchError}
        </Alert>
      ) : null}
      {paginationError ? (
        <Alert title="No pudimos cargar más profesores" tone="error">
          {paginationError}
        </Alert>
      ) : null}

      <div className="responsive-table">
        <table>
          <caption className="sr-only">Listado de profesores</caption>
          <thead>
            <tr>
              <th>Profesor</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Acceso Identity</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayedTeachers.map((teacher) => (
              <tr key={teacher.id}>
                <td data-label="Profesor">
                  <strong>
                    {teacher.firstName} {teacher.lastName}
                  </strong>
                </td>
                <td data-label="Correo">{teacher.email ?? 'Sin correo'}</td>
                <td data-label="Estado">
                  <Badge
                    tone={teacher.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(teacher.status)}
                  </Badge>
                </td>
                <td data-label="Acceso Identity">
                  <AccountProvisioning
                    api={api}
                    identityActions={identityActions}
                    kind="teacher"
                    person={teacher}
                    onLinked={onSaved}
                  />
                </td>
                <td data-label="Acciones">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditTeacher(teacher);
                      setEditFirstName(teacher.firstName);
                      setEditLastName(teacher.lastName);
                      setEditEmail(teacher.email ?? '');
                      setEditError('');
                    }}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayedTeachers.length === 0 ? (
          <EmptyState
            description={
              searchTerm
                ? 'No se encontraron profesores que coincidan con la búsqueda.'
                : 'Aún no hay profesores registrados.'
            }
            title="Sin profesores"
          />
        ) : null}
      </div>

      {displayedTeachers.length > 0 ? (
        <div className="pagination-bar">
          <span className="pagination-info">
            Mostrando {displayedTeachers.length} de{' '}
            {currentTotalCount ?? displayedTeachers.length} profesores
          </span>
          {currentCursor ? (
            <Button
              loading={loadingMore}
              disabled={searching}
              variant="secondary"
              onClick={() => void handleLoadMore()}
            >
              Cargar más profesores
            </Button>
          ) : null}
        </div>
      ) : null}

      {editTeacher ? (
        <Dialog
          description="Actualiza los datos del profesor."
          onOpenChange={(open) => !open && setEditTeacher(null)}
          open={Boolean(editTeacher)}
          title="Editar profesor"
        >
          <form className="academic-form" onSubmit={handleUpdateTeacher}>
            {editTeacher.identityUserId ? (
              <Alert title="Cuenta vinculada con Identity" tone="info">
                Esta cuenta ya tiene acceso de Identity vinculado. El correo de
                inicio de sesión es gestionado autoritativamente por Identity y
                no puede modificarse de forma desacoplada desde Académico.
              </Alert>
            ) : null}
            <Input
              id="edit-teacher-firstname"
              label="Nombres"
              required
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
            />
            <Input
              id="edit-teacher-lastname"
              label="Apellidos"
              required
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
            />
            <Input
              disabled={Boolean(editTeacher.identityUserId)}
              id="edit-teacher-email"
              label="Correo electrónico"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditTeacher(null)}>
                Cancelar
              </Button>
              <Button loading={savingEdit} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function CoursePromotionPanel({
  api,
  courses,
  academicYears,
  onSaved,
}: {
  api: AcademicApiClient;
  courses: AdminData['courses'];
  academicYears: AdminData['academicYears'];
  onSaved: () => void;
}) {
  type Decision =
    'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'DEFER' | 'SOURCE_MANAGED';
  type Choice = { targetCourseId: string | null; decision: Decision };
  type RosterItem = Awaited<
    ReturnType<AcademicApiClient['getCourseRoster']>
  >['items'][number];
  type RosterSummary = Awaited<
    ReturnType<AcademicApiClient['getCourseRosterSummary']>
  >;

  const sourceOptions = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.status === 'ACTIVE' &&
          academicYears.some(
            (year) =>
              year.id === course.academicYearId && year.status === 'ACTIVE',
          ),
      ),
    [academicYears, courses],
  );
  const [sourceCourseId, setSourceCourseId] = useState(
    sourceOptions[0]?.id ?? '',
  );
  const sourceCourse = sourceOptions.find(
    (course) => course.id === sourceCourseId,
  );
  const sourceYear = academicYears.find(
    (year) => year.id === sourceCourse?.academicYearId,
  );
  const eligibleTargetYears = useMemo(
    () =>
      sourceYear
        ? academicYears
            .filter(
              (year) =>
                ['DRAFT', 'ACTIVE'].includes(year.status) &&
                year.startDate > sourceYear.endDate,
            )
            .sort((left, right) =>
              left.startDate.localeCompare(right.startDate),
            )
        : [],
    [academicYears, sourceYear],
  );
  const [requestedTargetAcademicYearId, setRequestedTargetAcademicYearId] =
    useState('');
  const targetAcademicYearId = eligibleTargetYears.some(
    (year) => year.id === requestedTargetAcademicYearId,
  )
    ? requestedTargetAcademicYearId
    : (eligibleTargetYears[0]?.id ?? '');
  const targetYear = eligibleTargetYears.find(
    (year) => year.id === targetAcademicYearId,
  );
  const targetCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.academicYearId === targetAcademicYearId &&
          course.status !== 'ARCHIVED' &&
          (targetYear?.status !== 'DRAFT' || course.status === 'DRAFT'),
      ),
    [courses, targetAcademicYearId, targetYear?.status],
  );
  const [defaultTargetCourseId, setDefaultTargetCourseId] = useState('');
  const selectedDefaultTargetId = targetCourses.some(
    (course) => course.id === defaultTargetCourseId,
  )
    ? defaultTargetCourseId
    : (targetCourses[0]?.id ?? '');
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [rosterCourseId, setRosterCourseId] = useState('');
  const [rosterSummary, setRosterSummary] = useState<RosterSummary | null>(
    null,
  );
  const [rosterSummaryCourseId, setRosterSummaryCourseId] = useState('');
  const [rosterTotalCount, setRosterTotalCount] = useState(0);
  const [rosterNextCursor, setRosterNextCursor] = useState<string | null>(null);
  const [rosterPageCursor, setRosterPageCursor] = useState<string | undefined>(
    undefined,
  );
  const [rosterPageCursors, setRosterPageCursors] = useState<
    Array<string | undefined>
  >([undefined]);
  const [rosterPageIndex, setRosterPageIndex] = useState(0);
  const [rosterPageLoading, setRosterPageLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [operationError, setOperationError] = useState('');
  const [operationSuccess, setOperationSuccess] = useState('');
  const [requiresRosterRefresh, setRequiresRosterRefresh] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commandKey, setCommandKey] = useState<string | null>(null);
  const rosterRequestSequence = useRef(0);
  const summaryRequestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++rosterRequestSequence.current;
    if (sourceCourseId) {
      void api
        .getCourseRoster(sourceCourseId, rosterPageCursor)
        .then((page) => {
          if (sequence === rosterRequestSequence.current) {
            setRoster(page.items);
            setRosterNextCursor(page.nextCursor);
            setRosterTotalCount(page.totalCount);
            setRosterCourseId(sourceCourseId);
            setRosterError('');
          }
        })
        .catch((error: unknown) => {
          if (sequence === rosterRequestSequence.current) {
            setRosterError(errorMessage(error).message);
            setRosterCourseId(sourceCourseId);
          }
        })
        .finally(() => {
          if (sequence === rosterRequestSequence.current) {
            setRosterPageLoading(false);
          }
        });
    }
    return () => {
      rosterRequestSequence.current += 1;
    };
  }, [api, retryCount, rosterPageCursor, sourceCourseId]);

  useEffect(() => {
    const sequence = ++summaryRequestSequence.current;
    if (sourceCourseId) {
      void api
        .getCourseRosterSummary(sourceCourseId)
        .then((summary) => {
          if (sequence === summaryRequestSequence.current) {
            setRosterSummary(summary);
            setRosterSummaryCourseId(sourceCourseId);
          }
        })
        .catch((error: unknown) => {
          if (sequence === summaryRequestSequence.current) {
            setRosterError(errorMessage(error).message);
            setRosterSummaryCourseId(sourceCourseId);
          }
        });
    }
    return () => {
      summaryRequestSequence.current += 1;
    };
  }, [api, retryCount, sourceCourseId]);

  function choiceFor(item: RosterItem): Choice {
    if (item.sourceManaged) {
      return { targetCourseId: null, decision: 'SOURCE_MANAGED' };
    }
    return (
      choices[item.enrollmentId] ?? {
        targetCourseId: selectedDefaultTargetId || null,
        decision: selectedDefaultTargetId ? 'PROMOTE' : 'DEFER',
      }
    );
  }

  const overrideChoices = Object.values(choices);
  const repeatedCount = overrideChoices.filter(
    (choice) => choice.decision === 'REPEAT',
  ).length;
  const transferredCount = overrideChoices.filter(
    (choice) => choice.decision === 'TRANSFER',
  ).length;
  const deferredCount = overrideChoices.filter(
    (choice) => choice.decision === 'DEFER',
  ).length;
  const counts = {
    promoted: selectedDefaultTargetId
      ? Math.max(
          0,
          (rosterSummary?.totalCount ?? 0) -
            (rosterSummary?.sourceManagedCount ?? 0) -
            repeatedCount -
            transferredCount -
            deferredCount,
        )
      : 0,
    repeated: repeatedCount,
    transferred: transferredCount,
    deferred:
      deferredCount +
      (selectedDefaultTargetId
        ? 0
        : Math.max(
            0,
            (rosterSummary?.totalCount ?? 0) -
              (rosterSummary?.sourceManagedCount ?? 0),
          )),
    sourceManaged: rosterSummary?.sourceManagedCount ?? 0,
  };
  const hasCurrentRoster =
    Boolean(sourceCourseId) &&
    rosterCourseId === sourceCourseId &&
    rosterSummaryCourseId === sourceCourseId;
  const rosterLoading =
    Boolean(sourceCourseId) && !hasCurrentRoster && !rosterError;
  const cannotSubmit =
    !sourceCourseId ||
    !targetAcademicYearId ||
    !selectedDefaultTargetId ||
    !hasCurrentRoster ||
    !rosterSummary?.operationAllowed ||
    !rosterSummary.fingerprint ||
    rosterLoading ||
    rosterPageLoading ||
    Boolean(rosterError) ||
    rosterTotalCount === 0 ||
    overrideChoices.length > courseEnrollmentPromotionOverrideLimit ||
    counts.promoted + counts.repeated + counts.transferred === 0 ||
    saving;

  function editChoice(item: RosterItem, next: Choice) {
    setChoices((current) => {
      const updated = { ...current };
      if (
        next.decision === 'PROMOTE' &&
        next.targetCourseId === selectedDefaultTargetId
      ) {
        delete updated[item.enrollmentId];
      } else {
        updated[item.enrollmentId] = next;
      }
      return updated;
    });
    setCommandKey(null);
    setOperationError('');
    setOperationSuccess('');
    setRequiresRosterRefresh(false);
  }

  function refreshRoster() {
    setCommandKey(null);
    setRoster([]);
    setRosterCourseId('');
    setRosterSummary(null);
    setRosterSummaryCourseId('');
    setRosterTotalCount(0);
    setRosterPageCursor(undefined);
    setRosterPageCursors([undefined]);
    setRosterPageIndex(0);
    setRosterPageLoading(false);
    setRosterNextCursor(null);
    setRosterError('');
    setChoices({});
    setOperationError('');
    setOperationSuccess('');
    setRequiresRosterRefresh(false);
    setRetryCount((current) => current + 1);
  }

  function changeRosterPage(direction: 'previous' | 'next') {
    const cursor =
      direction === 'next'
        ? rosterNextCursor
        : rosterPageCursors[rosterPageIndex - 1];
    if (direction === 'next' && !cursor) return;
    if (direction === 'previous' && rosterPageIndex === 0) return;
    const nextPageIndex = rosterPageIndex + (direction === 'next' ? 1 : -1);
    setRoster([]);
    setRosterCourseId('');
    setRosterPageLoading(true);
    setRosterError('');
    setRosterPageCursor(cursor ?? undefined);
    setRosterPageCursors((current) => [
      ...current.slice(0, nextPageIndex),
      cursor ?? undefined,
    ]);
    setRosterPageIndex(nextPageIndex);
  }

  async function confirmPromotion() {
    if (cannotSubmit || !sourceCourseId || !targetAcademicYearId) return;
    const payload = {
      sourceCourseId,
      targetAcademicYearId,
      defaultTargetCourseId: selectedDefaultTargetId,
      expectedRosterFingerprint: rosterSummary?.fingerprint ?? '',
      overrides: Object.entries(choices).map(
        ([sourceEnrollmentId, choice]) => ({
          sourceEnrollmentId,
          targetCourseId: choice.targetCourseId,
          decision: choice.decision as 'REPEAT' | 'TRANSFER' | 'DEFER',
        }),
      ),
    };
    const idempotencyKey = commandKey ?? crypto.randomUUID();
    setCommandKey(idempotencyKey);
    setSaving(true);
    setOperationError('');
    setOperationSuccess('');
    try {
      const result = await api.promoteCourseEnrollments(payload, {
        idempotencyKey,
      });
      setOperationSuccess(
        `Avance completado: ${result.promotedCount} promovidos, ${result.repeatedCount} repitentes y ${result.transferredCount} con cambio de curso. ${result.deferredCount + result.sourceManagedCount} quedaron sin movimiento.`,
      );
      setShowConfirmation(false);
      setCommandKey(null);
      setChoices({});
      setRosterCourseId('');
      setRosterSummary(null);
      setRosterSummaryCourseId('');
      setRosterTotalCount(0);
      setRosterPageCursor(undefined);
      setRosterPageCursors([undefined]);
      setRosterPageIndex(0);
      setRosterNextCursor(null);
      setRosterError('');
      setRequiresRosterRefresh(false);
      setRetryCount((current) => current + 1);
      onSaved();
    } catch (error) {
      setOperationError(errorMessage(error).message);
      setRequiresRosterRefresh(
        error instanceof AcademicApiError &&
          error.code === 'COURSE_ROSTER_CHANGED',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="academic-panel">
      <div className="section-heading">
        <div>
          <h2>Avanzar un curso al siguiente año</h2>
          <p>
            Revisa la matrícula vigente, define el destino de cada alumno y
            confirma todos los cambios en una sola operación.
          </p>
        </div>
      </div>

      {operationError && !showConfirmation ? (
        <Alert title="No se pudo completar el avance" tone="error">
          {operationError}
          {requiresRosterRefresh ? (
            <div className="provisioning-actions">
              <Button onClick={refreshRoster} variant="secondary">
                Actualizar vista previa
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}
      {operationSuccess ? (
        <Alert title="Avance de curso completado" tone="success">
          {operationSuccess}
        </Alert>
      ) : null}

      <div className="assignment-form-grid">
        <Select
          disabled={sourceOptions.length === 0 || saving}
          id="promotion-source-course"
          label="Curso de origen"
          value={sourceCourseId}
          onChange={(event) => {
            setSourceCourseId(event.target.value);
            setRoster([]);
            setRosterCourseId('');
            setRosterSummary(null);
            setRosterSummaryCourseId('');
            setRosterTotalCount(0);
            setRosterNextCursor(null);
            setRosterPageCursor(undefined);
            setRosterPageCursors([undefined]);
            setRosterPageIndex(0);
            setRosterPageLoading(false);
            setRosterError('');
            setChoices({});
            setOperationError('');
            setOperationSuccess('');
            setRequiresRosterRefresh(false);
            setCommandKey(null);
          }}
        >
          <option value="">Selecciona un curso activo</option>
          {sourceOptions.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label} ·{' '}
              {academicYears.find((year) => year.id === course.academicYearId)
                ?.label ?? 'Año no disponible'}
            </option>
          ))}
        </Select>
        <Select
          disabled={eligibleTargetYears.length === 0 || saving}
          id="promotion-target-year"
          label="Año de destino"
          value={targetAcademicYearId}
          onChange={(event) => {
            setRequestedTargetAcademicYearId(event.target.value);
            setDefaultTargetCourseId('');
            setChoices({});
            setCommandKey(null);
          }}
        >
          <option value="">Selecciona un año posterior</option>
          {eligibleTargetYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label} ·{' '}
              {year.status === 'DRAFT' ? 'En preparación' : 'Activo'}
            </option>
          ))}
        </Select>
        <Select
          disabled={targetCourses.length === 0 || saving}
          id="promotion-default-course"
          label="Curso de destino predeterminado"
          value={selectedDefaultTargetId}
          onChange={(event) => {
            setDefaultTargetCourseId(event.target.value);
            setChoices({});
            setCommandKey(null);
          }}
        >
          <option value="">Selecciona un curso de destino</option>
          {targetCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label}
            </option>
          ))}
        </Select>
      </div>

      {!sourceOptions.length ? (
        <EmptyState
          description="Activa un curso dentro del año vigente para preparar su matrícula de destino."
          title="No hay cursos activos para avanzar"
        />
      ) : null}
      {sourceCourse && !eligibleTargetYears.length ? (
        <EmptyState
          description="Crea un año académico posterior y sus cursos para preparar el avance. Los destinos se eligen explícitamente; no se deducen del nombre del curso."
          title="Falta preparar el año de destino"
        />
      ) : null}
      {rosterLoading ? (
        <p aria-live="polite" className="table-muted" role="status">
          Cargando la matrícula vigente…
        </p>
      ) : null}
      {rosterError ? (
        <Alert title="No se pudo cargar la matrícula" tone="error">
          {rosterError}{' '}
          <Button onClick={refreshRoster} variant="secondary">
            Volver a cargar
          </Button>
        </Alert>
      ) : null}

      {hasCurrentRoster &&
      rosterSummary?.totalCount === 0 &&
      !rosterLoading &&
      !rosterError ? (
        <EmptyState
          description="Este curso no tiene alumnos activos en su matrícula."
          title="No hay alumnos para avanzar"
        />
      ) : null}
      {hasCurrentRoster && rosterSummary && !rosterSummary.operationAllowed ? (
        <Alert
          title="El curso supera el límite de avance por operación"
          tone="warning"
        >
          Este flujo permite hasta{' '}
          {rosterSummary.maxRosterCount.toLocaleString('es-CL')} matrículas
          activas por operación. Hay{' '}
          {rosterSummary.totalCount.toLocaleString('es-CL')} en este curso; no
          se aplicó ningún cambio.
        </Alert>
      ) : null}
      {hasCurrentRoster &&
      overrideChoices.length > courseEnrollmentPromotionOverrideLimit ? (
        <Alert title="Hay demasiadas excepciones" tone="warning">
          Mantén hasta {courseEnrollmentPromotionOverrideLimit} excepciones por
          operación. Puedes procesar las decisiones estándar en bloque y
          resolver estas excepciones después.
        </Alert>
      ) : null}

      {hasCurrentRoster && roster.length > 0 ? (
        <>
          <p aria-live="polite" className="table-muted" role="status">
            Vista previa: {counts.promoted} avanzan al destino principal,{' '}
            {counts.repeated} repiten, {counts.transferred} cambian de curso,{' '}
            {counts.deferred} quedan pendientes y {counts.sourceManaged} están
            gestionados por sincronización.
          </p>
          {counts.sourceManaged > 0 ? (
            <Alert
              title="Hay matrículas administradas por sincronización"
              tone="warning"
            >
              Esas matrículas permanecen sin cambios en este corte. Su origen
              debe migrarse antes de poder avanzarlas desde Académico.
            </Alert>
          ) : null}
          {rosterSummary && rosterSummary.totalCount > 50 ? (
            <div className="pagination-bar">
              <span className="pagination-info">
                Página {rosterPageIndex + 1} de{' '}
                {Math.ceil(rosterSummary.totalCount / 50)} ·{' '}
                {rosterSummary.totalCount.toLocaleString('es-CL')} alumnos
              </span>
              <div className="provisioning-actions">
                <Button
                  disabled={
                    rosterPageIndex === 0 || rosterPageLoading || saving
                  }
                  loading={rosterPageLoading && rosterPageIndex > 0}
                  onClick={() => changeRosterPage('previous')}
                  variant="secondary"
                >
                  Anterior
                </Button>
                <Button
                  disabled={!rosterNextCursor || rosterPageLoading || saving}
                  loading={rosterPageLoading && Boolean(rosterNextCursor)}
                  onClick={() => changeRosterPage('next')}
                  variant="secondary"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Alumno</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Decisión</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((item) => {
                  const choice = choiceFor(item);
                  const name = `${item.student.firstName} ${item.student.lastName}`;
                  const isDefault =
                    choice.targetCourseId === selectedDefaultTargetId;
                  return (
                    <tr key={item.enrollmentId}>
                      <td data-label="Alumno">
                        <strong>{name}</strong>
                        {item.sourceManaged ? (
                          <small>
                            {' '}
                            · Matrícula administrada por sincronización
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Destino">
                        <Select
                          disabled={
                            item.sourceManaged ||
                            saving ||
                            !targetCourses.length
                          }
                          id={`promotion-target-${item.enrollmentId}`}
                          label={`Destino de ${name}`}
                          value={choice.targetCourseId ?? ''}
                          onChange={(event) => {
                            const value = event.target.value || null;
                            editChoice(item, {
                              targetCourseId: value,
                              decision: value
                                ? value === selectedDefaultTargetId
                                  ? 'PROMOTE'
                                  : 'TRANSFER'
                                : 'DEFER',
                            });
                          }}
                        >
                          <option value="">Dejar pendiente</option>
                          {targetCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.label}
                              {course.id === selectedDefaultTargetId
                                ? ' · Principal'
                                : ''}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td data-label="Decisión">
                        <Select
                          disabled={item.sourceManaged || saving}
                          id={`promotion-decision-${item.enrollmentId}`}
                          label={`Decisión para ${name}`}
                          value={choice.decision}
                          onChange={(event) => {
                            const decision = event.target.value as Decision;
                            editChoice(item, {
                              targetCourseId:
                                decision === 'DEFER'
                                  ? null
                                  : (choice.targetCourseId ??
                                    selectedDefaultTargetId),
                              decision,
                            });
                          }}
                        >
                          {item.sourceManaged ? (
                            <option value="SOURCE_MANAGED">
                              Gestionada por sincronización
                            </option>
                          ) : choice.targetCourseId ? (
                            <>
                              {isDefault ? (
                                <option value="PROMOTE">
                                  Avanza al curso principal
                                </option>
                              ) : null}
                              <option value="REPEAT">Repite curso</option>
                              {!isDefault ? (
                                <option value="TRANSFER">
                                  Cambio de curso
                                </option>
                              ) : null}
                            </>
                          ) : (
                            <option value="DEFER">
                              Pendiente de asignación
                            </option>
                          )}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="table-muted">
            Antes de guardar, Académico comprobará que la matrícula no haya
            cambiado desde esta vista previa. Los destinos se mantienen dentro
            del año elegido; el curso anterior quedará como historial.
          </p>
          <Button
            disabled={cannotSubmit}
            onClick={() => {
              setOperationError('');
              setShowConfirmation(true);
            }}
          >
            Revisar y confirmar avance
          </Button>
        </>
      ) : null}

      <Dialog
        description="Confirma el año y el resultado por alumno antes de cambiar las matrículas."
        onOpenChange={(open) => !open && !saving && setShowConfirmation(false)}
        open={showConfirmation}
        title="Confirmar avance del curso"
      >
        <div className="academic-form">
          <p>
            {sourceCourse?.label} · {sourceYear?.label} → {targetYear?.label} ·{' '}
            {targetCourses.find(
              (course) => course.id === selectedDefaultTargetId,
            )?.label ?? 'Sin destino principal'}
          </p>
          <p>
            {counts.promoted} avanzan, {counts.repeated} repiten,{' '}
            {counts.transferred} cambian de curso, {counts.deferred} quedan
            pendientes y {counts.sourceManaged} no se modifican.
          </p>
          <p>
            Las matrículas antiguas de quienes avanzan se conservarán inactivas
            y se crearán sus nuevas matrículas en el destino seleccionado.
          </p>
          {operationError ? (
            <Alert title="No se confirmó el avance" tone="error">
              {operationError}
              {requiresRosterRefresh ? (
                <div className="provisioning-actions">
                  <Button onClick={refreshRoster} variant="secondary">
                    Actualizar vista previa
                  </Button>
                </div>
              ) : null}
            </Alert>
          ) : null}
          <div className="provisioning-actions">
            <Button
              disabled={saving}
              onClick={() => setShowConfirmation(false)}
              variant="secondary"
            >
              Volver a revisar
            </Button>
            <Button loading={saving} onClick={() => void confirmPromotion()}>
              Confirmar avance
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

function EnrollmentsAndAssignmentsView({
  api,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const [studentId, setStudentId] = useState(data.students[0]?.id ?? '');
  const [selectedStudent, setSelectedStudent] = useState<
    AdminData['students'][number] | null
  >(data.students[0] ?? null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPageItems, setStudentPageItems] = useState<
    AdminData['students'] | null
  >(null);
  const [studentPageNextCursor, setStudentPageNextCursor] = useState<
    string | null
  >(null);
  const [studentPageTotalCount, setStudentPageTotalCount] = useState<
    number | undefined
  >(undefined);
  const [studentPageCursors, setStudentPageCursors] = useState<
    Array<string | undefined>
  >([undefined]);
  const [studentPageIndex, setStudentPageIndex] = useState(0);
  const [studentSearchLoading, setStudentSearchLoading] = useState(false);
  const [studentSearchError, setStudentSearchError] = useState('');
  const studentSearchSequence = useRef(0);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseSubjectId, setCourseSubjectId] = useState(
    data.courseSubjects[0]?.id ?? '',
  );
  const [teacherId, setTeacherId] = useState(data.teachers[0]?.id ?? '');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const normalizedCourseSearch = courseSearch.trim().toLocaleLowerCase('es-CL');
  const matchingCourses = data.courses.filter((course) => {
    if (!normalizedCourseSearch) return true;
    const yearLabel =
      data.academicYears.find((year) => year.id === course.academicYearId)
        ?.label ?? '';
    return `${course.label} ${yearLabel}`
      .toLocaleLowerCase('es-CL')
      .includes(normalizedCourseSearch);
  });
  const courseOptions =
    courseId && !matchingCourses.some((course) => course.id === courseId)
      ? [
          ...data.courses.filter((course) => course.id === courseId),
          ...matchingCourses,
        ]
      : matchingCourses;
  const studentOptions = studentPageItems ?? data.students;
  const studentNextCursor =
    studentPageItems === null && !studentSearch.trim()
      ? (data.studentsNextCursor ?? null)
      : studentPageNextCursor;
  const studentTotalCount =
    studentPageItems === null && !studentSearch.trim()
      ? (data.studentsTotalCount ?? data.students.length)
      : (studentPageTotalCount ?? studentPageItems?.length ?? 0);
  const studentSelectOptions =
    selectedStudent &&
    !studentOptions.some((student) => student.id === selectedStudent.id)
      ? [selectedStudent, ...studentOptions]
      : studentOptions;

  const availableCourseSubjects = data.courseSubjects.filter(
    (item) => !courseId || item.courseId === courseId,
  );

  useEffect(() => {
    const sequence = ++studentSearchSequence.current;
    const normalizedSearch = studentSearch.trim();
    if (!normalizedSearch) return;
    const timer = window.setTimeout(() => {
      void api
        .listStudents(normalizedSearch)
        .then((page) => {
          if (sequence === studentSearchSequence.current) {
            setStudentPageItems(page.items);
            setStudentPageNextCursor(page.nextCursor);
            setStudentPageTotalCount(page.totalCount ?? page.items.length);
            setStudentPageIndex(0);
            setStudentPageCursors([undefined]);
          }
        })
        .catch((error: unknown) => {
          if (sequence === studentSearchSequence.current) {
            setStudentSearchError(errorMessage(error).message);
          }
        })
        .finally(() => {
          if (sequence === studentSearchSequence.current) {
            setStudentSearchLoading(false);
          }
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [api, studentSearch]);

  async function changeStudentPage(direction: 'previous' | 'next') {
    const cursor =
      direction === 'next'
        ? (studentNextCursor ?? undefined)
        : studentPageCursors[studentPageIndex - 1];
    if (direction === 'next' && !cursor) return;
    if (direction === 'previous' && studentPageIndex === 0) return;
    const nextPageIndex = studentPageIndex + (direction === 'next' ? 1 : -1);
    const sequence = ++studentSearchSequence.current;
    setStudentSearchLoading(true);
    setStudentSearchError('');
    try {
      const page = await api.listStudents(
        studentSearch.trim() || undefined,
        cursor,
      );
      if (sequence === studentSearchSequence.current) {
        setStudentPageItems(page.items);
        setStudentPageNextCursor(page.nextCursor);
        setStudentPageTotalCount(page.totalCount ?? page.items.length);
        setStudentPageCursors((current) => [
          ...current.slice(0, nextPageIndex),
          cursor,
        ]);
        setStudentPageIndex(nextPageIndex);
      }
    } catch (error) {
      if (sequence === studentSearchSequence.current) {
        setStudentSearchError(errorMessage(error).message);
      }
    } finally {
      if (sequence === studentSearchSequence.current) {
        setStudentSearchLoading(false);
      }
    }
  }

  async function run(action: () => Promise<unknown>, successMsg: string) {
    try {
      setActionError('');
      setActionSuccess('');
      await action();
      setActionSuccess(successMsg);
      setStudentSearch('');
      setStudentPageItems(null);
      setStudentPageNextCursor(null);
      setStudentPageTotalCount(undefined);
      setStudentPageIndex(0);
      setStudentPageCursors([undefined]);
      onSaved();
    } catch (error) {
      setActionError(errorMessage(error).message);
    }
  }

  return (
    <div className="academic-stack">
      <CoursePromotionPanel
        api={api}
        academicYears={data.academicYears}
        courses={data.courses}
        onSaved={onSaved}
      />
      <section className="academic-panel">
        <div className="section-heading">
          <div>
            <h2>Inscripciones y asignaciones directas</h2>
            <p>
              Estas relaciones se guardan en Académico; Identity aporta la
              autenticación segura.
            </p>
          </div>
        </div>
        {actionError ? (
          <Alert title="No se pudo guardar la relación" tone="error">
            {actionError}
          </Alert>
        ) : null}
        {actionSuccess ? (
          <Alert title="Operación completada" tone="success">
            {actionSuccess}
          </Alert>
        ) : null}

        <div className="assignment-form-grid">
          <form
            className="academic-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => api.enrollStudent({ studentId, courseId }),
                'Alumno inscrito correctamente en el curso.',
              );
            }}
          >
            <h3>Inscribir alumno en curso</h3>
            <Input
              id="enroll-student-search"
              label="Buscar alumno"
              placeholder="Nombre, apellido, correo o identificador"
              value={studentSearch}
              onChange={(event) => {
                studentSearchSequence.current += 1;
                setStudentSearch(event.target.value);
                setStudentPageItems(null);
                setStudentPageNextCursor(null);
                setStudentPageTotalCount(undefined);
                setStudentPageIndex(0);
                setStudentPageCursors([undefined]);
                setStudentSearchError('');
                setStudentSearchLoading(Boolean(event.target.value.trim()));
              }}
            />
            {studentSearchLoading ? (
              <p aria-live="polite" className="table-muted" role="status">
                Buscando alumnos…
              </p>
            ) : null}
            {studentSearchError ? (
              <Alert title="No pudimos buscar alumnos" tone="error">
                {studentSearchError}
              </Alert>
            ) : null}
            <Select
              disabled={!studentSelectOptions.length || studentSearchLoading}
              id="enroll-student"
              label="Alumno"
              required
              value={studentId}
              onChange={(event) => {
                const nextStudentId = event.target.value;
                setStudentId(nextStudentId);
                setSelectedStudent(
                  studentOptions.find(
                    (student) => student.id === nextStudentId,
                  ) ??
                    (selectedStudent?.id === nextStudentId
                      ? selectedStudent
                      : null),
                );
              }}
            >
              <option value="">Selecciona un alumno</option>
              {studentSelectOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </Select>
            {studentTotalCount > 50 ? (
              <div className="pagination-bar">
                <span className="pagination-info">
                  Página {studentPageIndex + 1} de{' '}
                  {Math.ceil(studentTotalCount / 50)} ·{' '}
                  {studentTotalCount.toLocaleString('es-CL')} coincidencias
                </span>
                <div className="provisioning-actions">
                  <Button
                    disabled={studentPageIndex === 0 || studentSearchLoading}
                    onClick={() => void changeStudentPage('previous')}
                    type="button"
                    variant="secondary"
                  >
                    Anterior
                  </Button>
                  <Button
                    disabled={!studentNextCursor || studentSearchLoading}
                    onClick={() => void changeStudentPage('next')}
                    type="button"
                    variant="secondary"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : null}
            <Input
              id="enroll-course-search"
              label="Buscar curso"
              placeholder="Curso o año académico"
              value={courseSearch}
              onChange={(event) => setCourseSearch(event.target.value)}
            />
            <Select
              disabled={!courseOptions.length}
              id="enroll-course"
              label="Curso"
              required
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">Selecciona un curso</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label} ·{' '}
                  {data.academicYears.find(
                    (year) => year.id === course.academicYearId,
                  )?.label ?? 'Año no disponible'}
                </option>
              ))}
            </Select>
            <Button disabled={!studentId || !courseId} type="submit">
              Inscribir alumno
            </Button>
          </form>

          <form
            className="academic-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  api.assignCourseSubjectTeachers({
                    courseSubjectId,
                    teacherIds: [teacherId],
                  }),
                'Profesor asignado a la asignatura con éxito.',
              );
            }}
          >
            <h3>Asignar profesor a asignatura</h3>
            <Select
              disabled={!availableCourseSubjects.length}
              id="assignment-course-subject"
              label="Asignatura del curso"
              required
              value={courseSubjectId}
              onChange={(event) => setCourseSubjectId(event.target.value)}
            >
              <option value="">Selecciona una asignatura del curso</option>
              {availableCourseSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject?.name ?? item.subjectId} (
                  {data.courses.find((c) => c.id === item.courseId)?.label ??
                    'Curso'}{' '}
                  ·{' '}
                  {data.academicYears.find(
                    (year) =>
                      year.id ===
                      data.courses.find((c) => c.id === item.courseId)
                        ?.academicYearId,
                  )?.label ?? 'Año no disponible'}
                  )
                </option>
              ))}
            </Select>
            <Select
              disabled={!data.teachers.length}
              id="assignment-teacher"
              label="Profesor"
              required
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
            >
              <option value="">Selecciona un profesor</option>
              {data.teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.firstName} {teacher.lastName}
                </option>
              ))}
            </Select>
            <Button disabled={!courseSubjectId || !teacherId} type="submit">
              Guardar asignación
            </Button>
          </form>

          <form
            className="academic-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => api.directlyEnrollStudent({ studentId, courseSubjectId }),
                'Asignatura asignada directamente al alumno.',
              );
            }}
          >
            <h3>Asignar asignatura directamente</h3>
            <Select
              disabled={!data.students.length}
              id="direct-student"
              label="Alumno"
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">Selecciona un alumno</option>
              {data.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </Select>
            <Select
              disabled={!availableCourseSubjects.length}
              id="direct-course-subject"
              label="Asignatura del curso"
              required
              value={courseSubjectId}
              onChange={(event) => setCourseSubjectId(event.target.value)}
            >
              <option value="">Selecciona una asignatura del curso</option>
              {availableCourseSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject?.name ?? item.subjectId} ·{' '}
                  {data.courses.find((course) => course.id === item.courseId)
                    ?.label ?? 'Curso'}{' '}
                  ·{' '}
                  {data.academicYears.find(
                    (year) =>
                      year.id ===
                      data.courses.find((course) => course.id === item.courseId)
                        ?.academicYearId,
                  )?.label ?? 'Año no disponible'}
                </option>
              ))}
            </Select>
            <Button disabled={!studentId || !courseSubjectId} type="submit">
              Asignar directamente
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

function PeopleView({
  api,
  data,
  identityActions,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  identityActions?: AccountProvisioningActions | undefined;
  onSaved: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    'students' | 'teachers' | 'assignments'
  >('students');

  return (
    <div className="academic-stack">
      <AdminTabList<'students' | 'teachers' | 'assignments'>
        idPrefix="admin-people"
        label="Secciones de personas y relaciones académicas"
        onSelect={setActiveTab}
        options={[
          {
            value: 'students',
            label: `Alumnos (${data.studentsTotalCount ?? data.students.length})`,
          },
          {
            value: 'teachers',
            label: `Profesores (${data.teachersTotalCount ?? data.teachers.length})`,
          },
          { value: 'assignments', label: 'Inscripciones y Asignaciones' },
        ]}
        selected={activeTab}
      />

      {activeTab === 'students' ? (
        <div
          aria-labelledby="admin-people-tab-students"
          className="admin-tab-panel"
          id="admin-people-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <StudentsView
            api={api}
            identityActions={identityActions}
            initialCursor={data.studentsNextCursor}
            initialStudents={data.students}
            initialTotalCount={data.studentsTotalCount}
            onSaved={onSaved}
          />
        </div>
      ) : null}

      {activeTab === 'teachers' ? (
        <div
          aria-labelledby="admin-people-tab-teachers"
          className="admin-tab-panel"
          id="admin-people-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <TeachersView
            api={api}
            identityActions={identityActions}
            initialCursor={data.teachersNextCursor}
            initialTeachers={data.teachers}
            initialTotalCount={data.teachersTotalCount}
            onSaved={onSaved}
          />
        </div>
      ) : null}

      {activeTab === 'assignments' ? (
        <div
          aria-labelledby="admin-people-tab-assignments"
          className="admin-tab-panel"
          id="admin-people-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <EnrollmentsAndAssignmentsView
            api={api}
            data={data}
            onSaved={onSaved}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AcademicAdminScreen({
  api,
  dataMode = 'real',
  identityActions,
  session = demoSessions.admin,
  view,
}: {
  api?: AcademicApiClient;
  dataMode?: 'demo' | 'real';
  identityActions?: AccountProvisioningActions | undefined;
  session?: TrustedCurrentSession;
  view: AdminView;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const contextKey = `${currentSession.tenantId}:${currentSession.membershipId}`;
  const { data, error, loading, reload } = useAdminData(client, contextKey);

  return (
    <AppShell dataMode={dataMode} session={currentSession}>
      <PageHeading
        description={
          view === 'overview'
            ? 'Una vista práctica del estado académico del tenant.'
            : view === 'structure'
              ? 'Organiza cursos y asignaturas dentro del año académico seleccionado.'
              : 'Busca fichas académicas y gestiona los accesos de Identity desde cada persona.'
        }
        title={
          view === 'overview'
            ? 'Administración académica'
            : view === 'structure'
              ? 'Estructura académica'
              : 'Personas'
        }
      />
      <DataState error={error} loading={loading} onRetry={() => void reload()}>
        {view === 'overview' ? (
          <AdminOverview
            api={client}
            data={data}
            onRetryPreparation={() => void reload()}
          />
        ) : view === 'structure' ? (
          <StructureView
            key={contextKey}
            api={client}
            data={data}
            onSaved={() => void reload()}
            onRetryPreparation={() => void reload()}
          />
        ) : (
          <PeopleView
            key={contextKey}
            api={client}
            data={data}
            identityActions={identityActions}
            onSaved={() => void reload()}
          />
        )}
      </DataState>
    </AppShell>
  );
}
