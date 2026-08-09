import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  inAppNotificationSchema,
  markedNotificationsSchema,
  notificationPageSchema,
  unreadNotificationCountSchema,
} from '@edupay/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getSafeNotificationTargetPath,
  NotificationCenter,
  type NotificationApiClient,
} from '@/components/notification-center';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const timestamp = '2026-08-08T12:00:00+00:00';

function notification(overrides: Record<string, unknown> = {}) {
  return inAppNotificationSchema.parse({
    id: '00000000-0000-4000-8000-000000000030',
    eventId: 'event-1',
    type: 'ASSIGNMENT_PUBLISHED',
    title: 'Nueva actividad de Lenguaje',
    body: 'La actividad ya está publicada.',
    targetPath: '/estudiante/asignaturas/lenguaje/items/resena-literaria',
    createdAt: timestamp,
    readAt: null,
    ...overrides,
  });
}

function makeApi({
  count = 1,
  firstPage = [notification()],
  nextCursor = null,
  nextPage = [],
}: {
  count?: number;
  firstPage?: ReturnType<typeof notification>[];
  nextCursor?: string | null;
  nextPage?: ReturnType<typeof notification>[];
} = {}): NotificationApiClient & { pageCalls: string[] } {
  const pageCalls: string[] = [];
  const api: NotificationApiClient & { pageCalls: string[] } = {
    pageCalls,
    getUnreadNotificationCount: vi.fn(async () => unreadNotificationCountSchema.parse({ count })),
    listNotifications: vi.fn(async (cursor?: string) => {
      pageCalls.push(cursor ?? 'first');
      return notificationPageSchema.parse(cursor ? { items: nextPage, nextCursor: null } : { items: firstPage, nextCursor });
    }),
    markNotificationRead: vi.fn(async (id: string) => inAppNotificationSchema.parse({ ...firstPage.find((item) => item.id === id) ?? notification({ id }), readAt: timestamp })),
    markAllNotificationsRead: vi.fn(async () => markedNotificationsSchema.parse({ updatedCount: count })),
  };
  return api;
}

async function openNotifications(api: NotificationApiClient) {
  render(<NotificationCenter api={api} />);
  const trigger = screen.getByRole('button', { name: /Notificaciones/ });
  await waitFor(() => expect(api.getUnreadNotificationCount).toHaveBeenCalledOnce());
  fireEvent.click(trigger);
  return { trigger, panel: await screen.findByRole('dialog', { name: 'Notificaciones' }) };
}

describe('NotificationCenter', () => {
  afterEach(() => {
    cleanup();
    router.push.mockReset();
  });

  it('loads the unread count after the client is available and renders the list with read distinction', async () => {
    const api = makeApi({
      count: 2,
      firstPage: [
        notification({ type: 'ASSIGNMENT_PUBLISHED' }),
        notification({ id: '00000000-0000-4000-8000-000000000031', type: 'ASSESSMENT_PUBLISHED', title: 'Evaluación publicada', readAt: timestamp }),
      ],
    });

    await openNotifications(api);
    expect(await screen.findByText('Actividad publicada')).toBeTruthy();
    expect(screen.getAllByText('Evaluación publicada').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sin leer · Abrir')).toBeTruthy();
    expect(screen.getByText('Leída · Abrir')).toBeTruthy();
    expect(screen.getByText('2 sin leer')).toBeTruthy();
  });

  it('supports student notification types, marks read, and navigates only to the server path', async () => {
    const api = makeApi({
      firstPage: [
        notification({ type: 'SUBMISSION_REVIEWED', title: 'Tu entrega fue revisada', targetPath: '/estudiante/entregas' }),
        notification({ id: '00000000-0000-4000-8000-000000000032', type: 'CHANGES_REQUESTED', title: 'Hay correcciones solicitadas', targetPath: '/estudiante/asignaturas/lenguaje/items/resena-literaria' }),
      ],
    });

    await openNotifications(api);
    fireEvent.click(screen.getByRole('button', { name: /Tu entrega fue revisada/ }));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000030'));
    expect(router.push).toHaveBeenCalledWith('/estudiante/entregas');
  });

  it('supports teacher notification types and marks all as read', async () => {
    const api = makeApi({
      count: 2,
      firstPage: [
        notification({ type: 'SUBMISSION_RECEIVED', title: 'Nueva entrega recibida', targetPath: '/docente/revisiones/one' }),
        notification({ id: '00000000-0000-4000-8000-000000000033', type: 'RESUBMISSION_RECEIVED', title: 'Nueva reentrega recibida', targetPath: '/docente/revisiones/two' }),
      ],
    });

    await openNotifications(api);
    expect(screen.getByText('Entrega recibida')).toBeTruthy();
    expect(screen.getByText('Reentrega recibida')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todo como leído' }));

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledOnce());
    expect(screen.getByText('0 sin leer')).toBeTruthy();
    expect(screen.getAllByText('Leída · Abrir')).toHaveLength(2);
  });

  it('loads the next cursor page without requesting an unbounded history', async () => {
    const api = makeApi({
      firstPage: [notification()],
      nextCursor: 'opaque-next-cursor',
      nextPage: [notification({ id: '00000000-0000-4000-8000-000000000034', title: 'Segunda notificación' })],
    });

    await openNotifications(api);
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(api.pageCalls).toEqual(['first', 'opaque-next-cursor']));
    expect(screen.getByText('Segunda notificación')).toBeTruthy();
    expect(api.listNotifications).toHaveBeenLastCalledWith('opaque-next-cursor', 20);
  });

  it('rejects external or unsafe target paths before read or navigation', async () => {
    expect(getSafeNotificationTargetPath('https://example.com')).toBeNull();
    expect(getSafeNotificationTargetPath('//example.com')).toBeNull();
    expect(getSafeNotificationTargetPath('javascript:alert(1)')).toBeNull();
    expect(getSafeNotificationTargetPath('/docente/revisiones?filter=mine#latest')).toBe('/docente/revisiones?filter=mine#latest');

    const api = makeApi({ firstPage: [notification({ targetPath: 'https://example.com' })] });
    await openNotifications(api);
    fireEvent.click(screen.getByRole('button', { name: /Nueva actividad/ }));

    expect(api.markNotificationRead).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain('destino no está disponible');
  });

  it('shows a calm empty state and a recoverable API error', async () => {
    const emptyApi = makeApi({ count: 0, firstPage: [] });
    await openNotifications(emptyApi);
    expect(await screen.findByText('No tienes notificaciones')).toBeTruthy();

    cleanup();
    const retryApi = makeApi({ count: 0, firstPage: [] });
    retryApi.listNotifications = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(notificationPageSchema.parse({ items: [], nextCursor: null }));
    render(<NotificationCenter api={retryApi} />);
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No tienes notificaciones')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Notificaciones/ })).toBeTruthy();
  });

  it('returns focus to the bell when the panel closes', async () => {
    const api = makeApi();
    const { trigger } = await openNotifications(api);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificaciones' }));
    expect(document.activeElement).toBe(trigger);
  });
});
