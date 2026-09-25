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
import type { TrustedCurrentSession } from '@/auth/current-session';
import { IdentitySessionContext } from '@/auth/session-context';
import type { IdentitySessionContextValue } from '@/auth/session-provider';
import { AcademicAdminSettingsScreen } from './academic-admin-settings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/administracion/configuracion',
  useRouter: () => ({ push: () => undefined }),
}));

afterEach(cleanup);

const profile = {
  institutionDisplayName: 'Institución Sintética',
  timeZone: 'America/Santiago',
  version: 3,
  updatedAt: '2026-09-20T12:00:00+00:00',
  complete: true,
  missingFields: [],
};

function api(overrides: Partial<AcademicApiClient> = {}) {
  return {
    getTenantOperationalProfile: vi.fn(async () => profile),
    updateTenantOperationalProfile: vi.fn(async () => ({
      ...profile,
      version: 4,
      institutionDisplayName: 'Institución de ejemplo',
    })),
    ...overrides,
  } as unknown as AcademicApiClient;
}

function sessionForTenant(
  tenantId: string,
  roles: TrustedCurrentSession['roles'] = ['TENANT_ADMIN'],
): TrustedCurrentSession {
  return {
    displayName: 'Administración',
    identityUserId: `user-${tenantId}`,
    membershipId: `membership-${tenantId}`,
    roles,
    roleLabel: roles.includes('TENANT_ADMIN') ? 'Administración' : 'Equipo',
    tenantDisplayName: `Institución ${tenantId}`,
    tenantId,
    workspace: roles.includes('TENANT_ADMIN') ? 'tenant-admin' : 'staff',
  };
}

function sessionContext(session: TrustedCurrentSession) {
  return {
    status: 'authenticated',
    session,
    memberships: [],
    login: async () => session,
    logout: async () => undefined,
    refresh: async () => null,
    retryBootstrap: async () => undefined,
    switchMembership: async () => session,
    provisionMembership: vi.fn(),
    inviteMembership: vi.fn(),
    createActivationChallenge: vi.fn(),
  } as unknown as IdentitySessionContextValue;
}

function renderWithSession(
  apiClient: AcademicApiClient,
  session: TrustedCurrentSession,
) {
  return render(
    <IdentitySessionContext.Provider value={sessionContext(session)}>
      <AcademicAdminSettingsScreen api={apiClient} />
    </IdentitySessionContext.Provider>,
  );
}

describe('Academic institutional settings', () => {
  it('loads the profile and saves only changed values with the current version', async () => {
    const client = api();
    renderWithSession(client, sessionForTenant('synthetic'));

    const name = (await screen.findByLabelText(
      'Nombre institucional para documentos (opcional)',
    )) as HTMLInputElement;
    const timeZone = screen.getByLabelText(
      'Zona horaria IANA (opcional)',
    ) as HTMLInputElement;
    expect(name.value).toBe('Institución Sintética');
    expect(timeZone.value).toBe('America/Santiago');
    expect(
      (
        screen.getByRole('button', {
          name: 'Guardar perfil',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(name, { target: { value: 'Institución de ejemplo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    await screen.findByText('Perfil institucional guardado');
    expect(client.updateTenantOperationalProfile).toHaveBeenCalledWith({
      expectedVersion: 3,
      institutionDisplayName: 'Institución de ejemplo',
      timeZone: 'America/Santiago',
    });
  });

  it('preserves edits and explains the version conflict when a save is rejected', async () => {
    const client = api({
      updateTenantOperationalProfile: vi.fn(async () => {
        throw new AcademicApiError({
          code: 'VERSION_CONFLICT',
          details: [],
          message: 'La versión vigente cambió.',
          requestId: 'req-profile-conflict',
          status: 409,
        });
      }),
    });
    renderWithSession(client, sessionForTenant('synthetic'));

    const name = (await screen.findByLabelText(
      'Nombre institucional para documentos (opcional)',
    )) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Cambio pendiente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(
      await screen.findByText(/El perfil cambió en otra sesión/),
    ).toBeTruthy();
    expect(name.value).toBe('Cambio pendiente');
  });

  it('keeps the profile readable but does not offer editing to non-admin roles', async () => {
    const client = api();
    renderWithSession(client, sessionForTenant('synthetic', ['STAFF']));

    const name = (await screen.findByLabelText(
      'Nombre institucional para documentos (opcional)',
    )) as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    expect(screen.getByText('Perfil en solo lectura')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar perfil' })).toBeNull();
    expect(client.getTenantOperationalProfile).toHaveBeenCalledTimes(1);
    expect(client.updateTenantOperationalProfile).not.toHaveBeenCalled();
  });

  it('ignores a profile response from the previous tenant membership', async () => {
    let resolveTenantA!: (value: typeof profile) => void;
    const tenantAProfile = new Promise<typeof profile>((resolve) => {
      resolveTenantA = resolve;
    });
    const tenantBProfile = {
      ...profile,
      institutionDisplayName: 'Institución B sintética',
      version: 9,
    };
    const getProfile = vi
      .fn<() => Promise<typeof profile>>()
      .mockReturnValueOnce(tenantAProfile)
      .mockResolvedValueOnce(tenantBProfile);
    const client = api({ getTenantOperationalProfile: getProfile });
    const sessionA = sessionForTenant('tenant-a');
    const sessionB = sessionForTenant('tenant-b');
    const view = renderWithSession(client, sessionA);

    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    view.rerender(
      <IdentitySessionContext.Provider value={sessionContext(sessionB)}>
        <AcademicAdminSettingsScreen api={client} />
      </IdentitySessionContext.Provider>,
    );
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));

    const name = (await screen.findByLabelText(
      'Nombre institucional para documentos (opcional)',
    )) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Institución B sintética'));
    resolveTenantA({ ...profile, institutionDisplayName: 'Tenant A obsoleto' });
    await waitFor(() => expect(name.value).toBe('Institución B sintética'));
  });
});
