import { fireEvent, render, screen } from '@testing-library/react';
import { Button, Input, Tabs, TenantTheme } from '@edupay/ui';
import { describe, expect, it } from 'vitest';

describe('shared UI foundation', () => {
  it('applies a tenant theme without tenant-specific component coupling', () => {
    const { container } = render(<TenantTheme theme="colegio-conquistadores"><Button>Continuar</Button></TenantTheme>);
    expect(container.firstElementChild?.getAttribute('data-tenant-theme')).toBe('colegio-conquistadores');
    expect(screen.getByRole('button', { name: 'Continuar' }).className).not.toContain('conquistadores');
  });

  it('associates visible field labels, hints, and invalid state', () => {
    render(<Input error="Escribe un título para continuar." id="title" label="Título" />);
    const input = screen.getByLabelText('Título');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('title-error');
    expect(screen.getByRole('alert').textContent).toContain('Escribe un título');
  });

  it('changes tabs with an accessible selected state', () => {
    render(<Tabs label="Contenido" items={[{ id: 'route', label: 'Ruta', content: 'Ruta activa' }, { id: 'work', label: 'Entregas', content: 'Entregas activas' }]} />);
    const deliveries = screen.getByRole('tab', { name: 'Entregas' });
    fireEvent.click(deliveries);
    expect(deliveries.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Entregas activas')).toBeTruthy();
  });

  it('supports arrow-key navigation across the tab set', () => {
    render(<Tabs label="Contenido" items={[{ id: 'route-keyboard', label: 'Ruta', content: 'Ruta activa' }, { id: 'work-keyboard', label: 'Entregas', content: 'Entregas activas' }]} />);
    const route = document.getElementById('route-keyboard-tab');
    const deliveries = document.getElementById('work-keyboard-tab');
    expect(route).toBeTruthy();
    expect(deliveries).toBeTruthy();
    if (!route || !deliveries) return;
    route.focus();
    fireEvent.keyDown(route, { key: 'ArrowRight' });
    expect(deliveries.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(deliveries);
  });
});
