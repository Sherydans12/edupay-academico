import type { NotificationEventType } from '../generated/prisma/client';

export const ACADEMIC_NOTIFICATION_TEMPLATE_VERSION = 'v1';

/**
 * Notification links are persisted and later rendered by the worker, so they
 * must stay inside the current application even if a future caller supplies
 * an unexpected value. Backslashes are rejected because browsers can treat
 * them as URL separators in otherwise relative-looking paths.
 */
export function isSafeApplicationPath(value: string): boolean {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }
  try {
    return (
      new URL(value, 'https://edupay-academico.invalid').origin ===
      'https://edupay-academico.invalid'
    );
  } catch {
    return false;
  }
}

export interface AcademicNotificationPayload {
  readonly courseSubjectId: string;
  readonly learningItemId: string;
  readonly learningItemTitle: string;
  readonly subjectName: string;
  readonly dueAt?: string | null;
  readonly targetPath: string;
  readonly submissionId?: string;
  readonly submissionRevisionId?: string;
  readonly reviewStatus?: 'REVIEWED' | 'CHANGES_REQUESTED';
}

export interface NotificationCopy {
  readonly title: string;
  readonly body: string;
}

export interface AcademicEmailContent extends NotificationCopy {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function notificationCopy(
  eventType: NotificationEventType,
  payload: AcademicNotificationPayload,
): NotificationCopy {
  switch (eventType) {
    case 'ASSIGNMENT_PUBLISHED':
      return {
        title: 'Nueva tarea disponible',
        body: `${payload.subjectName}: ${payload.learningItemTitle}${dueText(payload.dueAt)}`,
      };
    case 'ASSESSMENT_PUBLISHED':
      return {
        title: 'Nueva evaluación disponible',
        body: `${payload.subjectName}: ${payload.learningItemTitle}${dueText(payload.dueAt)}`,
      };
    case 'ANNOUNCEMENT_PUBLISHED':
      return {
        title: 'Nuevo aviso',
        body: `${payload.subjectName}: ${payload.learningItemTitle}`,
      };
    case 'SUBMISSION_RECEIVED':
      return {
        title: 'Entrega recibida',
        body: `Se recibió una entrega para ${payload.learningItemTitle}.`,
      };
    case 'RESUBMISSION_RECEIVED':
      return {
        title: 'Nueva entrega recibida',
        body: `Se recibió una nueva versión de ${payload.learningItemTitle}.`,
      };
    case 'SUBMISSION_REVIEWED':
      return {
        title: 'Entrega revisada',
        body: `Tu entrega de ${payload.learningItemTitle} fue revisada.`,
      };
    case 'CHANGES_REQUESTED':
      return {
        title: 'Se solicitaron correcciones',
        body: `Tu entrega de ${payload.learningItemTitle} requiere correcciones.`,
      };
  }
}

export function renderAcademicEmail(
  eventType: NotificationEventType,
  payload: AcademicNotificationPayload,
  publicBaseUrl: string,
): AcademicEmailContent {
  const copy = notificationCopy(eventType, payload);
  const safePath = isSafeApplicationPath(payload.targetPath)
    ? payload.targetPath
    : '/';
  const link = new URL(safePath, publicBaseUrl).toString();
  const subject = `${copy.title} · ${payload.subjectName}`;
  const text = `${copy.body}\n\nVer en EduPay Académico: ${link}`;
  const html = `<p>${escapeHtml(copy.body)}</p><p><a href="${escapeHtml(link)}">Ver en EduPay Académico</a></p>`;
  return { ...copy, subject, text, html };
}

function dueText(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  return ` · Fecha de entrega: ${new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeZone: 'America/Santiago',
  }).format(date)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return replacements[character] ?? character;
  });
}
