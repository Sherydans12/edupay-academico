'use client';

import { Avatar, DropdownItem, DropdownMenu } from '@edupay/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type { CurrentSessionConsumerProps, WorkspaceKind } from '@/auth/current-session';
import { Icon, type IconName } from '@/components/icons';

interface NavigationItem {
  href: string;
  icon: IconName;
  label: string;
  mobile?: boolean;
}

const workspaceNavigation: Record<WorkspaceKind, NavigationItem[]> = {
  student: [
    { href: '/estudiante', icon: 'home', label: 'Inicio', mobile: true },
    { href: '/estudiante/asignaturas', icon: 'book', label: 'Asignaturas', mobile: true },
    { href: '/estudiante/entregas', icon: 'clipboard', label: 'Mis entregas', mobile: true },
    { href: '/estudiante/calendario', icon: 'calendar', label: 'Calendario' },
  ],
  teacher: [
    { href: '/docente', icon: 'home', label: 'Inicio', mobile: true },
    { href: '/docente/asignaturas', icon: 'book', label: 'Asignaturas', mobile: true },
    { href: '/docente/revisiones', icon: 'review', label: 'Revisiones', mobile: true },
    { href: '/docente/calendario', icon: 'calendar', label: 'Calendario' },
  ],
  'tenant-admin': [
    { href: '/administracion', icon: 'home', label: 'Resumen', mobile: true },
    { href: '/administracion/estructura', icon: 'layers', label: 'Estructura', mobile: true },
    { href: '/administracion/personas', icon: 'people', label: 'Personas', mobile: true },
    { href: '/administracion/configuracion', icon: 'settings', label: 'Configuración' },
  ],
};

function isCurrentPath(pathname: string, href: string) {
  if (pathname === href) return true;
  return href.split('/').filter(Boolean).length > 1 && pathname.startsWith(`${href}/`);
}

export function AppShell({ children, dataMode = 'demo', session }: CurrentSessionConsumerProps & { children: ReactNode; dataMode?: 'demo' | 'real' }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = workspaceNavigation[session.workspace];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <aside aria-label="Navegación principal" className={`app-sidebar ${mobileOpen ? 'app-sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div aria-label="Espacio para logo institucional aprobado" className="brand-mark" role="img">CC</div>
          <div className="brand-copy">
            <strong>Colegio Conquistadores</strong>
            <span>EduPay Académico</span>
          </div>
          <button aria-label="Cerrar navegación" className="sidebar-close" onClick={() => setMobileOpen(false)} type="button">
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const active = isCurrentPath(pathname, item.href);
            return (
              <Link aria-current={active ? 'page' : undefined} className="sidebar-link" href={item.href} key={item.href} onClick={() => setMobileOpen(false)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-context">
          <span>Espacio activo</span>
          <strong>{session.roleLabel}</strong>
          <p>La autorización real será validada por el servidor.</p>
        </div>
      </aside>

      {mobileOpen ? <button aria-label="Cerrar navegación" className="sidebar-scrim" onClick={() => setMobileOpen(false)} type="button" /> : null}

      <div className="app-frame">
        <header className="app-topbar">
          <button aria-expanded={mobileOpen} aria-label="Abrir navegación" className="topbar-icon mobile-menu-button" onClick={() => setMobileOpen(true)} type="button">
            <Icon name="menu" />
          </button>
          <button className="search-affordance" disabled title="La búsqueda se conectará en una fase posterior" type="button">
            <Icon name="search" />
            <span>Buscar en tu espacio</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button aria-label="Notificaciones, 3 sin leer; vista no interactiva" className="topbar-icon notification-button" disabled title="Las notificaciones se conectarán en una fase posterior" type="button">
              <Icon name="bell" />
              <span className="notification-dot">3</span>
            </button>
            <DropdownMenu
              label="Cuenta"
              trigger={
                <span className="account-trigger">
                  <Avatar name={session.displayName} size="sm" />
                  <span className="account-copy"><strong>{session.displayName}</strong><small>{session.roleLabel}</small></span>
                  <Icon name="chevron-down" />
                </span>
              }
            >
              <DropdownItem>Mi perfil</DropdownItem>
              <DropdownItem>Preferencias</DropdownItem>
              <DropdownItem>Ir a EduPay Identity</DropdownItem>
            </DropdownMenu>
          </div>
        </header>
        <div className={`demo-banner demo-banner--${dataMode}`} role="status">
          <span>{dataMode === 'real' ? 'Datos académicos y de aprendizaje reales' : 'Vista de demostración'}</span>
          <p>{dataMode === 'real' ? 'La estructura y las rutas de aprendizaje se cargan desde Academic Structure y Learning API. Entregas aún no conectadas.' : 'Contenido local para validar la experiencia; aprendizaje aún aislado del backend.'}</p>
        </div>
        <main className="app-content" id="main-content" tabIndex={-1}>{children}</main>
      </div>

      <nav aria-label="Navegación móvil" className="mobile-tabbar">
        {navigation.filter((item) => item.mobile).map((item) => {
          const active = isCurrentPath(pathname, item.href);
          return (
            <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
