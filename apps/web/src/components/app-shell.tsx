'use client';

import { Avatar, DropdownItem, DropdownMenu } from '@edupay/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
      icon: 'book-open',
      label: 'Asignaturas',
      mobile: true,
    },
    {
      href: '/docente/revisiones',
      icon: 'file-text',
      label: 'Revisiones',
      mobile: true,
    },
    {
      href: '/docente/calendario',
      icon: 'calendar',
      label: 'Calendario',
      mobile: true,
    },
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

const accountNavigation: Record<WorkspaceKind, NavigationItem[]> = {
  staff: [],
  student: [
    { href: '/estudiante/perfil', icon: 'users', label: 'Mi perfil' },
    {
      href: '/estudiante/configuracion',
      icon: 'settings',
      label: 'Configuración',
    },
  ],
  teacher: [
    { href: '/docente/perfil', icon: 'users', label: 'Mi perfil' },
    {
      href: '/docente/configuracion',
      icon: 'settings',
      label: 'Configuración',
    },
  ],
  'tenant-admin': [
    { href: '/administracion/perfil', icon: 'users', label: 'Mi perfil' },
    {
      href: '/administracion/configuracion',
      icon: 'settings',
      label: 'Configuración',
    },
  ],
};

function getAccountHrefs(workspace: WorkspaceKind) {
  switch (workspace) {
    case 'teacher':
      return {
        profileHref: '/docente/perfil',
        settingsHref: '/docente/configuracion',
      };
    case 'student':
      return {
        profileHref: '/estudiante/perfil',
        settingsHref: '/estudiante/configuracion',
      };
    case 'tenant-admin':
      return {
        profileHref: '/administracion/perfil',
        settingsHref: '/administracion/configuracion',
      };
    default:
      return {
        profileHref: '/docente/perfil',
        settingsHref: '/docente/configuracion',
      };
  }
}

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
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
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
  const { profileHref, settingsHref } = getAccountHrefs(session.workspace);
  const workspaceItems = workspaceNavigation[session.workspace];
  const accountItems = accountNavigation[session.workspace] ?? [];
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
  const navigation = [...workspaceItems, ...moduleItems, ...accountItems];
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

  useEffect(() => {
    if (!mobileOpen) return;
    mobileMenuRef.current?.querySelector<HTMLElement>('.sidebar-link')?.focus();
  }, [mobileOpen]);

  function closeMobileNavigation() {
    setMobileOpen(false);
    mobileMenuButtonRef.current?.focus();
  }

  return (
    <div className="app-shell" data-workspace={session.workspace}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside
        aria-label="Navegación principal"
        className={`app-sidebar ${mobileOpen ? 'app-sidebar--open' : ''}`}
        data-workspace={session.workspace}
        id="app-sidebar-navigation"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !mobileOpen) return;
          event.preventDefault();
          closeMobileNavigation();
        }}
        ref={mobileMenuRef}
      >
        <div className="brand-lockup">
          <div aria-label="EduPay Académico" className="brand-mark" role="img">
            <Icon name="graduation-cap" />
          </div>
          <div className="brand-copy">
            <strong>{session.tenantDisplayName}</strong>
            <span className="brand-badge">
              {session.workspace === 'teacher'
                ? 'Portal Docente'
                : 'EduPay Académico'}
            </span>
          </div>
          <button
            aria-label="Cerrar navegación"
            className="sidebar-close"
            onClick={closeMobileNavigation}
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
                  <span className="sidebar-link__icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="sidebar-link__label">{item.label}</span>
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
                  <span className="sidebar-link__icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="sidebar-link__label">{item.label}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </nav>
        <div className="sidebar-context">
          <div className="sidebar-user">
            <div className="sidebar-user__avatar-wrap">
              <Avatar name={session.displayName} size="md" />
              <span className="sidebar-user__online-dot" aria-hidden="true" />
            </div>
            <div className="sidebar-user__info">
              <strong>{session.displayName}</strong>
              <span className="sidebar-user__role">{session.roleLabel}</span>
            </div>
          </div>
          <div className="sidebar-user__quick-actions">
            <Link
              aria-label="Ir a mi perfil"
              className="sidebar-user__quick-btn"
              href={profileHref}
              onClick={() => setMobileOpen(false)}
              title="Ir a mi perfil"
            >
              <Icon name="users" />
              <span>Mi perfil</span>
            </Link>
            <Link
              aria-label="Configuración"
              className="sidebar-user__quick-btn"
              href={settingsHref}
              onClick={() => setMobileOpen(false)}
              title="Configuración"
            >
              <Icon name="settings" />
              <span>Configuración</span>
            </Link>
          </div>
          <div className="sidebar-context__tenant">
            <span className="tenant-status-dot" aria-hidden="true" />
            <p>{session.tenantDisplayName}</p>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          aria-label="Cerrar navegación"
          className="sidebar-scrim"
          onClick={closeMobileNavigation}
          type="button"
        />
      ) : null}

      <div className="app-frame">
        <header className="app-topbar">
          <button
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar-navigation"
            aria-label="Abrir navegación"
            className="topbar-icon mobile-menu-button"
            onClick={() => setMobileOpen(true)}
            ref={mobileMenuButtonRef}
            type="button"
          >
            <Icon name="menu" />
          </button>
          <div aria-label="Contexto actual" className="topbar-location">
            <div className="topbar-location__crumb">
              <span className="topbar-location__tenant">
                <span className="topbar-location__tenant-dot" aria-hidden="true" />
                {session.tenantDisplayName}
              </span>
              <span className="topbar-location__sep" aria-hidden="true">/</span>
              <strong className="topbar-location__page">
                {activeNavigationItem?.label ?? 'Espacio académico'}
              </strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-quick-links" aria-label="Accesos rápidos de cuenta">
              <Link
                aria-label="Ir a mi perfil"
                className={`topbar-quick-link ${isCurrentPath(pathname, profileHref) ? 'topbar-quick-link--active' : ''}`}
                href={profileHref}
                title="Ir a mi perfil"
              >
                <Icon name="users" />
                <span className="topbar-quick-link__text">Mi perfil</span>
              </Link>
              <Link
                aria-label="Configuración"
                className={`topbar-quick-link ${isCurrentPath(pathname, settingsHref) ? 'topbar-quick-link--active' : ''}`}
                href={settingsHref}
                title="Configuración"
              >
                <Icon name="settings" />
                <span className="topbar-quick-link__text">Configuración</span>
              </Link>
            </div>
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
              <DropdownItem onSelect={() => router.push(profileHref)}>
                Ir a mi perfil
              </DropdownItem>
              <DropdownItem onSelect={() => router.push(settingsHref)}>
                Configuración
              </DropdownItem>
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
