'use client';

import type { InAppNotification } from '@edupay/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { AcademicApiClient } from '@/api/academic-client';
import { Icon, type IconName } from '@/components/icons';

export type NotificationApiClient = Pick<
  AcademicApiClient,
  | 'listNotifications'
  | 'getUnreadNotificationCount'
  | 'markNotificationRead'
  | 'markAllNotificationsRead'
>;

type NotificationType = InAppNotification['type'];

const NOTIFICATION_PAGE_SIZE = 20;
const NOTIFICATION_REFRESH_MS = 60_000;

const notificationTypeMeta: Record<NotificationType, { icon: IconName; label: string }> = {
  ASSIGNMENT_PUBLISHED: { icon: 'clipboard', label: 'Actividad publicada' },
  ASSESSMENT_PUBLISHED: { icon: 'document', label: 'Evaluación publicada' },
  ANNOUNCEMENT_PUBLISHED: { icon: 'message', label: 'Aviso publicado' },
  SUBMISSION_RECEIVED: { icon: 'upload', label: 'Entrega recibida' },
  RESUBMISSION_RECEIVED: { icon: 'upload', label: 'Reentrega recibida' },
  SUBMISSION_REVIEWED: { icon: 'check', label: 'Entrega revisada' },
  CHANGES_REQUESTED: { icon: 'review', label: 'Correcciones solicitadas' },
};

export function getSafeNotificationTargetPath(targetPath: string): string | null {
  const value = targetPath.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;

  try {
    const url = new URL(value, 'https://edupay.academico.invalid');
    if (url.origin !== 'https://edupay.academico.invalid' || !url.pathname.startsWith('/')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function formatNotificationDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function mergeNotifications(current: InAppNotification[], incoming: InAppNotification[]): InAppNotification[] {
  const merged = new Map(current.map((notification) => [notification.id, notification]));
  incoming.forEach((notification) => merged.set(notification.id, notification));
  return Array.from(merged.values());
}

export function NotificationCenter({ api }: { api?: NotificationApiClient | undefined }) {
  const router = useRouter();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingReadIds = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(api ? null : 0);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(!api);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.getUnreadNotificationCount();
      setUnreadCount(result.count);
      setCountError(null);
    } catch {
      setCountError('No pudimos actualizar tus notificaciones. Puedes reintentarlo.');
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const initialLoad = window.setTimeout(() => void refreshUnreadCount(), 0);
    const handleFocus = () => void refreshUnreadCount();
    window.addEventListener('focus', handleFocus);
    const interval = window.setInterval(handleFocus, NOTIFICATION_REFRESH_MS);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
    };
  }, [api, refreshUnreadCount]);

  const loadNotifications = useCallback(async (cursor?: string) => {
    if (!api) return;
    if (cursor) setLoadingMore(true);
    else setLoadingList(true);
    setListError(null);
    try {
      const page = await api.listNotifications(cursor, NOTIFICATION_PAGE_SIZE);
      setNotifications((current) => cursor ? mergeNotifications(current, page.items) : page.items);
      setNextCursor(page.nextCursor);
      setListLoaded(true);
    } catch {
      setListError('No pudimos cargar las notificaciones. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      if (cursor) setLoadingMore(false);
      else setLoadingList(false);
    }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleOpenNotification = async (notification: InAppNotification) => {
    const targetPath = getSafeNotificationTargetPath(notification.targetPath);
    if (!targetPath) {
      setActionError('Este destino no está disponible dentro de EduPay Académico.');
      return;
    }

    if (!notification.readAt && api && !pendingReadIds.current.has(notification.id)) {
      pendingReadIds.current.add(notification.id);
      try {
        const updated = await api.markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
        setUnreadCount((current) => current === null ? current : Math.max(0, current - 1));
        setActionError(null);
      } catch {
        setActionError('No pudimos marcar esta notificación como leída. El estado se conservará para que puedas reintentarlo.');
      } finally {
        pendingReadIds.current.delete(notification.id);
      }
    }

    closePanel();
    router.push(targetPath);
  };

  const handleMarkAllRead = async () => {
    if (!api || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setActionError(null);
    try {
      await api.markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })));
      setUnreadCount(0);
    } catch {
      setActionError('No pudimos marcar todas como leídas. Puedes reintentarlo.');
    } finally {
      setMarkingAll(false);
    }
  };

  const countLabel = unreadCount === null ? 'cargando' : unreadCount === 1 ? '1 sin leer' : `${unreadCount} sin leer`;
  const hasUnread = unreadCount === null ? notifications.some((notification) => !notification.readAt) : unreadCount > 0;
  const error = listError ?? actionError ?? countError;
  const handleRetry = () => {
    if (countError) void refreshUnreadCount();
    if (!listLoaded || listError || actionError) void loadNotifications();
  };

  return (
    <div className="notification-center">
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notificaciones, ${countLabel}`}
        className="topbar-icon notification-button"
        onClick={() => {
          if (open) {
            closePanel();
            return;
          }
          setOpen(true);
          if (!listLoaded) void loadNotifications();
        }}
        ref={triggerRef}
        type="button"
      >
        <Icon name="bell" />
        {unreadCount && unreadCount > 0 ? <span aria-hidden="true" className="notification-dot">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        <span className="sr-only">{unreadCount === null ? 'El conteo se está actualizando.' : unreadCount === 0 ? 'No tienes notificaciones sin leer.' : `${unreadCount} notificaciones sin leer.`}</span>
      </button>

      {open ? (
        <div aria-labelledby={`${panelId}-title`} className="notification-panel" id={panelId} ref={panelRef} role="dialog" tabIndex={-1}>
          <header className="notification-panel__header">
            <div>
              <h2 id={`${panelId}-title`}>Notificaciones</h2>
              <p>{hasUnread ? `${unreadCount ?? 'Algunas'} pendientes de revisar` : 'Todo al día'}</p>
            </div>
            <button aria-label="Cerrar notificaciones" className="notification-panel__close" onClick={closePanel} type="button">
              <Icon name="close" />
            </button>
          </header>

          {error ? (
            <div className="notification-error" role="alert">
              <p>{error}</p>
              <button onClick={handleRetry} type="button">Reintentar</button>
            </div>
          ) : null}

          <div className="notification-panel__actions">
            <span className="notification-panel__count" aria-live="polite">{unreadCount === null ? 'Actualizando…' : `${unreadCount} sin leer`}</span>
            <button disabled={!hasUnread || markingAll} onClick={() => void handleMarkAllRead()} type="button">
              {markingAll ? 'Marcando…' : 'Marcar todo como leído'}
            </button>
          </div>

          <div aria-busy={loadingList || loadingMore} className="notification-list-wrap">
            {loadingList ? <p className="notification-status" role="status">Cargando notificaciones…</p> : null}
            {!loadingList && listLoaded && notifications.length === 0 ? (
              <div className="notification-empty" role="status">
                <span className="notification-empty__icon"><Icon name="bell" /></span>
                <strong>No tienes notificaciones</strong>
                <p>Cuando haya una novedad sobre tus actividades o entregas, aparecerá aquí.</p>
              </div>
            ) : null}
            {!loadingList && notifications.length > 0 ? (
              <ul aria-label="Lista de notificaciones" className="notification-list">
                {notifications.map((notification) => {
                  const meta = notificationTypeMeta[notification.type];
                  const unread = !notification.readAt;
                  return (
                    <li className={`notification-list__item ${unread ? 'notification-list__item--unread' : ''}`} key={notification.id}>
                      <button className="notification-item" onClick={() => void handleOpenNotification(notification)} type="button">
                        <span aria-hidden="true" className="notification-item__icon"><Icon name={meta.icon} /></span>
                        <span className="notification-item__content">
                          <span className="notification-item__meta">
                            <span>{meta.label}</span>
                            <time dateTime={notification.createdAt}>{formatNotificationDate(notification.createdAt)}</time>
                          </span>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                          <span className="notification-item__state">{unread ? 'Sin leer · Abrir' : 'Leída · Abrir'}</span>
                        </span>
                        <Icon aria-hidden="true" className="notification-item__chevron" name="chevron-right" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {nextCursor ? (
              <button className="notification-load-more" disabled={loadingMore} onClick={() => void loadNotifications(nextCursor)} type="button">
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
