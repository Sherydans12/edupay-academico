import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/app-shell';
import { demoSessions } from '@/demo/demo-data';

vi.mock('next/navigation', () => ({
  usePathname: () => '/estudiante',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('AppShell', () => {
  afterEach(cleanup);

  it('exposes role-configured navigation and a controllable compact menu', () => {
    render(
      <AppShell session={demoSessions.student}>
        <h1>Panel estudiante</h1>
      </AppShell>,
    );
    expect(
      screen.getAllByRole('link', { name: 'Asignaturas' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Notificaciones/ })).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Abrir navegación' });
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getAllByRole('button', { name: 'Cerrar navegación' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByText('Institución de demostración').length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Demostración')).toBeTruthy();
    expect(
      screen.getByText('Datos sintéticos; no se envían al API.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('navigation', {
        name: 'Navegación por rol y módulo',
      }),
    ).toBeTruthy();
  });

  it('moves focus into mobile navigation and restores it when Escape closes it', () => {
    render(
      <AppShell session={demoSessions.student}>
        <h1>Panel estudiante</h1>
      </AppShell>,
    );
    const open = screen.getByRole('button', { name: 'Abrir navegación' });
    fireEvent.click(open);
    const sidebar = within(
      screen.getByRole('complementary', { name: 'Navegación principal' }),
    );
    expect(document.activeElement).toBe(
      sidebar.getByRole('link', { name: 'Inicio' }),
    );
    fireEvent.keyDown(
      screen.getByRole('navigation', {
        name: 'Navegación por rol y módulo',
      }),
      { key: 'Escape' },
    );
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(open);
  });

  it('keeps the notification surface keyboard-operable in the shell', () => {
    render(
      <AppShell session={demoSessions.student}>
        <h1>Panel estudiante</h1>
      </AppShell>,
    );
    const trigger = screen.getByRole('button', { name: /Notificaciones/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar notificaciones' }),
    );
    expect(document.activeElement).toBe(trigger);
  });
});
