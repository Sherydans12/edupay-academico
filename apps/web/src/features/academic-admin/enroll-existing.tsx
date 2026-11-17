'use client';

import { Alert, Button, Input, Select } from '@edupay/ui';
import { useEffect, useRef, useState } from 'react';
import type { AcademicApiClient } from '@/api/academic-client';

import { errorMessage, type AdminData } from './shared';

/**
 * Enrolls an existing student in a course of the year in context, and assigns
 * a course subject directly as an exception.
 */
export function EnrollExistingStudentPanel({
  academicYearId,
  api,
  data,
  onSaved,
}: {
  academicYearId: string;
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const yearCourses = data.courses.filter(
    (course) =>
      course.academicYearId === academicYearId && course.status !== 'ARCHIVED',
  );
  const [courseId, setCourseId] = useState(yearCourses[0]?.id ?? '');
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
  const [courseSubjectId, setCourseSubjectId] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const normalizedCourseSearch = courseSearch.trim().toLocaleLowerCase('es-CL');
  const matchingCourses = yearCourses.filter(
    (course) =>
      !normalizedCourseSearch ||
      course.label.toLocaleLowerCase('es-CL').includes(normalizedCourseSearch),
  );
  const courseOptions =
    courseId && !matchingCourses.some((course) => course.id === courseId)
      ? [
          ...yearCourses.filter((course) => course.id === courseId),
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

  const yearCourseIds = new Set(yearCourses.map((course) => course.id));
  const availableCourseSubjects = data.courseSubjects.filter(
    (item) =>
      item.status === 'ACTIVE' &&
      yearCourseIds.has(item.courseId) &&
      (!courseId || item.courseId === courseId),
  );
  const effectiveCourseSubjectId = availableCourseSubjects.some(
    (item) => item.id === courseSubjectId,
  )
    ? courseSubjectId
    : '';
  const selectedCourseLabel =
    yearCourses.find((course) => course.id === courseId)?.label ?? '';
  const selectedStudentLabel = selectedStudent
    ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
    : '';

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
    <section
      aria-labelledby="enroll-existing-title"
      className="academic-panel enroll-existing"
    >
      <div className="section-heading">
        <div>
          <h2 id="enroll-existing-title">Matricular un alumno existente</h2>
          <p>
            Para alumnos que ya tienen ficha. Solo se ofrecen los cursos del año
            en contexto.
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

      <form
        className="academic-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () => api.enrollStudent({ studentId, courseId }),
            `${selectedStudentLabel || 'El alumno'} quedó matriculado en ${selectedCourseLabel || 'el curso'}.`,
          );
        }}
      >
        <div className="enroll-existing__steps">
          <fieldset className="enroll-existing__step">
            <legend>
              <span aria-hidden="true" className="enroll-existing__marker">
                1
              </span>
              Alumno
            </legend>
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
          </fieldset>
          <fieldset className="enroll-existing__step">
            <legend>
              <span aria-hidden="true" className="enroll-existing__marker">
                2
              </span>
              Curso
            </legend>
            {yearCourses.length > 8 ? (
              <Input
                id="enroll-course-search"
                label="Buscar curso"
                placeholder="Nombre del curso"
                value={courseSearch}
                onChange={(event) => setCourseSearch(event.target.value)}
              />
            ) : null}
            <Select
              disabled={!courseOptions.length}
              hint={
                yearCourses.length
                  ? undefined
                  : 'Este año no tiene cursos abiertos. Créalos en Cursos.'
              }
              id="enroll-course"
              label="Curso"
              required
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">Selecciona un curso</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </Select>
          </fieldset>
        </div>
        <Button disabled={!studentId || !courseId} type="submit">
          Matricular en el curso
        </Button>
      </form>

      <details className="enroll-existing__exception">
        <summary>Excepción: habilitar solo una asignatura</summary>
        <div className="enroll-existing__exception-body">
          <p className="table-muted">
            Habilita una asignatura de{' '}
            {selectedCourseLabel || 'el curso elegido'} para{' '}
            {selectedStudentLabel || 'el alumno elegido'}, fuera o además de las
            asignaturas de su propio curso. No crea matrícula en ese curso.
          </p>
          <Select
            disabled={!availableCourseSubjects.length}
            hint={
              courseId && !availableCourseSubjects.length
                ? 'Este curso aún no tiene asignaturas activas.'
                : undefined
            }
            id="direct-course-subject"
            label="Asignatura del curso"
            value={effectiveCourseSubjectId}
            onChange={(event) => setCourseSubjectId(event.target.value)}
          >
            <option value="">Selecciona una asignatura</option>
            {availableCourseSubjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.subject?.name ?? item.subjectId}
              </option>
            ))}
          </Select>
          <Button
            disabled={!studentId || !effectiveCourseSubjectId}
            onClick={() =>
              void run(
                () =>
                  api.directlyEnrollStudent({
                    studentId,
                    courseSubjectId: effectiveCourseSubjectId,
                  }),
                'Asignatura habilitada directamente para el alumno.',
              )
            }
            type="button"
            variant="secondary"
          >
            Habilitar asignatura
          </Button>
        </div>
      </details>
    </section>
  );
}
