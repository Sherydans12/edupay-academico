import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/app-shell';
import { demoSessions } from '@/demo/demo-data';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante', useRouter: () => ({ push: vi.fn() }) }));

describe('AppShell', () => {
  afterEach(cleanup);

  it('exposes role-configured navigation and a controllable compact menu', () => {
    render(<AppShell session={demoSessions.student}><h1>Panel estudiante</h1></AppShell>);
    expect(screen.getAllByRole('link', { name: 'Asignaturas' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Notificaciones/ })).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Abrir navegación' });
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('button', { name: 'Cerrar navegación' })).toHaveLength(2);
    expect(screen.getByText(/Contenido local aislado para validar componentes/i)).toBeTruthy();
  });

  it('keeps the notification surface keyboard-operable in the shell', () => {
    render(<AppShell session={demoSessions.student}><h1>Panel estudiante</h1></AppShell>);
    const trigger = screen.getByRole('button', { name: /Notificaciones/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificaciones' }));
    expect(document.activeElement).toBe(trigger);
  });
});
