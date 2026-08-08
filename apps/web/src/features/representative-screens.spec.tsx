import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StudentDashboardScreen } from '@/features/student-screens';
import { TeacherDashboardScreen } from '@/features/teacher-screens';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante' }));

describe('representative workspaces', () => {
  it('renders the student next-action and assigned-subject experience', () => {
    render(<StudentDashboardScreen />);
    expect(screen.getByRole('heading', { name: 'Hola, Sofía' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /tu próximo paso/i })).toBeTruthy();
    expect(screen.getAllByText('Lenguaje y Comunicación').length).toBeGreaterThan(0);
    expect(screen.getByText('Vista de demostración')).toBeTruthy();
  });

  it('renders the teacher authoring and review priorities', () => {
    render(<TeacherDashboardScreen />);
    expect(screen.getByRole('heading', { name: 'Buenos días, Camila' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Revisiones pendientes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /crear contenido/i })).toBeTruthy();
    expect(screen.getByText('Emilia Vargas')).toBeTruthy();
  });
});
