import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import type { AccountProvisioningActions } from './account-provisioning';
import { AccountProvisioning } from './account-provisioning';

const timestamp = '2026-08-09T12:00:00Z';
const student = { id: 'student-1', identityUserId: null, source: 'MANUAL', externalReference: null, firstName: 'Sofía', lastName: 'Herrera', email: 'sofia@example.test', status: 'ACTIVE', createdAt: timestamp, updatedAt: timestamp };
const teacher = { ...student, id: 'teacher-1', firstName: 'Camila', lastName: 'Rojas', email: null };

function provisioned(role: 'STUDENT' | 'TEACHER', email: boolean) {
  return { userId: `user-${role.toLowerCase()}`, membershipId: `membership-${role.toLowerCase()}`, tenantId: 'tenant-1', institutionalUsername: role === 'STUDENT' ? 'sofia.herrera' : 'camila.rojas', ...(email ? { email: 'sofia@example.test' } : {}), status: 'PENDING_ACTIVATION' as const, roles: [role], activation: { emailInvitationAvailable: email, activationChallengeAvailable: !email } };
}

function identityActions(overrides: Partial<AccountProvisioningActions> = {}): AccountProvisioningActions {
  return {
    provisionMembership: vi.fn(async (input) => provisioned(input.role, Boolean(input.email))),
    inviteMembership: vi.fn(async (membershipId) => ({ membershipId, invitationId: 'invitation-1', status: 'PENDING_DELIVERY', expiresAt: '2026-08-10T12:00:00Z' })),
    createActivationChallenge: vi.fn(async (membershipId) => ({ membershipId, username: 'camila.rojas', activationCode: 'shown-once-secret', expiresAt: '2026-08-10T12:00:00Z' })),
    ...overrides,
  };
}

function academicApi(overrides: Partial<AcademicApiClient> = {}): AcademicApiClient {
  return {
    linkStudentIdentity: vi.fn(async (_id, input) => ({ ...student, identityUserId: input.identityUserId })),
    linkTeacherIdentity: vi.fn(async (_id, input) => ({ ...teacher, identityUserId: input.identityUserId })),
    ...overrides,
  } as unknown as AcademicApiClient;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AccountProvisioning', () => {
  it('creates only a STUDENT membership, links the returned user, and asks Identity to send the invitation', async () => {
    const identity = identityActions();
    const api = academicApi();
    render(<AccountProvisioning api={api} identityActions={identity} kind="student" onLinked={vi.fn()} person={student} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    expect(screen.getByText('STUDENT')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /admin/i })).toBeNull();
    expect(screen.getByLabelText('Correo para invitación (opcional)')).toHaveProperty('value', 'sofia@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    await screen.findByText('Identity registró la entrega del correo. No se expuso ningún token de invitación.');
    expect(identity.provisionMembership).toHaveBeenCalledWith({ institutionalUsername: 'sofia.herrera', email: 'sofia@example.test', role: 'STUDENT' });
    expect(api.linkStudentIdentity).toHaveBeenCalledWith('student-1', { identityUserId: 'user-student' });
    expect(identity.inviteMembership).toHaveBeenCalledWith('membership-student');
  });

  it('creates only a TEACHER membership, links it, and displays the no-email code only in current UI state', async () => {
    const identity = identityActions();
    const api = academicApi();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const consoleWrite = vi.spyOn(console, 'log');
    render(<AccountProvisioning api={api} identityActions={identity} kind="teacher" onLinked={vi.fn()} person={teacher} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    expect(screen.getByText('TEACHER')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    expect(await screen.findByText('shown-once-secret')).toBeTruthy();
    expect(identity.provisionMembership).toHaveBeenCalledWith({ institutionalUsername: 'camila.rojas', role: 'TEACHER' });
    expect(api.linkTeacherIdentity).toHaveBeenCalledWith('teacher-1', { identityUserId: 'user-teacher' });
    expect(identity.createActivationChallenge).toHaveBeenCalledWith('membership-teacher');
    expect(storageWrite).not.toHaveBeenCalled();
    expect(consoleWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ya lo entregué de forma segura' }));
    await waitFor(() => expect(screen.queryByText('shown-once-secret')).toBeNull());
  });

  it('reports Identity success when the Academic link fails and retries the link without creating another membership', async () => {
    const identity = identityActions();
    const linkTeacherIdentity = vi.fn()
      .mockRejectedValueOnce(new AcademicApiError({ code: 'IDENTITY_LINK_FAILED', details: [], message: 'link failed', requestId: 'req-link', status: 409 }))
      .mockResolvedValueOnce({ ...teacher, identityUserId: 'user-teacher' });
    const api = academicApi({ linkTeacherIdentity });
    render(<AccountProvisioning api={api} identityActions={identity} kind="teacher" onLinked={vi.fn()} person={teacher} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    expect(await screen.findByText('Identity creó la cuenta, pero falta el vínculo académico')).toBeTruthy();
    expect(screen.getByText('user-teacher')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar vínculo académico' }));
    expect(await screen.findByText('shown-once-secret')).toBeTruthy();
    expect(identity.provisionMembership).toHaveBeenCalledOnce();
    expect(linkTeacherIdentity).toHaveBeenCalledTimes(2);
  });
});
