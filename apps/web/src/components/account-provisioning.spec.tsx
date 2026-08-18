import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import type { AccountProvisioningActions } from './account-provisioning';
import { AccountProvisioning } from './account-provisioning';

const timestamp = '2026-08-09T12:00:00Z';
const edupayStudentNoEmail = {
  id: 'student-edupay-1',
  identityUserId: null,
  source: 'EDUPAY',
  externalReference: 'STU-EDU-99',
  firstName: 'Claudio',
  lastName: 'Arrau',
  email: null,
  status: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const studentWithEmail = {
  id: 'student-1',
  identityUserId: null,
  source: 'MANUAL',
  externalReference: null,
  firstName: 'Sofía',
  lastName: 'Herrera',
  email: 'sofia@example.test',
  status: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const teacher = {
  id: 'teacher-1',
  identityUserId: null,
  source: 'MANUAL',
  externalReference: null,
  firstName: 'Camila',
  lastName: 'Rojas',
  email: null,
  status: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

function provisioned(role: 'STUDENT' | 'TEACHER', email?: string) {
  return {
    userId: `user-${role.toLowerCase()}`,
    membershipId: `membership-${role.toLowerCase()}`,
    tenantId: 'tenant-1',
    institutionalUsername: role === 'STUDENT' ? 'claudio.arrau' : 'camila.rojas',
    ...(email ? { email } : {}),
    status: 'PENDING_ACTIVATION' as const,
    roles: [role],
    activation: { emailInvitationAvailable: Boolean(email), activationChallengeAvailable: !email },
  };
}

function identityActions(overrides: Partial<AccountProvisioningActions> = {}): AccountProvisioningActions {
  return {
    provisionMembership: vi.fn(async (input) => provisioned(input.role, input.email)),
    inviteMembership: vi.fn(async (membershipId) => ({ membershipId, invitationId: 'invitation-1', status: 'PENDING_DELIVERY', expiresAt: '2026-08-10T12:00:00Z' })),
    createActivationChallenge: vi.fn(async (membershipId) => ({ membershipId, username: 'camila.rojas', activationCode: 'shown-once-secret', expiresAt: '2026-08-10T12:00:00Z' })),
    ...overrides,
  };
}

function academicApi(overrides: Partial<AcademicApiClient> = {}): AcademicApiClient {
  return {
    updateStudent: vi.fn(async (id, input) => ({ ...edupayStudentNoEmail, id, email: input.email ?? null })),
    updateTeacher: vi.fn(async (id, input) => ({ ...teacher, id, email: input.email ?? null })),
    linkStudentIdentity: vi.fn(async (_id, input) => ({ ...edupayStudentNoEmail, identityUserId: input.identityUserId })),
    linkTeacherIdentity: vi.fn(async (_id, input) => ({ ...teacher, identityUserId: input.identityUserId })),
    ...overrides,
  } as unknown as AcademicApiClient;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AccountProvisioning', () => {
  it('handles an EduPay student without email by requiring email in normal invitation flow and synchronizing it to Academic and Identity', async () => {
    const identity = identityActions();
    const api = academicApi();
    render(<AccountProvisioning api={api} identityActions={identity} kind="student" onLinked={vi.fn()} person={edupayStudentNoEmail} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    expect(screen.getByText('STUDENT')).toBeTruthy();

    // Verify admin never sees or sets password fields
    expect(screen.queryByLabelText(/contraseña/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/contraseña/i)).toBeNull();

    const usernameInput = screen.getByLabelText('Usuario institucional') as HTMLInputElement;
    expect(usernameInput.value).toBe('claudio.arrau');

    const emailInput = screen.getByLabelText('Correo para invitación') as HTMLInputElement;
    expect(emailInput.value).toBe('');
    expect(emailInput.required).toBe(true);

    // Enter email
    fireEvent.change(emailInput, { target: { value: ' Claudio.Arrau@Piano.CL ' } });

    // Submit normal invitation
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso e invitar' }));

    await screen.findByText('Identity registró la entrega del correo. No se expuso ningún token de invitación.');

    // Verify exact normalized email was supplied to Identity
    expect(identity.provisionMembership).toHaveBeenCalledWith({
      institutionalUsername: 'claudio.arrau',
      email: 'claudio.arrau@piano.cl',
      role: 'STUDENT',
    });

    // Verify contact email was persisted to Academic Student record
    expect(api.updateStudent).toHaveBeenCalledWith('student-edupay-1', {
      email: 'claudio.arrau@piano.cl',
    });

    // Verify existing student was linked without duplicating record
    expect(api.linkStudentIdentity).toHaveBeenCalledWith('student-edupay-1', {
      identityUserId: 'user-student',
    });

    // Verify Identity invitation was triggered
    expect(identity.inviteMembership).toHaveBeenCalledWith('membership-student');
  });

  it('creates only a STUDENT membership when email was already present, links the user and requests invitation', async () => {
    const identity = identityActions();
    const api = academicApi();
    render(<AccountProvisioning api={api} identityActions={identity} kind="student" onLinked={vi.fn()} person={studentWithEmail} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    expect(screen.getByText('STUDENT')).toBeTruthy();
    expect(screen.getByLabelText('Correo para invitación')).toHaveProperty('value', 'sofia@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso e invitar' }));

    await screen.findByText('Identity registró la entrega del correo. No se expuso ningún token de invitación.');
    expect(identity.provisionMembership).toHaveBeenCalledWith({ institutionalUsername: 'sofia.herrera', email: 'sofia@example.test', role: 'STUDENT' });
    expect(api.linkStudentIdentity).toHaveBeenCalledWith('student-1', { identityUserId: 'user-student' });
    expect(identity.inviteMembership).toHaveBeenCalledWith('membership-student');
  });

  it('supports explicit no-email activation-code fallback without sending an invitation email', async () => {
    const identity = identityActions();
    const api = academicApi();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const consoleWrite = vi.spyOn(console, 'log');

    render(<AccountProvisioning api={api} identityActions={identity} kind="teacher" onLinked={vi.fn()} person={teacher} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    expect(screen.getByText('TEACHER')).toBeTruthy();

    const noEmailCheckbox = screen.getByRole('checkbox', { name: /activar sin correo/i });
    fireEvent.click(noEmailCheckbox);

    expect(screen.getByText(/modo excepcional sin correo/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear acceso con código' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso con código' }));

    expect(await screen.findByText('shown-once-secret')).toBeTruthy();
    expect(identity.provisionMembership).toHaveBeenCalledWith({ institutionalUsername: 'camila.rojas', role: 'TEACHER' });
    expect(api.linkTeacherIdentity).toHaveBeenCalledWith('teacher-1', { identityUserId: 'user-teacher' });
    expect(identity.createActivationChallenge).toHaveBeenCalledWith('membership-teacher');
    expect(identity.inviteMembership).not.toHaveBeenCalled();

    // Ensure secret code is never stored in persistent browser storage or console logged
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

    // Toggle no-email mode
    fireEvent.click(screen.getByRole('checkbox', { name: /activar sin correo/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso con código' }));

    expect(await screen.findByText('Identity creó la cuenta, pero falta el vínculo académico')).toBeTruthy();
    expect(screen.getByText('user-teacher')).toBeTruthy();

    // Retry link without creating another Identity account
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar vínculo académico' }));
    expect(await screen.findByText('shown-once-secret')).toBeTruthy();
    expect(identity.provisionMembership).toHaveBeenCalledOnce();
    expect(linkTeacherIdentity).toHaveBeenCalledTimes(2);
  });

  it('handles ambiguous network failure on Identity provisioning by safely receiving the recovered membership on retry and continuing Academic linkage', async () => {
    const recovered = provisioned('STUDENT', 'claudio.arrau@piano.cl');
    const provisionMembership = vi.fn()
      .mockRejectedValueOnce(new Error('Network connection interrupted'))
      .mockResolvedValueOnce(recovered);

    const identity = identityActions({ provisionMembership });
    const api = academicApi();
    render(<AccountProvisioning api={api} identityActions={identity} kind="student" onLinked={vi.fn()} person={edupayStudentNoEmail} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso' }));
    const emailInput = screen.getByLabelText('Correo para invitación');
    fireEvent.change(emailInput, { target: { value: 'claudio.arrau@piano.cl' } });

    // Initial attempt fails due to network drop
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso e invitar' }));
    expect(await screen.findByText(/no pudimos conectar con edupay identity/i)).toBeTruthy();

    // Client retries: Identity returns the recovered membership and flow seamlessly completes
    fireEvent.click(screen.getByRole('button', { name: 'Crear acceso e invitar' }));
    await screen.findByText('Identity registró la entrega del correo. No se expuso ningún token de invitación.');

    expect(provisionMembership).toHaveBeenCalledTimes(2);
    expect(api.linkStudentIdentity).toHaveBeenCalledWith('student-edupay-1', {
      identityUserId: 'user-student',
    });
    expect(identity.inviteMembership).toHaveBeenCalledWith('membership-student');
  });
});
