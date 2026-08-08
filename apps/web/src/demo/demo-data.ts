import type { TrustedCurrentSession } from '@/auth/current-session';

export const demoSessions = {
  student: {
    displayName: 'Sofía Herrera',
    identityUserId: 'demo-user-student',
    membershipId: 'demo-membership-student',
    roleLabel: 'Estudiante · 7º Básico A',
    tenantDisplayName: 'Colegio Conquistadores',
    tenantId: 'demo-tenant-conquistadores',
    workspace: 'student',
  },
  teacher: {
    displayName: 'Camila Rojas',
    identityUserId: 'demo-user-teacher',
    membershipId: 'demo-membership-teacher',
    roleLabel: 'Docente',
    tenantDisplayName: 'Colegio Conquistadores',
    tenantId: 'demo-tenant-conquistadores',
    workspace: 'teacher',
  },
  admin: {
    displayName: 'Martín Silva',
    identityUserId: 'demo-user-admin',
    membershipId: 'demo-membership-admin',
    roleLabel: 'Administración académica',
    tenantDisplayName: 'Colegio Conquistadores',
    tenantId: 'demo-tenant-conquistadores',
    workspace: 'tenant-admin',
  },
} as const satisfies Record<string, TrustedCurrentSession>;

export type LearningItemKind = 'material' | 'assignment' | 'assessment' | 'announcement';
export type LearningItemState = 'complete' | 'current' | 'upcoming' | 'attention' | 'draft';

export interface LearningItemViewModel {
  description: string;
  dueLabel?: string;
  id: string;
  kind: LearningItemKind;
  state: LearningItemState;
  title: string;
}

export interface LearningUnitViewModel {
  description: string;
  id: string;
  items: LearningItemViewModel[];
  progressLabel: string;
  title: string;
}

export interface SubjectViewModel {
  accent: 'blue' | 'turquoise' | 'purple' | 'yellow';
  code: string;
  href: string;
  id: string;
  nextAction: string;
  progress: number;
  teacher: string;
  title: string;
}

export const studentSubjects: SubjectViewModel[] = [
  {
    accent: 'blue',
    code: 'LEN',
    href: '/estudiante/asignaturas/lenguaje',
    id: 'language',
    nextAction: 'Entregar reseña literaria',
    progress: 68,
    teacher: 'Prof. Camila Rojas',
    title: 'Lenguaje y Comunicación',
  },
  {
    accent: 'turquoise',
    code: 'MAT',
    href: '/estudiante/asignaturas',
    id: 'math',
    nextAction: 'Continuar guía de proporciones',
    progress: 74,
    teacher: 'Prof. Daniel Muñoz',
    title: 'Matemática',
  },
  {
    accent: 'purple',
    code: 'CIE',
    href: '/estudiante/asignaturas',
    id: 'science',
    nextAction: 'Revisar material del ecosistema',
    progress: 57,
    teacher: 'Prof. Elisa Soto',
    title: 'Ciencias Naturales',
  },
  {
    accent: 'yellow',
    code: 'HIS',
    href: '/estudiante/asignaturas',
    id: 'history',
    nextAction: 'Sin entregas esta semana',
    progress: 81,
    teacher: 'Prof. Andrés León',
    title: 'Historia y Geografía',
  },
];

export const languageUnits: LearningUnitViewModel[] = [
  {
    description: 'Reconocemos cómo una narración construye sus personajes y su mundo.',
    id: 'unit-1',
    progressLabel: '3 de 3 completados',
    title: 'Voces que cuentan historias',
    items: [
      { description: 'Lectura y guía de observación', id: 'item-1', kind: 'material', state: 'complete', title: 'El narrador y sus puntos de vista' },
      { description: 'Actividad de comprensión', id: 'item-2', kind: 'assignment', state: 'complete', title: 'Reconocer la voz narrativa' },
      { description: 'Mensaje de la profesora', id: 'item-3', kind: 'announcement', state: 'complete', title: 'Cierre de la primera unidad' },
    ],
  },
  {
    description: 'Leemos, conversamos y escribimos para compartir una mirada propia.',
    id: 'unit-2',
    progressLabel: '2 de 4 en curso',
    title: 'Lectores con opinión',
    items: [
      { description: 'Material de apoyo · 2 archivos', id: 'item-4', kind: 'material', state: 'complete', title: '¿Qué hace memorable una reseña?' },
      { description: 'Conversación guiada en clases', id: 'item-5', kind: 'announcement', state: 'complete', title: 'Selección de lectura personal' },
      { description: 'Entrega de documento · hasta 25 MB', dueLabel: 'Vence mañana, 20:00', id: 'item-6', kind: 'assignment', state: 'attention', title: 'Mi reseña literaria' },
      { description: 'Documento de reflexión', dueLabel: 'Disponible el 14 de agosto', id: 'item-7', kind: 'assessment', state: 'upcoming', title: 'Evaluación de lectura personal' },
    ],
  },
  {
    description: 'Próximamente: exploraremos cómo un texto cambia al pasar a escena.',
    id: 'unit-3',
    progressLabel: 'Comienza el 21 de agosto',
    title: 'Del texto a la escena',
    items: [
      { description: 'Disponible próximamente', id: 'item-8', kind: 'material', state: 'upcoming', title: 'Lenguaje teatral' },
    ],
  },
];

export interface AttentionItemViewModel {
  badge: string;
  due: string;
  href: string;
  id: string;
  subject: string;
  title: string;
  tone: 'warning' | 'info' | 'success';
}

export const studentAttention: AttentionItemViewModel[] = [
  { badge: 'Entrega próxima', due: 'Mañana · 20:00', href: '/estudiante/asignaturas/lenguaje/resena-literaria', id: 'attention-1', subject: 'Lenguaje y Comunicación', title: 'Mi reseña literaria', tone: 'warning' },
  { badge: 'Continuar', due: 'Viernes · 18:00', href: '/estudiante/asignaturas', id: 'attention-2', subject: 'Matemática', title: 'Guía de proporciones', tone: 'info' },
  { badge: 'Nuevo material', due: 'Publicado hoy', href: '/estudiante/asignaturas', id: 'attention-3', subject: 'Ciencias Naturales', title: 'Ecosistemas de Chile', tone: 'success' },
];

export interface TeacherSubjectViewModel extends SubjectViewModel {
  course: string;
  pendingReviews: number;
  studentCount: number;
}

export const teacherSubjects: TeacherSubjectViewModel[] = [
  { accent: 'blue', code: 'LEN', course: '7º Básico A', href: '/docente/asignaturas/lenguaje', id: 'teacher-language-7a', nextAction: '5 entregas por revisar', pendingReviews: 5, progress: 72, studentCount: 32, teacher: 'Camila Rojas · Paula Medina', title: 'Lenguaje y Comunicación' },
  { accent: 'purple', code: 'LEN', course: '7º Básico B', href: '/docente/asignaturas', id: 'teacher-language-7b', nextAction: '2 borradores de contenido', pendingReviews: 2, progress: 61, studentCount: 30, teacher: 'Camila Rojas', title: 'Lenguaje y Comunicación' },
  { accent: 'turquoise', code: 'TAL', course: '8º Básico A', href: '/docente/asignaturas', id: 'teacher-workshop-8a', nextAction: 'Sin revisiones pendientes', pendingReviews: 0, progress: 80, studentCount: 29, teacher: 'Camila Rojas · Martín Díaz', title: 'Taller de Escritura' },
];

export interface SubmissionViewModel {
  course: string;
  fileCount: number;
  id: string;
  status: 'pending' | 'late' | 'reviewed';
  student: string;
  submittedAt: string;
  title: string;
}

export const submissions: SubmissionViewModel[] = [
  { course: '7º A', fileCount: 2, id: 'submission-1', status: 'pending', student: 'Emilia Vargas', submittedAt: 'Hoy, 09:18', title: 'Mi reseña literaria' },
  { course: '7º A', fileCount: 1, id: 'submission-2', status: 'late', student: 'Benjamín Soto', submittedAt: 'Ayer, 21:04', title: 'Mi reseña literaria' },
  { course: '7º A', fileCount: 2, id: 'submission-3', status: 'pending', student: 'Antonia Ruiz', submittedAt: 'Ayer, 18:42', title: 'Mi reseña literaria' },
  { course: '7º B', fileCount: 1, id: 'submission-4', status: 'reviewed', student: 'Vicente Lagos', submittedAt: '6 ago, 16:12', title: 'Crónica del barrio' },
];
