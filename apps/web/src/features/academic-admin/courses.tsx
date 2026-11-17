'use client';

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Select,
} from '@edupay/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';

import { AdminTabList, statusLabel, type AdminData } from './shared';
import {
  AcademicYearForm,
  formatYearRange,
  yearStatusTone,
  type AcademicYearRecord,
} from './year-context';
import { CourseRoster } from './enrollments';
import { enrollmentSectionHref } from './enrollments-view';
import {
  ActivateAcademicRecord,
  CourseForm,
  CourseSubjectManagement,
  SubjectCatalog,
} from './structure';

type CoursesTab = 'courses' | 'years' | 'subjects';
type CourseDetailTab = 'students' | 'subjects';
type Course = AdminData['courses'][number];

/** Above this many courses the list offers a search box. */
const courseSearchThreshold = 8;

function isReadOnlyYear(year: AcademicYearRecord | undefined) {
  return year?.status === 'CLOSED' || year?.status === 'ARCHIVED';
}

function subjectCountLabel(count: number) {
  if (count === 0) return 'Sin asignaturas';
  return count === 1 ? '1 asignatura' : `${count} asignaturas`;
}

/**
 * Cursos: the courses of the year in context with a detail per course
 * (students, subjects and teachers). Years and the subject catalog are
 * secondary tabs because they change rarely.
 */
export function CoursesView({
  api,
  contextYear,
  data,
  onContextYearChange,
  onSaved,
}: {
  api: AcademicApiClient;
  contextYear: AcademicYearRecord | undefined;
  data: AdminData;
  onContextYearChange: (id: string) => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<CoursesTab>('courses');

  return (
    <div className="academic-stack">
      <AdminTabList<CoursesTab>
        idPrefix="admin-courses"
        label="Secciones de cursos"
        onSelect={setTab}
        options={[
          {
            value: 'courses',
            label: contextYear ? `Cursos de ${contextYear.label}` : 'Cursos',
          },
          { value: 'years', label: 'Años académicos' },
          { value: 'subjects', label: 'Catálogo de asignaturas' },
        ]}
        selected={tab}
      />
      <div
        aria-labelledby={`admin-courses-tab-${tab}`}
        className="admin-tab-panel"
        id="admin-courses-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {tab === 'courses' ? (
          contextYear ? (
            <YearCourses
              api={api}
              data={data}
              key={contextYear.id}
              onSaved={onSaved}
              year={contextYear}
            />
          ) : (
            <EmptyState
              description="Crea un año en «Años académicos» o elige uno en el selector de año."
              title="Sin año en contexto"
            />
          )
        ) : null}
        {tab === 'years' ? (
          <AcademicYearsPanel
            api={api}
            contextYearId={contextYear?.id ?? ''}
            data={data}
            onContextYearChange={onContextYearChange}
            onSaved={onSaved}
          />
        ) : null}
        {tab === 'subjects' ? (
          <SubjectCatalog api={api} data={data} onSaved={onSaved} />
        ) : null}
      </div>
    </div>
  );
}

function YearCourses({
  api,
  data,
  onSaved,
  year,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
  year: AcademicYearRecord;
}) {
  const readOnly = isReadOnlyYear(year);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [detailTab, setDetailTab] = useState<CourseDetailTab>('students');
  const [creating, setCreating] = useState(false);

  const yearCourses = useMemo(
    () => data.courses.filter((course) => course.academicYearId === year.id),
    [data.courses, year.id],
  );
  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data.courseSubjects) {
      if (item.status !== 'ACTIVE') continue;
      counts.set(item.courseId, (counts.get(item.courseId) ?? 0) + 1);
    }
    return counts;
  }, [data.courseSubjects]);

  const openCourses = yearCourses.filter(
    (course) => course.status !== 'ARCHIVED',
  );
  const archivedCount = yearCourses.length - openCourses.length;
  const draftCount = openCourses.filter(
    (course) => course.status === 'DRAFT',
  ).length;
  const withoutSubjectsCount = openCourses.filter(
    (course) => (subjectCounts.get(course.id) ?? 0) === 0,
  ).length;
  const normalizedQuery = query.trim().toLocaleLowerCase('es-CL');
  const visibleCourses = yearCourses.filter(
    (course) =>
      (showArchived || course.status !== 'ARCHIVED') &&
      (!normalizedQuery ||
        course.label.toLocaleLowerCase('es-CL').includes(normalizedQuery)),
  );
  const selectedCourse =
    visibleCourses.find((course) => course.id === selectedId) ??
    visibleCourses[0];

  const summary = [
    openCourses.length === 1 ? '1 curso' : `${openCourses.length} cursos`,
    draftCount ? `${draftCount} en borrador` : null,
    withoutSubjectsCount ? `${withoutSubjectsCount} sin asignaturas` : null,
    archivedCount
      ? `${archivedCount} archivado${archivedCount === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <section
        aria-labelledby="year-courses-title"
        className="academic-panel year-courses"
      >
        <div className="section-heading">
          <div>
            <h2 id="year-courses-title">Cursos de {year.label}</h2>
            <p>{summary}</p>
          </div>
          {readOnly ? (
            <Badge tone="neutral">
              <Icon name="archive" /> Solo lectura
            </Badge>
          ) : (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" /> Nuevo curso
            </Button>
          )}
        </div>
        {year.status === 'DRAFT' ? (
          <p className="integration-note">
            <Icon name="calendar" />
            {year.label} está en preparación: sus cursos se crean en borrador y
            se activan una vez activado el año.
          </p>
        ) : null}
        {readOnly ? (
          <p className="integration-note">
            <Icon name="archive" />
            {year.label} es de solo lectura: su historia se conserva sin
            permitir cambios.
          </p>
        ) : null}

        {yearCourses.length === 0 ? (
          <EmptyState
            description={
              readOnly
                ? 'Este año no tuvo cursos.'
                : year.status === 'DRAFT'
                  ? 'Crea el primero con «Nuevo curso» o cópialos del año activo desde Inicio.'
                  : 'Crea el primero con «Nuevo curso».'
            }
            title={`Aún no hay cursos en ${year.label}`}
          />
        ) : (
          <div className="course-workspace">
            <div className="course-workspace__list">
              {yearCourses.length > courseSearchThreshold ? (
                <Input
                  id="course-search"
                  label="Buscar curso"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              ) : null}
              {archivedCount ? (
                <Checkbox
                  checked={showArchived}
                  id="course-show-archived"
                  label={`Mostrar archivados (${archivedCount})`}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
              ) : null}
              <div className="course-workspace__select">
                <Select
                  id="course-picker-select"
                  label="Curso"
                  value={selectedCourse?.id ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {visibleCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.label} · {statusLabel(course.status)}
                    </option>
                  ))}
                </Select>
              </div>
              <ul
                aria-label={`Cursos de ${year.label}`}
                className="course-picker"
              >
                {visibleCourses.map((course) => {
                  const count = subjectCounts.get(course.id) ?? 0;
                  const selected = course.id === selectedCourse?.id;
                  return (
                    <li key={course.id}>
                      <button
                        aria-current={selected ? 'true' : undefined}
                        className={`course-picker__item${selected ? ' course-picker__item--selected' : ''}`}
                        onClick={() => setSelectedId(course.id)}
                        type="button"
                      >
                        <span className="course-picker__name">
                          {course.label}
                        </span>
                        <span className="course-picker__meta">
                          {statusLabel(course.status)}
                          {' · '}
                          {count === 0 && course.status !== 'ARCHIVED' ? (
                            <span className="course-picker__warning">
                              <Icon name="alert-triangle" />
                              {subjectCountLabel(count)}
                            </span>
                          ) : (
                            subjectCountLabel(count)
                          )}
                          {course.source === 'EDUPAY' ? ' · EduPay' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {visibleCourses.length === 0 ? (
                <p className="table-muted">
                  {normalizedQuery
                    ? `Ningún curso coincide con «${query.trim()}».`
                    : 'Todos los cursos de este año están archivados.'}
                </p>
              ) : null}
            </div>
            <div className="course-workspace__detail">
              {selectedCourse ? (
                <CourseDetail
                  api={api}
                  course={selectedCourse}
                  data={data}
                  detailTab={detailTab}
                  onDetailTabChange={setDetailTab}
                  onSaved={onSaved}
                  subjectCount={subjectCounts.get(selectedCourse.id) ?? 0}
                  year={year}
                />
              ) : null}
            </div>
          </div>
        )}
      </section>

      {creating ? (
        <Dialog
          description={
            year.status === 'ACTIVE'
              ? `El curso se crea en ${year.label}. Puedes dejarlo en borrador o activarlo de inmediato.`
              : `El curso se crea en borrador en ${year.label}.`
          }
          onOpenChange={setCreating}
          open
          title={`Nuevo curso en ${year.label}`}
        >
          <CourseForm
            api={api}
            data={data}
            fixedYearId={year.id}
            onSaved={() => {
              setCreating(false);
              onSaved();
            }}
          />
        </Dialog>
      ) : null}
    </>
  );
}

function CourseDetail({
  api,
  course,
  data,
  detailTab,
  onDetailTabChange,
  onSaved,
  subjectCount,
  year,
}: {
  api: AcademicApiClient;
  course: Course;
  data: AdminData;
  detailTab: CourseDetailTab;
  onDetailTabChange: (tab: CourseDetailTab) => void;
  onSaved: () => void;
  subjectCount: number;
  year: AcademicYearRecord;
}) {
  const readOnly = isReadOnlyYear(year);
  const canActivate =
    course.status === 'DRAFT' &&
    course.source !== 'EDUPAY' &&
    year.status === 'ACTIVE';

  return (
    <section aria-labelledby="course-detail-title" className="course-detail">
      <div className="course-detail__header">
        <div>
          <h3 id="course-detail-title">{course.label}</h3>
          <p>
            {year.label}
            {course.source === 'EDUPAY' ? ' · Sincronizado desde EduPay' : ''}
            {' · '}
            {subjectCountLabel(subjectCount)}
          </p>
        </div>
        <div className="course-detail__status">
          <Badge tone={course.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {statusLabel(course.status)}
          </Badge>
          {canActivate && !readOnly ? (
            <ActivateAcademicRecord
              label="Activar curso"
              onActivate={() =>
                api.updateCourse(course.id, { status: 'ACTIVE' })
              }
              onSaved={onSaved}
            />
          ) : null}
        </div>
      </div>
      {course.status === 'DRAFT' && year.status === 'DRAFT' ? (
        <p className="table-muted">
          Se podrá activar cuando {year.label} esté activo.
        </p>
      ) : null}
      <AdminTabList<CourseDetailTab>
        idPrefix="course-detail"
        label={`Secciones de ${course.label}`}
        onSelect={onDetailTabChange}
        options={[
          { value: 'students', label: 'Alumnos' },
          { value: 'subjects', label: 'Asignaturas y profesores' },
        ]}
        selected={detailTab}
      />
      <div
        aria-labelledby={`course-detail-tab-${detailTab}`}
        className="admin-tab-panel"
        id="course-detail-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {detailTab === 'students' ? (
          <>
            <CourseRoster
              api={api}
              course={course}
              key={course.id}
              yearReadOnly={readOnly}
            />
            {readOnly ? null : (
              <p className="course-detail__hint">
                Para sumar alumnos a este curso, usa{' '}
                <Link href={enrollmentSectionHref('admit')}>
                  Matrículas › Incorporar alumno nuevo
                </Link>{' '}
                o{' '}
                <Link href={enrollmentSectionHref('enroll')}>
                  Matricular alumno existente
                </Link>
                .
              </p>
            )}
          </>
        ) : (
          <CourseSubjectManagement
            api={api}
            data={data}
            key={course.id}
            onSaved={onSaved}
            selectedCourse={course}
          />
        )}
      </div>
    </section>
  );
}

function AcademicYearsPanel({
  api,
  contextYearId,
  data,
  onContextYearChange,
  onSaved,
}: {
  api: AcademicApiClient;
  contextYearId: string;
  data: AdminData;
  onContextYearChange: (id: string) => void;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const courseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of data.courses) {
      if (course.status === 'ARCHIVED') continue;
      counts.set(
        course.academicYearId,
        (counts.get(course.academicYearId) ?? 0) + 1,
      );
    }
    return counts;
  }, [data.courses]);

  return (
    <section aria-labelledby="academic-years-title" className="academic-panel">
      <div className="section-heading">
        <div>
          <h2 id="academic-years-title">Años académicos</h2>
          <p>
            Periodos lectivos del establecimiento. Los años cerrados o
            archivados se conservan en solo lectura.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" /> Nuevo año
        </Button>
      </div>
      {data.academicYears.length ? (
        <div className="responsive-table">
          <table>
            <caption className="sr-only">Años académicos</caption>
            <thead>
              <tr>
                <th>Año</th>
                <th>Periodo</th>
                <th>Estado</th>
                <th>Cursos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.academicYears.map((year) => {
                const inContext = year.id === contextYearId;
                return (
                  <tr key={year.id}>
                    <td data-label="Año">
                      <strong>{year.label}</strong>
                    </td>
                    <td data-label="Periodo">{formatYearRange(year)}</td>
                    <td data-label="Estado">
                      <Badge tone={yearStatusTone(year.status)}>
                        {statusLabel(year.status)}
                      </Badge>
                    </td>
                    <td data-label="Cursos">
                      {courseCounts.get(year.id) ?? 0}
                    </td>
                    <td data-label="Acciones">
                      <div className="academic-year-actions">
                        {inContext ? (
                          <span className="academic-year-actions__current">
                            <Icon name="check" /> En contexto
                          </span>
                        ) : year.status !== 'ARCHIVED' ? (
                          <Button
                            onClick={() => onContextYearChange(year.id)}
                            size="sm"
                            variant="secondary"
                          >
                            Trabajar con {year.label}
                          </Button>
                        ) : null}
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
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="Crea el primer año académico para comenzar a configurar cursos."
          title="Aún no hay años"
        />
      )}
      {creating ? (
        <Dialog
          description="El año se crea en borrador; sus cursos y matrículas no cambian el año en curso."
          onOpenChange={setCreating}
          open
          title="Nuevo año académico"
        >
          <AcademicYearForm
            api={api}
            onSaved={() => {
              setCreating(false);
              onSaved();
            }}
            title="Datos del año"
          />
        </Dialog>
      ) : null}
    </section>
  );
}
