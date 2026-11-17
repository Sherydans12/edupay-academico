'use client';

import {
  canonicalStudentNationalId,
  STUDENT_NATIONAL_ID_EXISTS,
  type StudentNationalIdType,
} from '@edupay/contracts';
import { Alert, Button, Input, Select } from '@edupay/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';

type AcademicYear = Awaited<
  ReturnType<AcademicApiClient['listAcademicYears']>
>['items'][number];
type Course = Awaited<
  ReturnType<AcademicApiClient['listCourses']>
>['items'][number];
type Student = Awaited<
  ReturnType<AcademicApiClient['admitStudent']>
>['student'];

const MAX_PAGES = 20;

async function loadAll<T>(
  loadPage: (
    cursor?: string,
  ) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await loadPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) return items;
    cursor = result.nextCursor;
  }
  return items;
}

function yearStatusLabel(status: AcademicYear['status']) {
  return status === 'ACTIVE' ? 'activo' : 'borrador';
}

function apiMessage(error: unknown): string {
  if (error instanceof AcademicApiError) {
    if (error.status === 403) {
      return 'Tu rol no puede incorporar alumnos en este colegio.';
    }
    const reference =
      error.requestId !== 'unavailable'
        ? ` Código de solicitud: ${error.requestId}.`
        : '';
    return `${error.message}${reference}`;
  }
  return 'No pudimos completar la acción. Inténtalo nuevamente.';
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * ADR-0024 manual admission: one form creates the student record with its
 * RUN/IPE and enrolls it in a course. A repeated identifier never creates a
 * second record; the administrator may explicitly enroll the existing one.
 */
export function StudentAdmissionForm({
  api,
  initialYearId,
  onSaved,
}: {
  api: AcademicApiClient;
  /** Year to preselect when it is open (draft or active). */
  initialYearId?: string;
  onSaved: () => void;
}) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [yearsError, setYearsError] = useState('');
  const [yearId, setYearId] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [nationalIdType, setNationalIdType] =
    useState<StudentNationalIdType>('RUN');
  const [nationalId, setNationalId] = useState('');
  const [nationalIdTouched, setNationalIdTouched] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [existing, setExisting] = useState<Student | null>(null);
  const [enrollingExisting, setEnrollingExisting] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setYearsLoading(true);
      setYearsError('');
      void loadAll((cursor) => api.listAcademicYears(cursor))
        .then((items) => {
          if (cancelled) return;
          const mutable = items.filter(
            (year) => year.status === 'DRAFT' || year.status === 'ACTIVE',
          );
          setYears(mutable);
          setYearId((current) =>
            mutable.some((year) => year.id === current)
              ? current
              : initialYearId &&
                  mutable.some((year) => year.id === initialYearId)
                ? initialYearId
                : (mutable.find((year) => year.status === 'DRAFT')?.id ??
                  mutable[0]?.id ??
                  ''),
          );
        })
        .catch((nextError: unknown) => {
          if (!cancelled) setYearsError(apiMessage(nextError));
        })
        .finally(() => {
          if (!cancelled) setYearsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, initialYearId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!yearId) {
        setCourses([]);
        setCourseId('');
        return;
      }
      setCoursesLoading(true);
      setCoursesError('');
      void loadAll((cursor) => api.listCourses(yearId, cursor))
        .then((items) => {
          if (cancelled) return;
          const open = items.filter((course) => course.status !== 'ARCHIVED');
          setCourses(open);
          setCourseId((current) =>
            open.some((course) => course.id === current) ? current : '',
          );
        })
        .catch((nextError: unknown) => {
          if (!cancelled) setCoursesError(apiMessage(nextError));
        })
        .finally(() => {
          if (!cancelled) setCoursesLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, yearId, reloadToken]);

  const canonicalId = useMemo(
    () => canonicalStudentNationalId(nationalIdType, nationalId),
    [nationalId, nationalIdType],
  );
  const nationalIdError =
    nationalIdTouched && nationalId.trim() && canonicalId === null
      ? nationalIdType === 'RUN'
        ? 'El RUN no es válido. Revisa los números y el dígito verificador.'
        : 'El IPE solo puede contener letras y números.'
      : undefined;
  const selectedCourse = courses.find((course) => course.id === courseId);
  const canSubmit =
    canonicalId !== null &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    Boolean(courseId) &&
    !saving;

  function clearOutcome() {
    setError('');
    setSuccess('');
    setExisting(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNationalIdTouched(true);
    if (!canSubmit || canonicalId === null) return;
    const input = {
      nationalIdType,
      nationalId: canonicalId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      courseId,
    };
    // Reuse the key while the same admission is retried; a changed form is
    // a new command and gets a new key.
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newIdempotencyKey() };
    }
    setSaving(true);
    clearOutcome();
    try {
      const result = await api.admitStudent(input, {
        idempotencyKey: attempt.current.key,
      });
      attempt.current = null;
      setSuccess(
        `${result.student.firstName} ${result.student.lastName} quedó incorporado y matriculado en ${selectedCourse?.label ?? 'el curso elegido'}.`,
      );
      setNationalId('');
      setNationalIdTouched(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      onSaved();
    } catch (nextError) {
      if (
        nextError instanceof AcademicApiError &&
        nextError.code === STUDENT_NATIONAL_ID_EXISTS
      ) {
        attempt.current = null;
        try {
          const lookup = await api.lookupStudentByNationalId({
            nationalIdType,
            nationalId: canonicalId,
          });
          setExisting(lookup.student);
          if (!lookup.student) setError(apiMessage(nextError));
        } catch (lookupError) {
          setError(apiMessage(lookupError));
        }
      } else {
        setError(apiMessage(nextError));
      }
    } finally {
      setSaving(false);
    }
  }

  async function enrollExisting() {
    if (!existing || !courseId) return;
    setEnrollingExisting(true);
    setError('');
    try {
      await api.enrollStudent({ studentId: existing.id, courseId });
      setSuccess(
        `${existing.firstName} ${existing.lastName} quedó matriculado en ${selectedCourse?.label ?? 'el curso elegido'}. No se creó otra ficha.`,
      );
      setExisting(null);
      setNationalId('');
      setNationalIdTouched(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      onSaved();
    } catch (nextError) {
      setError(apiMessage(nextError));
    } finally {
      setEnrollingExisting(false);
    }
  }

  if (yearsLoading) {
    return (
      <p aria-live="polite" className="table-muted" role="status">
        Cargando años académicos…
      </p>
    );
  }
  if (yearsError) {
    return (
      <Alert
        action={
          <Button
            onClick={() => setReloadToken((value) => value + 1)}
            variant="secondary"
          >
            Reintentar
          </Button>
        }
        title="No pudimos cargar los años académicos"
        tone="error"
      >
        {yearsError}
      </Alert>
    );
  }
  if (years.length === 0) {
    return (
      <Alert title="No hay un año académico abierto" tone="warning">
        Crea o activa un año académico en Estructura para poder incorporar
        alumnos.
      </Alert>
    );
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>Incorporar alumno nuevo</h3>
      <p className="table-muted">
        Crea la ficha con su RUN, o su IPE si no tiene RUN, y la matricula en un
        curso en una sola operación. Si el identificador ya existe, no se crea
        otra ficha.
      </p>
      <div className="academic-form__fields">
        <Select
          id="admission-national-id-type"
          label="Tipo de identificador"
          value={nationalIdType}
          onChange={(event) => {
            setNationalIdType(event.target.value as StudentNationalIdType);
            clearOutcome();
          }}
        >
          <option value="RUN">RUN</option>
          <option value="IPE">IPE (alumno sin RUN)</option>
        </Select>
        <Input
          autoComplete="off"
          error={nationalIdError}
          hint={
            nationalIdType === 'RUN'
              ? 'Incluye el dígito verificador; puntos y guion son opcionales.'
              : 'Identificador provisorio escolar entregado por el Ministerio de Educación.'
          }
          id="admission-national-id"
          label={nationalIdType === 'RUN' ? 'RUN' : 'IPE'}
          required
          spellCheck={false}
          value={nationalId}
          onBlur={() => setNationalIdTouched(true)}
          onChange={(event) => {
            setNationalId(event.target.value);
            clearOutcome();
          }}
        />
        <Input
          id="admission-first-name"
          label="Nombres"
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <Input
          id="admission-last-name"
          label="Apellidos"
          required
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <Input
          id="admission-email"
          label="Correo electrónico (opcional)"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          id="admission-year"
          label="Año académico"
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            clearOutcome();
          }}
        >
          {years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label} ({yearStatusLabel(year.status)})
            </option>
          ))}
        </Select>
        <Select
          error={coursesError || undefined}
          hint={
            coursesLoading
              ? 'Cargando cursos…'
              : courses.length === 0
                ? 'Este año no tiene cursos abiertos. Créalos en Cursos.'
                : undefined
          }
          id="admission-course"
          label="Curso"
          required
          value={courseId}
          onChange={(event) => {
            setCourseId(event.target.value);
            clearOutcome();
          }}
        >
          <option value="">Selecciona un curso</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label}
              {course.status === 'DRAFT' ? ' (borrador)' : ''}
            </option>
          ))}
        </Select>
      </div>

      {existing ? (
        <Alert
          action={
            <Button
              disabled={!courseId}
              loading={enrollingExisting}
              onClick={() => void enrollExisting()}
              variant="secondary"
            >
              Matricular esta ficha
              {selectedCourse ? ` en ${selectedCourse.label}` : ''}
            </Button>
          }
          title="Ya existe una ficha con este identificador"
          tone="warning"
        >
          {existing.firstName} {existing.lastName} ·{' '}
          {existing.source === 'EDUPAY'
            ? 'gestionada por EduPay'
            : 'registro manual'}
          . No se creó otra ficha. Si es la misma persona, puedes matricularla
          en el curso elegido.
        </Alert>
      ) : null}
      {error ? (
        <Alert title="No se pudo incorporar al alumno" tone="error">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Alumno incorporado" tone="success">
          {success}
        </Alert>
      ) : null}

      <Button disabled={!canSubmit} loading={saving} type="submit">
        Incorporar y matricular
      </Button>
    </form>
  );
}
