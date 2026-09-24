import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DieAction, DieJournalEntry, DieMember } from '@edupay/contracts';
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
const coordinatorId = '00000000-0000-4000-8000-000000000003';
const memberId = '00000000-0000-4000-8000-000000000004';
const actionId = '00000000-0000-4000-8000-000000000005';
const entryId = '00000000-0000-4000-8000-000000000006';

const members: DieMember[] = [
  {
    id: coordinatorId,
    teacherId: null,
    identityMembershipId: 'synthetic-coordinator-membership',
    identityUserId: 'synthetic-coordinator-user',
    displayName: 'Camila Rojas',
    role: 'COORDINATOR',
    addedAt: timestamp,
  },
  {
    id: memberId,
    teacherId: null,
    identityMembershipId: 'synthetic-member-membership',
    identityUserId: 'synthetic-member-user',
    displayName: 'Andrés Molina',
    role: 'MEMBER',
    addedAt: timestamp,
  },
];

const sampleAction: DieAction = {
  id: actionId,
  studentId: id,
  journalEntryId: null,
  title: 'Revisar estrategia de organización',
  description: 'Compartir cómo resultó el apoyo.',
  assigneeMemberAssignmentId: coordinatorId,
  dueDate: '2026-09-30',
  status: 'PENDING',
  result: null,
  cancellationReason: null,
  overdue: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const sampleEntry: DieJournalEntry = {
  id: entryId,
  studentId: id,
  supportEpisodeId: episodeId,
  originalAuthorIdentityUserId: 'synthetic-author-user',
  originalAuthorDisplayLabel: 'Camila Rojas',
  status: 'CURRENT',
  voidReason: null,
  voidedByIdentityUserId: null,
  voidedAt: null,
  createdAt: timestamp,
  current: {
    category: 'OBSERVATION',
    eventDate: '2026-09-20',
    eventTime: null,
    eventTimeApproximate: false,
    eventTimeZone: null,
    place: 'Sala de apoyo',
    title: 'Acuerdo de apoyo en aula',
    description: 'El equipo acordó revisar los apoyos al cierre de la semana.',
    immediateAction: null,
    informationSource: 'WITNESSED',
    thirdPartySource: null,
    academicContext: {
      academicYearId: id,
      academicYearLabel: '2026',
      courseId: id,
      courseLabel: '5° A',
    },
    revisionNumber: 2,
    correctedByIdentityUserId: 'synthetic-author-user',
    correctedByDisplayLabel: 'Camila Rojas',
    correctionReason: 'Se precisó el alcance del acuerdo.',
    createdAt: timestamp,
  },
  revisions: [
    {
      category: 'OBSERVATION',
      eventDate: '2026-09-20',
      eventTime: null,
      eventTimeApproximate: false,
      eventTimeZone: null,
      place: 'Sala de apoyo',
      title: 'Acuerdo de apoyo en aula',
      description: 'El equipo acordó revisar los apoyos al cierre del día.',
      immediateAction: null,
      informationSource: 'WITNESSED',
      thirdPartySource: null,
      academicContext: {
        academicYearId: id,
        academicYearLabel: '2026',
        courseId: id,
        courseLabel: '5° A',
      },
      revisionNumber: 1,
      correctedByIdentityUserId: 'synthetic-author-user',
      correctedByDisplayLabel: 'Camila Rojas',
      correctionReason: null,
      createdAt: '2026-09-20T12:00:00+00:00',
    },
  ],
  attachments: [],
};

function api(overrides: Partial<AcademicApiClient> = {}) {
  return {
    getDieAccess: vi.fn().mockResolvedValue({ allowed: true }),
    getTenantOperationalProfile: vi.fn().mockResolvedValue({
      institutionDisplayName: 'Colegio Sintético',
      timeZone: 'America/Santiago',
      version: 1,
      updatedAt: timestamp,
      complete: true,
      missingFields: [],
    }),
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
  it('requires an explicit student choice before opening the situation form', async () => {
    render(<DieWorkspace api={api()} session={demoSessions.admin} />);
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Registrar situación para/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir hoja de vida de Ana Pérez' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Registrar situación' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Descripción objetiva')).toBeTruthy();
    const optionalDetails = screen
      .getByText(/Más detalles/)
      .closest('details') as HTMLDetailsElement;
    expect(optionalDetails.open).toBe(false);
    fireEvent.click(screen.getByText(/Más detalles/));
    expect(screen.getByLabelText('Lugar (opcional)')).toBeTruthy();
    fireEvent.click(screen.getByText(/Más detalles/));
    expect(optionalDetails.open).toBe(false);
    expect(screen.getByText('Hecho presenciado')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('radio', { name: 'Informado por terceros' }),
    );
    const thirdParty = screen.getByLabelText('Fuente del antecedente');
    expect((thirdParty as HTMLInputElement).required).toBe(true);
    expect(optionalDetails.open).toBe(false);
  });

  it('shows the current entry and makes prior versions and correction reasons readable', async () => {
    const journalApi = api({
      listDieJournal: vi.fn().mockResolvedValue([sampleEntry]),
    });
    render(<DieWorkspace api={journalApi} session={demoSessions.admin} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Abrir hoja de vida de Ana Pérez',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Acuerdo de apoyo en aula',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Camila Rojas', { selector: 'dd' })).toBeTruthy();
    expect(screen.getByText('Sala de apoyo')).toBeTruthy();
    expect(screen.queryByText('synthetic-author-user')).toBeNull();

    fireEvent.click(screen.getByText('Leer historial de cambios'));
    expect(
      await screen.findByText(
        'El equipo acordó revisar los apoyos al cierre del día.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Se precisó el alcance del acuerdo.')).toBeTruthy();
  });

  it('creates a record quickly and retains the selected student after refresh', async () => {
    const createDieJournalEntry = vi.fn().mockResolvedValue(sampleEntry);
    const journalApi = api({
      createDieJournalEntry,
      listDieJournal: vi.fn().mockResolvedValue([]),
    });
    render(<DieWorkspace api={journalApi} session={demoSessions.admin} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Abrir hoja de vida de Ana Pérez',
      }),
    );
    fireEvent.change(await screen.findByLabelText('Título'), {
      target: { value: 'Acuerdo de estudio' },
    });
    fireEvent.change(screen.getByLabelText('Descripción objetiva'), {
      target: { value: 'Se acordó revisar la organización al final del día.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar situación' }),
    );

    await waitFor(() =>
      expect(createDieJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: id,
          supportEpisodeId: episodeId,
          title: 'Acuerdo de estudio',
          description: 'Se acordó revisar la organización al final del día.',
          informationSource: 'WITNESSED',
          thirdPartySource: null,
        }),
      ),
    );
    expect(screen.getByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('requires a reason before a team action can be reassigned', async () => {
    const reassignDieAction = vi.fn().mockResolvedValue(undefined);
    const actionApi = api({
      listDieMembers: vi.fn().mockResolvedValue(members),
      listDieActions: vi.fn().mockResolvedValue([sampleAction]),
      reassignDieAction,
    });
    render(<DieWorkspace api={actionApi} session={demoSessions.admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pendientes' }));
    fireEvent.change(
      await screen.findByRole('combobox', {
        name: `Reasignar ${sampleAction.title}`,
      }),
      { target: { value: memberId } },
    );

    const confirm = screen.getByRole('button', {
      name: 'Confirmar reasignación',
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), {
      target: { value: 'Ajuste de carga acordado por el equipo.' },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(reassignDieAction).toHaveBeenCalledWith(actionId, {
        assigneeMemberAssignmentId: memberId,
        reason: 'Ajuste de carga acordado por el equipo.',
      }),
    );
  });

  it('shows team responsibilities without exposing coordinator controls to a standard member', async () => {
    const teamApi = api({
      listDieMembers: vi.fn().mockResolvedValue(members),
    });
    render(<DieWorkspace api={teamApi} session={demoSessions.teacher} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Equipo' }));

    expect(await screen.findByText('Andrés Molina')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Hacer coordinador/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(screen.getByText('Incorporar miembro')).toBeTruthy();
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

  it('shows an explicit tenant-admin action when the operational profile is incomplete', async () => {
    const incompleteApi = api({
      getTenantOperationalProfile: vi.fn().mockResolvedValue({
        institutionDisplayName: null,
        timeZone: null,
        version: 0,
        updatedAt: null,
        complete: false,
        missingFields: ['institutionDisplayName', 'timeZone'],
      }),
    });
    render(<DieWorkspace api={incompleteApi} session={demoSessions.admin} />);
    const configure = await screen.findByRole('button', {
      name: 'Configurar perfil',
    });
    fireEvent.click(configure);
    expect(
      await screen.findByRole('heading', {
        name: 'Perfil institucional operativo',
      }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Nombre institucional para documentos'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Zona horaria IANA')).toBeTruthy();
  });

  it('hides the previous tenant data immediately when membership context changes', async () => {
    const firstApi = api();
    const nextApi = api({
      listDieStudents: vi.fn().mockResolvedValue([
        {
          studentId: '00000000-0000-4000-8000-000000000099',
          displayName: 'Tomás Nuevo Tenant',
          activeEpisode: null,
          latestEpisode: {
            id: episodeId,
            studentId: '00000000-0000-4000-8000-000000000099',
            startDate: '2026-09-02',
            reason: 'Acompañamiento anterior.',
            responsibleMemberAssignmentId: null,
            status: 'FINISHED',
            endDate: '2026-09-20',
            endReason: 'Cierre.',
            academicContext: {
              academicYearId: null,
              academicYearLabel: null,
              courseId: null,
              courseLabel: null,
            },
            createdAt: timestamp,
          },
        },
      ]),
    });
    const nextSession = {
      ...demoSessions.admin,
      membershipId: 'membership-other-tenant',
      tenantId: 'other-tenant',
      tenantDisplayName: 'Otro colegio',
    };
    const view = render(
      <DieWorkspace api={firstApi} session={demoSessions.admin} />,
    );
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();

    view.rerender(<DieWorkspace api={nextApi} session={nextSession} />);
    expect(screen.queryByText('Ana Pérez')).toBeNull();
    expect(await screen.findByText('Tomás Nuevo Tenant')).toBeTruthy();
    expect(nextApi.getDieAccess).toHaveBeenCalled();
  });
});
