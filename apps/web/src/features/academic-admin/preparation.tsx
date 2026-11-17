'use client';

import { Badge, Button } from '@edupay/ui';
import type { AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';

import { errorMessage, type AdminData } from './shared';

export type PreparationStatus = Awaited<
  ReturnType<AcademicApiClient['getAcademicPreparationStatus']>
>['status'];

export function preparationStatusLabel(status: PreparationStatus): string {
  return status === 'READY'
    ? 'Preparada'
    : status === 'BLOCKED'
      ? 'Requiere revisión'
      : 'Pendiente';
}

export function preparationTone(
  status: PreparationStatus,
): 'neutral' | 'success' | 'warning' {
  return status === 'READY'
    ? 'success'
    : status === 'BLOCKED'
      ? 'warning'
      : 'neutral';
}

export function AcademicPreparationPanel({
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
            Ir a Cursos <Icon name="chevron-right" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
