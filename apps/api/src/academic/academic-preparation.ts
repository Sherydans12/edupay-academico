import type { AcademicPreparationStatus } from '@edupay/contracts';

export type AcademicPreparationYearStatus =
  'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface AcademicPreparationYear {
  id: string;
  status: AcademicPreparationYearStatus;
}

export interface AcademicPreparationCourseCounts {
  active: number;
  draft: number;
}

interface AcademicPreparationInput {
  evaluatedAt: string;
  years: readonly AcademicPreparationYear[];
  courses: AcademicPreparationCourseCounts | null;
}

export function evaluateAcademicPreparation({
  courses,
  evaluatedAt,
  years,
}: AcademicPreparationInput): AcademicPreparationStatus {
  const activeYears = years.filter((year) => year.status === 'ACTIVE');
  const selectedActiveYearId =
    activeYears.length === 1 ? (activeYears[0]?.id ?? null) : null;
  const draftYearCount = years.filter((year) => year.status === 'DRAFT').length;

  const academicYearCheck: AcademicPreparationStatus['checks'][number] =
    years.length === 0
      ? {
          code: 'ACADEMIC_YEAR',
          status: 'ACTION_REQUIRED',
          action: 'Crear año académico',
          message: 'Crea un año académico para comenzar la preparación.',
        }
      : activeYears.length === 0
        ? {
            code: 'ACADEMIC_YEAR',
            status: 'ACTION_REQUIRED',
            action: 'Activar un año académico',
            message: draftYearCount
              ? 'Activa un año académico para preparar la estructura base.'
              : 'Crea y activa un año académico para preparar la estructura base.',
          }
        : activeYears.length > 1
          ? {
              code: 'ACADEMIC_YEAR',
              status: 'BLOCKED',
              action: 'Resolver años activos',
              message:
                'Hay más de un año activo. Resuelve esa ambigüedad antes de validar la estructura base.',
            }
          : {
              code: 'ACADEMIC_YEAR',
              status: 'READY',
              action: null,
              message: 'Hay un único año académico activo.',
            };

  const courseCheck: AcademicPreparationStatus['checks'][number] =
    selectedActiveYearId === null
      ? {
          code: 'COURSES',
          status: 'ACTION_REQUIRED',
          action: 'Activar un año académico primero',
          message:
            'No se evalúan cursos hasta que exista un único año académico activo.',
        }
      : courses && courses.active > 0
        ? {
            code: 'COURSES',
            status: 'READY',
            action: null,
            message: 'Hay cursos activos en el año académico seleccionado.',
          }
        : {
            code: 'COURSES',
            status: 'ACTION_REQUIRED',
            action:
              courses && courses.draft > 0
                ? 'Activar un curso'
                : 'Crear un curso',
            message:
              courses && courses.draft > 0
                ? 'Activa al menos un curso dentro del año académico seleccionado.'
                : 'Crea al menos un curso dentro del año académico seleccionado.',
          };

  const checks = [academicYearCheck, courseCheck];
  const status = checks.some((check) => check.status === 'BLOCKED')
    ? 'BLOCKED'
    : checks.every((check) => check.status === 'READY')
      ? 'READY'
      : 'ACTION_REQUIRED';

  return {
    scope: 'ACADEMIC_BASE',
    status,
    ready: status === 'READY',
    evaluatedAt,
    academicYears: {
      total: years.length,
      active: activeYears.length,
      draft: draftYearCount,
      selectedActiveYearId,
    },
    courses: {
      activeInSelectedYear:
        selectedActiveYearId === null ? null : (courses?.active ?? 0),
      draftInSelectedYear:
        selectedActiveYearId === null ? null : (courses?.draft ?? 0),
    },
    checks,
  };
}
