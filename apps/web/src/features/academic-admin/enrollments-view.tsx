'use client';

import { Alert, EmptyState } from '@edupay/ui';
import { useEffect, useState } from 'react';
import type { AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';
import { StudentAdmissionForm } from '@/features/student-admission-form';

import { AdminTabList, type AdminData } from './shared';
import type { AcademicYearRecord } from './year-context';
import { CoursePromotionPanel } from './course-promotion';
import { EnrollExistingStudentPanel } from './enroll-existing';
import { InconsistentEnrollmentsPanel } from './enrollments';

export type EnrollmentSection = 'admit' | 'enroll' | 'promotion' | 'review';

const sectionParams: Record<EnrollmentSection, string> = {
  admit: 'incorporar',
  enroll: 'matricular',
  promotion: 'avance',
  review: 'revisar',
};

/** Link to a section of Matrículas, e.g. from the home tasks. */
export function enrollmentSectionHref(section: EnrollmentSection): string {
  return `/administracion/matriculas?seccion=${sectionParams[section]}`;
}

function sectionFromLocation(): EnrollmentSection | null {
  try {
    const value = new URLSearchParams(window.location.search).get('seccion');
    return (
      (Object.keys(sectionParams) as EnrollmentSection[]).find(
        (key) => sectionParams[key] === value,
      ) ?? null
    );
  } catch {
    return null;
  }
}

function isReadOnlyYear(year: AcademicYearRecord | undefined) {
  return year?.status === 'CLOSED' || year?.status === 'ARCHIVED';
}

/**
 * Matrículas groups every task that creates or changes enrollments: admitting
 * a new student, enrolling an existing one, the annual course promotion and
 * the enrollments that need review.
 */
export function EnrollmentsView({
  api,
  contextYear,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  contextYear: AcademicYearRecord | undefined;
  data: AdminData;
  onSaved: () => void;
}) {
  const [section, setSection] = useState<EnrollmentSection>('admit');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fromLocation = sectionFromLocation();
      if (fromLocation) setSection(fromLocation);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectSection(next: EnrollmentSection) {
    setSection(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('seccion', sectionParams[next]);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // The address is a convenience for sharing the section; the tab still
      // changes without it.
    }
  }

  const yearLabel = contextYear?.label ?? 'el año en contexto';
  const readOnly = isReadOnlyYear(contextYear);
  const readOnlyNotice = (
    <Alert title={`${yearLabel} es de solo lectura`} tone="info">
      Para matricular, elige un año activo o en preparación en el selector de
      año.
    </Alert>
  );
  const noYearNotice = (
    <EmptyState
      description="Elige el año con el que quieres trabajar en el selector de año."
      title="Sin año en contexto"
    />
  );

  return (
    <div className="academic-stack">
      <AdminTabList<EnrollmentSection>
        idPrefix="admin-enrollments"
        label="Tareas de matrícula"
        onSelect={selectSection}
        options={[
          { value: 'admit', label: 'Incorporar alumno nuevo' },
          { value: 'enroll', label: 'Matricular alumno existente' },
          { value: 'promotion', label: 'Avance anual' },
          { value: 'review', label: 'Por revisar' },
        ]}
        selected={section}
      />
      <div
        aria-labelledby={`admin-enrollments-tab-${section}`}
        className="admin-tab-panel"
        id="admin-enrollments-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {section === 'admit' ? (
          !contextYear ? (
            noYearNotice
          ) : readOnly ? (
            readOnlyNotice
          ) : (
            <section className="academic-panel">
              <StudentAdmissionForm
                api={api}
                initialYearId={contextYear.id}
                key={contextYear.id}
                onSaved={onSaved}
              />
              <p className="integration-note">
                <Icon name="users" />
                La matrícula no crea la cuenta de acceso. Actívala después desde
                Personas, en la columna «Acceso a la plataforma».
              </p>
            </section>
          )
        ) : null}

        {section === 'enroll' ? (
          !contextYear ? (
            noYearNotice
          ) : readOnly ? (
            readOnlyNotice
          ) : (
            <EnrollExistingStudentPanel
              academicYearId={contextYear.id}
              api={api}
              data={data}
              key={contextYear.id}
              onSaved={onSaved}
            />
          )
        ) : null}

        {section === 'promotion' ? (
          <CoursePromotionPanel
            academicYears={data.academicYears}
            api={api}
            courses={data.courses}
            onSaved={onSaved}
          />
        ) : null}

        {section === 'review' ? (
          <InconsistentEnrollmentsPanel api={api} />
        ) : null}
      </div>
    </div>
  );
}
