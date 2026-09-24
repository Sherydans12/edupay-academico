'use client';

import { Avatar, DropdownItem, DropdownMenu } from '@edupay/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { createAcademicApiClient } from '@/api/client-factory';
import {
  getIdentitySessionAdapter,
  type CurrentSessionConsumerProps,
  type WorkspaceKind,
} from '@/auth/current-session';
import {
  destinationForRoles,
  useIdentitySession,
} from '@/auth/session-provider';
import { Icon, type IconName } from '@/components/icons';
import {
  NotificationCenter,
  type NotificationApiClient,
} from '@/components/notification-center';

interface NavigationItem {
  href: string;
  icon: IconName;
  label: string;
  mobile?: boolean;
}

const workspaceNavigation: Record<WorkspaceKind, NavigationItem[]> = {
  staff: [],
  student: [
    { href: '/estudiante', icon: 'home', label: 'Inicio', mobile: true },
    {
      href: '/estudiante/asignaturas',
      icon: 'book',
      label: 'Asignaturas',
      mobile: true,
    },
    {
      href: '/estudiante/entregas',
      icon: 'clipboard',
      label: 'Mis entregas',
      mobile: true,
    },
    { href: '/estudiante/calendario', icon: 'calendar', label: 'Calendario' },
  ],
  teacher: [
    { href: '/docente', icon: 'home', label: 'Inicio', mobile: true },
    {
      href: '/docente/asignaturas',
      icon: 'book',
      label: 'Asignaturas',
      mobile: true,
    },
    {
      href: '/docente/revisiones',
      icon: 'review',
      label: 'Revisiones',
      mobile: true,
    },
    { href: '/docente/calendario', icon: 'calendar', label: 'Calendario' },
  ],
  'tenant-admin': [
    { href: '/administracion', icon: 'home', label: 'Resumen', mobile: true },
    {
      href: '/administracion/estructura',
      icon: 'layers',
      label: 'Estructura',
      mobile: true,
    },
    {
      href: '/administracion/personas',
      icon: 'people',
      label: 'Personas',
      mobile: true,
    },
    {
      href: '/administracion/configuracion',
      icon: 'settings',
      label: 'Configuración',
    },
  ],
};

function isCurrentPath(pathname: string, href: string) {
  if (pathname === href) return true;
  return (
    href.split('/').filter(Boolean).length > 1 &&
    pathname.startsWith(`${href}/`)
  );
}

export function AppShell({
  children,
  dataMode = 'demo',
  notificationsApi,
  dieAccessGranted,
  session,
}: CurrentSessionConsumerProps & {
  children: ReactNode;
  dataMode?: 'demo' | 'real';
  notificationsApi?: NotificationApiClient;
  dieAccessGranted?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const identity = useIdentitySession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dieProbe, setDieProbe] = useState<{
    membershipId: string;
    allowed: boolean;
  } | null>(null);
  const defaultNotificationsApi = useMemo(
    () =>
      dataMode === 'real' && getIdentitySessionAdapter()
        ? createAcademicApiClient()
        : undefined,
    [dataMode],
  );
  const notificationApi = notificationsApi ?? defaultNotificationsApi;
  useEffect(() => {
    if (dieAccessGranted !== undefined) return;
    if (dataMode !== 'real' || session.roles.includes('STUDENT')) return;
    if (!getIdentitySessionAdapter()) return;
    let mounted = true;
    void createAcademicApiClient()
      .getDieAccess()
      .then(() => {
        if (mounted)
          setDieProbe({ membershipId: session.membershipId, allowed: true });
      })
      .catch(() => {
        if (mounted)
          setDieProbe({ membershipId: session.membershipId, allowed: false });
      });
    return () => {
      mounted = false;
    };
  }, [dataMode, dieAccessGranted, session.membershipId, session.roles]);
  const dieAllowed =
    dieAccessGranted ??
    (dieProbe?.membershipId === session.membershipId && dieProbe.allowed);
  const workspaceItems = workspaceNavigation[session.workspace];
  const moduleItems: NavigationItem[] = dieAllowed
    ? [
        {
          href: '/die',
          icon: 'review',
          label: 'Inclusión educativa',
          mobile: session.workspace === 'staff',
        },
      ]
    : [];
  const navigation = [...workspaceItems, ...moduleItems];
  const mobileNavigation = navigation.filter((item) => item.mobile);
  const activeNavigationItem = navigation.find((item) =>
    isCurrentPath(pathname, item.href),
  );
  const workspaceLabel = {
    student: 'Mi aprendizaje',
    teacher: 'Docencia',
    'tenant-admin': 'Gestión académica',
    staff: 'Espacio DIE',
  }[session.workspace];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside
        aria-label="Navegación principal"
        className={`app-sidebar ${mobileOpen ? 'app-sidebar--open' : ''}`}
      >
        <div className="brand-lockup">
          <div aria-label="EduPay Académico" className="brand-mark" role="img">
            EP
          </div>
          <div className="brand-copy">
            <strong>{session.tenantDisplayName}</strong>
            <span>EduPay Académico</span>
          </div>
          <button
            aria-label="Cerrar navegación"
            className="sidebar-close"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Navegación por rol y módulo" className="sidebar-nav">
          {workspaceItems.length ? (
            <div className="sidebar-nav-group">
              <span className="sidebar-nav-heading">{workspaceLabel}</span>
              {workspaceItems.map((item) => (
                <Link
                  aria-current={
                    isCurrentPath(pathname, item.href) ? 'page' : undefined
                  }
                  className="sidebar-link"
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ) : null}
          {moduleItems.length ? (
            <div className="sidebar-nav-group">
              <span className="sidebar-nav-heading">Módulo especializado</span>
              {moduleItems.map((item) => (
                <Link
                  aria-current={
                    isCurrentPath(pathname, item.href) ? 'page' : undefined
                  }
                  className="sidebar-link"
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </nav>
        <div className="sidebar-context">
          <span>Rol actual</span>
          <strong>{session.roleLabel}</strong>
          <p>{session.tenantDisplayName}</p>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          aria-label="Cerrar navegación"
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <div className="app-frame">
        <header className="app-topbar">
          <button
            aria-expanded={mobileOpen}
            aria-label="Abrir navegación"
            className="topbar-icon mobile-menu-button"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Icon name="menu" />
          </button>
          <div aria-label="Contexto actual" className="topbar-location">
            <span>{session.tenantDisplayName}</span>
            <strong>
              {activeNavigationItem?.label ?? 'Espacio académico'}
            </strong>
          </div>
          <div className="topbar-actions">
            <NotificationCenter api={notificationApi} />
            <DropdownMenu
              label="Cuenta"
              trigger={
                <span className="account-trigger">
                  <Avatar name={session.displayName} size="sm" />
                  <span className="account-copy">
                    <strong>{session.displayName}</strong>
                    <small>{session.roleLabel}</small>
                  </span>
                  <Icon name="chevron-down" />
                </span>
              }
            >
              {identity?.memberships
                .filter(
                  (membership) =>
                    membership.membershipId !== session.membershipId,
                )
                .map((membership) => (
                  <DropdownItem
                    key={membership.membershipId}
                    onSelect={() => {
                      void identity
                        .switchMembership(membership.membershipId)
                        .then((nextSession) => {
                          router.push(destinationForRoles(nextSession.roles));
                        });
                    }}
                  >
                    Cambiar a {membership.tenantHandle}
                  </DropdownItem>
                ))}
              <DropdownItem onSelect={() => void identity?.logout()}>
                Cerrar sesión
              </DropdownItem>
            </DropdownMenu>
          </div>
        </header>
        <div
          aria-label={
            dataMode === 'real'
              ? 'Datos reales. Contexto institucional activo.'
              : 'Demostración. Datos sintéticos.'
          }
          className={`demo-banner demo-banner--${dataMode}`}
          role="status"
        >
          <span>{dataMode === 'real' ? 'Datos reales' : 'Demostración'}</span>
          <p>
            {dataMode === 'real'
              ? 'Contexto institucional activo de Identity.'
              : 'Datos sintéticos; no se envían al API.'}
          </p>
        </div>
        <main className="app-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {mobileNavigation.length ? (
        <nav aria-label="Navegación móvil" className="mobile-tabbar">
          {mobileNavigation.map((item) => {
            const active = isCurrentPath(pathname, item.href);
            return (
              <Link
                aria-current={active ? 'page' : undefined}
                href={item.href}
                key={item.href}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
