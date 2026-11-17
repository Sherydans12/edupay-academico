'use client';

import { Alert, Button, Skeleton } from '@edupay/ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';

export type AdminView = 'overview' | 'structure' | 'enrollments' | 'people';

export interface AdminData {
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
  studentsTotalCount?: number | undefined;
  teachersTotalCount?: number | undefined;
  academicPreparation: Awaited<
    ReturnType<AcademicApiClient['getAcademicPreparationStatus']>
  > | null;
  academicPreparationError: unknown | null;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number | undefined;
}

export async function loadAllPages<T>(
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

export const emptyData: AdminData = {
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

export function preferredAcademicYearId(
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

export function errorMessage(error: unknown): {
  title: string;
  message: string;
} {
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

/**
 * Returns a total only when it is known: either reported by the API or
 * implied by a single complete page. Never presents a page size as a total.
 */
export function knownTotalCount(page: {
  items: unknown[];
  nextCursor: string | null;
  totalCount?: number | undefined;
}): number | undefined {
  if (page.totalCount !== undefined) return page.totalCount;
  return page.nextCursor === null ? page.items.length : undefined;
}

/** Display label for a person count that may be unknown beyond one page. */
export function personCountLabel(
  totalCount: number | undefined,
  loadedCount: number,
): string {
  return totalCount !== undefined
    ? totalCount.toLocaleString('es-CL')
    : `${loadedCount.toLocaleString('es-CL')}+`;
}

export const studentPageSize = 50;

export const personSearchDebounceMs = 300;

export function useAdminData(api: AcademicApiClient, contextKey: string) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background === true;
      const sequence = ++requestSequence.current;
      // A background refresh keeps the current screen mounted, so subviews
      // preserve their tab, filters and page while summary counts update.
      if (!background) {
        setLoading(true);
        setError(null);
        setData((current) => ({
          ...current,
          academicPreparation: null,
          academicPreparationError: null,
        }));
      }

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
        // A failed background refresh keeps the last loaded data visible; the
        // subview that triggered it reports its own page errors.
        if (!background) {
          setError(coreResult.reason);
          setLoading(false);
        }
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
        studentsTotalCount: knownTotalCount(students),
        teachersTotalCount: knownTotalCount(teachers),
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
    },
    [api],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [contextKey, reload]);

  return { data, error, loading, reload, setData };
}

export function DataState({
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

export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export function statusLabel(status: string) {
  return status === 'ACTIVE'
    ? 'Activo'
    : status === 'DRAFT'
      ? 'Borrador'
      : status === 'CLOSED'
        ? 'Cerrado'
        : 'Archivado';
}

export interface AdminTabOption<T extends string> {
  label: ReactNode;
  value: T;
}

export function AdminTabList<T extends string>({
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
          aria-controls={`${idPrefix}-panel`}
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
