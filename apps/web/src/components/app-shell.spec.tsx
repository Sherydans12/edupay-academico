import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/app-shell';
import { demoSessions } from '@/demo/demo-data';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante' }));

describe('AppShell', () => {
  it('exposes role-configured navigation and a controllable compact menu', () => {
    render(<AppShell session={demoSessions.student}><h1>Panel estudiante</h1></AppShell>);
    expect(screen.getAllByRole('link', { name: 'Asignaturas' }).length).toBeGreaterThan(0);
    const open = screen.getByRole('button', { name: 'Abrir navegación' });
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('button', { name: 'Cerrar navegación' })).toHaveLength(2);
    expect(screen.getByText(/contenido local para validar/i)).toBeTruthy();
  });
});
