import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { demoSessions } from '@/demo/demo-data';
import { DieWorkspace } from './die-screens';

vi.mock('next/navigation', () => ({
  usePathname: () => '/die',
  useRouter: () => ({ push: () => undefined }),
}));

afterEach(cleanup);

const id = '00000000-0000-4000-8000-000000000001';
const episodeId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-22T12:00:00+00:00';

function api(overrides: Partial<AcademicApiClient> = {}) {
  return {
    getDieAccess: vi.fn().mockResolvedValue({ allowed: true }),
    listDieMembers: vi.fn().mockResolvedValue([]),
    listDieStudents: vi.fn().mockResolvedValue([
      {
        studentId: id,
        displayName: 'Ana Pérez',
        activeEpisode: {
          id: episodeId,
          studentId: id,
          startDate: '2026-09-01',
          reason: 'Apoyo de acceso curricular.',
          responsibleMemberAssignmentId: null,
          status: 'ACTIVE',
          endDate: null,
          endReason: null,
          academicContext: {
            academicYearId: id,
            academicYearLabel: '2026',
            courseId: id,
            courseLabel: '5° A',
          },
          createdAt: timestamp,
        },
        latestEpisode: {
          id: episodeId,
          studentId: id,
          startDate: '2026-09-01',
          reason: 'Apoyo de acceso curricular.',
          responsibleMemberAssignmentId: null,
          status: 'ACTIVE',
          endDate: null,
          endReason: null,
          academicContext: {
            academicYearId: id,
            academicYearLabel: '2026',
            courseId: id,
            courseLabel: '5° A',
          },
          createdAt: timestamp,
        },
      },
    ]),
    listDieActions: vi.fn().mockResolvedValue([]),
    listDieJournal: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AcademicApiClient;
}

describe('DIE workspace', () => {
  it('shows the accompanied roster and prioritizes fast situation entry', async () => {
    render(<DieWorkspace api={api()} session={demoSessions.admin} />);
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar situación' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Registrar situación' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Descripción objetiva')).toBeTruthy();
    expect(screen.getByText('Hecho presenciado')).toBeTruthy();
    expect(screen.getByText('Informado por terceros')).toBeTruthy();
  });

  it('does not render DIE data after an API authorization denial', async () => {
    const denied = new AcademicApiError({
      code: 'FORBIDDEN',
      details: [],
      message: 'denied',
      requestId: 'request-1',
      status: 403,
    });
    const deniedApi = api({ getDieAccess: vi.fn().mockRejectedValue(denied) });
    render(<DieWorkspace api={deniedApi} session={demoSessions.teacher} />);
    await waitFor(() =>
      expect(
        screen.getByText('Tu cuenta no tiene acceso vigente al módulo DIE.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });
});
