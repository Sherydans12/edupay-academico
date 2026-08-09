import type { CourseSubject, LearningItem, LearningUnitWithItems } from '@edupay/contracts';

import { AcademicApiError } from '@/api/academic-client';
import type { SubjectCardViewModel } from '@/components/page-primitives';

const accents: SubjectCardViewModel['accent'][] = ['blue', 'turquoise', 'purple', 'yellow'];

export function subjectName(subject: CourseSubject) {
  return subject.subject?.name ?? `Asignatura ${subject.subjectId.slice(0, 8)}`;
}

export function courseName(subject: CourseSubject) {
  return subject.course?.label ?? `Curso ${subject.courseId.slice(0, 8)}`;
}

export function subjectCard(subject: CourseSubject, index: number, audience: 'student' | 'teacher'): SubjectCardViewModel {
  return {
    accent: accents[index % accents.length] ?? 'blue',
    code: subjectName(subject).slice(0, 3).toUpperCase(),
    href: `/${audience === 'student' ? 'estudiante' : 'docente'}/asignaturas/${subject.id}`,
    id: subject.id,
    routeLabel: audience === 'teacher' ? 'Gestionar contenido' : 'Ruta activa',
    subtitle: courseName(subject),
    title: subjectName(subject),
  };
}

export function formatInstant(value: string) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}

export function isEffectivelyVisible(item: LearningItem, now = Date.now()) {
  return item.publicationStatus === 'PUBLISHED' ||
    (item.publicationStatus === 'SCHEDULED' && item.publishAt !== null && new Date(item.publishAt).getTime() <= now);
}

export function visibleStudentUnits(units: LearningUnitWithItems[]) {
  return units
    .filter((unit) => unit.status === 'ACTIVE')
    .map((unit) => ({
      ...unit,
      items: unit.items.filter((item) => isEffectivelyVisible(item)),
    }));
}

export function deliverableItems(units: LearningUnitWithItems[]) {
  return units.flatMap((unit) => unit.items.filter((item) => item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT'));
}

export function errorCopy(error: unknown, fallback = 'No pudimos cargar la información. Revisa tu conexión e inténtalo nuevamente.') {
  if (error instanceof AcademicApiError) {
    if (error.status === 0) return { title: 'No pudimos conectar', body: error.message };
    if (error.status === 401) return { title: 'Sesión expirada', body: error.message };
    if (error.status === 403) return { title: 'Acceso no autorizado', body: 'El servidor no reconoce una relación activa que permita ver este contenido.' };
    if (error.status === 404) return { title: 'Contenido no encontrado', body: 'Puede que este contenido haya sido archivado o ya no esté disponible.' };
    if (error.status === 409) return { title: 'El contenido cambió', body: error.message };
    return { title: 'No pudimos completar la solicitud', body: error.message };
  }
  return { title: 'No pudimos cargar la información', body: fallback };
}

export function isSensitiveConfirmationError(error: unknown) {
  return error instanceof AcademicApiError && error.status === 409 && /confirm|confirmation|evidence|student work|published|scheduled/i.test(error.message);
}
