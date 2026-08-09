import { describe, expect, it, vi } from 'vitest';

import { IdentityApiError, IdentityBrowserClient } from './identity-client';

const membership = { membershipId: 'membership-1', tenantId: 'tenant-1', tenantHandle: 'colegio-conquistadores', status: 'ACTIVE' as const, roles: ['STUDENT'] };
const token = { accessToken: 'access-token', tokenType: 'Bearer' as const, expiresIn: 600, sessionId: 'session-1', activeMembership: membership };

function json(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('IdentityBrowserClient', () => {
  it('uses the browser cookie transport for login, refresh, logout, and logout-all without exposing a refresh token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json(undefined, 204))
      .mockResolvedValueOnce(json({ revokedSessions: 3 }));
    const client = new IdentityBrowserClient({ baseUrl: 'https://identity.example.test', fetchImpl });

    await expect(client.login({ identifier: 'sofia', password: 'secret', device: { label: 'Chrome en Windows' } })).resolves.toEqual(token);
    await expect(client.refresh()).resolves.toEqual(token);
    await expect(client.logout('access-token')).resolves.toBeUndefined();
    await expect(client.logoutAll('access-token')).resolves.toEqual({ revokedSessions: 3 });

    for (const index of [0, 1, 2, 3]) {
      expect(fetchImpl.mock.calls[index]?.[1]).toMatchObject({ credentials: 'include' });
    }
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('refreshToken');
  });

  it('matches current profile, membership, and replacement-token context contracts', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ userId: 'user-1', status: 'ACTIVE', platformRoles: [], session: { id: 'session-1', authenticatedAt: '2026-08-09T12:00:00Z', activeMembership: membership } }))
      .mockResolvedValueOnce(json([membership]))
      .mockResolvedValueOnce(json({ ...token, activeMembership: { ...membership, membershipId: 'membership-2', roles: ['TEACHER'] } }));
    const client = new IdentityBrowserClient({ baseUrl: 'https://identity.example.test', fetchImpl });

    await client.me('access-token');
    await client.memberships('access-token');
    await client.switchContext('access-token', 'membership-2');

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://identity.example.test/api/v1/auth/me', expect.objectContaining({ method: 'GET' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://identity.example.test/api/v1/auth/memberships', expect.objectContaining({ method: 'GET' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'https://identity.example.test/api/v1/auth/sessions/current-context', expect.objectContaining({ body: JSON.stringify({ membershipId: 'membership-2' }) }));
  });

  it('sends exact invitation, activation, and recovery request fields', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ membershipId: 'membership-1', status: 'ACTIVE' }))
      .mockResolvedValueOnce(json({ membershipId: 'membership-1', status: 'ACTIVE' }))
      .mockResolvedValueOnce(json({ accepted: true }, 202))
      .mockResolvedValueOnce(json({ status: 'PASSWORD_RESET', revokedSessions: 2 }));
    const client = new IdentityBrowserClient({ baseUrl: 'https://identity.example.test', fetchImpl });

    await client.acceptInvitation('inv-secret', 'chosen-password');
    await client.completeActivation('sofia.herrera', 'act-secret', 'chosen-password');
    await client.requestPasswordRecovery('sofia.herrera', 'colegio-conquistadores');
    await client.confirmPasswordRecovery('reset-secret', 'chosen-password');

    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ invitationToken: 'inv-secret', password: 'chosen-password' }));
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ institutionalUsername: 'sofia.herrera', activationCode: 'act-secret', password: 'chosen-password' }));
    expect(fetchImpl.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ identifier: 'sofia.herrera', tenantHandle: 'colegio-conquistadores' }));
    expect(fetchImpl.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ resetToken: 'reset-secret', password: 'chosen-password' }));
  });

  it('fixes the provisioned role and supports both activation delivery methods without cookie credentials', async () => {
    const provisioned = { userId: 'user-1', membershipId: 'membership-1', tenantId: 'tenant-1', institutionalUsername: 'sofia.herrera', status: 'PENDING_ACTIVATION', roles: ['STUDENT'], activation: { emailInvitationAvailable: true, activationChallengeAvailable: false } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(provisioned, 201))
      .mockResolvedValueOnce(json({ membershipId: 'membership-1', invitationId: 'invitation-1', status: 'PENDING_DELIVERY', expiresAt: '2026-08-10T12:00:00Z' }))
      .mockResolvedValueOnce(json({ membershipId: 'membership-1', username: 'sofia.herrera', activationCode: 'shown-once', expiresAt: '2026-08-10T12:00:00Z' }));
    const client = new IdentityBrowserClient({ baseUrl: 'https://identity.example.test', fetchImpl });

    await client.provisionMembership('access-token', 'tenant-1', { institutionalUsername: 'sofia.herrera', roles: ['STUDENT'] });
    await client.inviteMembership('access-token', 'tenant-1', 'membership-1');
    await client.createActivationChallenge('access-token', 'tenant-1', 'membership-1');

    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ institutionalUsername: 'sofia.herrera', roles: ['STUDENT'] }));
    expect(fetchImpl.mock.calls.every((call) => call[1]?.credentials !== 'include')).toBe(true);
  });

  it('preserves stable safe error metadata without leaking an unknown response body', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: 'ACTIVATION_EXPIRED', message: 'The credential expired.', details: [], requestId: 'req-410' } }, 410));
    const client = new IdentityBrowserClient({ baseUrl: 'https://identity.example.test', fetchImpl });
    await expect(client.acceptInvitation('expired', 'chosen-password')).rejects.toMatchObject({
      code: 'ACTIVATION_EXPIRED', requestId: 'req-410', status: 410,
    } satisfies Partial<IdentityApiError>);
  });
});
