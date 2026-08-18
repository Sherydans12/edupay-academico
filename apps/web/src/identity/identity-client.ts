import { z } from 'zod';

import type { IdentityRole } from '@/auth/current-session';

type FetchLike = typeof fetch;

const identityRoleSchema = z.enum(['SYSTEM_ADMIN', 'TENANT_ADMIN', 'TEACHER', 'STUDENT']);

export const identityMembershipSchema = z.object({
  membershipId: z.string().min(1),
  tenantId: z.string().min(1),
  tenantHandle: z.string().min(1),
  status: z.literal('ACTIVE'),
  roles: z.array(z.string()),
}).strict();

export type IdentityMembership = z.infer<typeof identityMembershipSchema>;

export const identityTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  sessionId: z.string().min(1),
  activeMembership: identityMembershipSchema.nullable(),
}).strict();

export type IdentityTokenResponse = z.infer<typeof identityTokenResponseSchema>;

const identityMeSchema = z.object({
  userId: z.string().min(1),
  status: z.literal('ACTIVE'),
  platformRoles: z.array(z.string()),
  session: z.object({
    id: z.string().min(1),
    authenticatedAt: z.string().min(1),
    activeMembership: identityMembershipSchema.nullable(),
  }).strict(),
}).strict();

export type IdentityMe = z.infer<typeof identityMeSchema>;

const lifecycleResultSchema = z.object({
  membershipId: z.string().min(1),
  status: z.string().min(1),
}).passthrough();

export const provisionedMembershipSchema = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
  tenantId: z.string().min(1),
  institutionalUsername: z.string().min(1),
  email: z.email().optional(),
  status: z.literal('PENDING_ACTIVATION'),
  roles: z.array(identityRoleSchema),
  activation: z.object({
    emailInvitationAvailable: z.boolean(),
    activationChallengeAvailable: z.boolean(),
  }).strict(),
}).strict();

export type ProvisionedMembership = z.infer<typeof provisionedMembershipSchema>;

export const invitationStateSchema = z.object({
  membershipId: z.string().min(1),
  invitationId: z.string().min(1),
  status: z.string().min(1),
  expiresAt: z.string().min(1),
}).strict();

export type InvitationState = z.infer<typeof invitationStateSchema>;

export const activationChallengeSchema = z.object({
  membershipId: z.string().min(1),
  username: z.string().min(1),
  activationCode: z.string().min(1),
  expiresAt: z.string().min(1),
}).strict();

export type ActivationChallenge = z.infer<typeof activationChallengeSchema>;

const recoveryAcceptedSchema = z.object({ accepted: z.literal(true) }).strict();
const passwordResetSchema = z.object({
  status: z.literal('PASSWORD_RESET'),
  revokedSessions: z.number().int().nonnegative(),
}).strict();

const identityErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()),
    requestId: z.string(),
  }).strict(),
}).strict();

export class IdentityApiError extends Error {
  readonly code: string;
  readonly details: readonly unknown[];
  readonly requestId: string;
  readonly status: number;

  constructor(input: { code: string; details?: readonly unknown[]; message: string; requestId?: string; status: number }) {
    super(input.message);
    this.name = 'IdentityApiError';
    this.code = input.code;
    this.details = input.details ?? [];
    this.requestId = input.requestId ?? 'unavailable';
    this.status = input.status;
  }
}

export function identityErrorMessage(error: unknown): string {
  if (!(error instanceof IdentityApiError)) {
    return 'No pudimos conectar con EduPay Identity. Revisa tu conexión e inténtalo nuevamente.';
  }
  if (error.status === 400) {
    if (error.code === 'PASSWORD_POLICY_FAILED') {
      return 'La contraseña debe tener al menos 12 caracteres y no contener caracteres de control.';
    }
    if (error.code === 'VALIDATION_FAILED' || error.code === 'VALIDATION_ERROR') {
      return 'Los datos ingresados no son válidos. Revisa el formulario e inténtalo nuevamente.';
    }
    return error.message || 'Los datos de la solicitud no son válidos.';
  }
  if (error.status === 401) return 'No pudimos verificar las credenciales. Revisa los datos e inténtalo nuevamente.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para completar esta acción.';
  if (error.status === 404) return 'El recurso solicitado no está disponible.';
  if (error.status === 409) return 'La cuenta o membresía requiere resolver un conflicto antes de continuar.';
  if (error.status === 410) return 'Este enlace o código expiró o ya fue utilizado. Solicita uno nuevo.';
  if (error.status === 429) return 'Se realizaron demasiados intentos. Espera unos minutos antes de volver a intentar.';
  if (error.status === 0) return 'No pudimos conectar con EduPay Identity. Revisa tu conexión e inténtalo nuevamente.';
  return 'No pudimos completar la solicitud de cuenta. Inténtalo nuevamente.';
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface IdentityBrowserClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export class IdentityBrowserClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: IdentityBrowserClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestInit & { accessToken?: string; browserCredentials?: boolean } = {},
  ): Promise<T> {
    const { accessToken, browserCredentials, ...init } = options;
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Request-Id', newRequestId());
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        ...(browserCredentials ? { credentials: 'include' as const } : {}),
        headers,
      });
    } catch (networkError) {
      if (typeof console !== 'undefined') {
        console.error(`[IdentityBrowserClient] Network error calling ${this.baseUrl}${path}:`, networkError);
      }
      throw new IdentityApiError({ code: 'NETWORK_ERROR', message: 'Identity is unavailable.', status: 0 });
    }

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      const parsed = identityErrorSchema.safeParse(payload);
      throw new IdentityApiError({
        code: parsed.success ? parsed.data.error.code : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED',
        details: parsed.success ? parsed.data.error.details : [],
        message: parsed.success ? parsed.data.error.message : 'The request could not be completed.',
        ...(parsed.success ? { requestId: parsed.data.error.requestId } : {}),
        status: response.status,
      });
    }

    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => undefined);
    return schema.parse(payload);
  }

  login(input: { identifier: string; password: string; tenantHandle?: string; device?: { label: string } }) {
    return this.request('/api/v1/auth/login', identityTokenResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
      browserCredentials: true,
    });
  }

  refresh() {
    return this.request('/api/v1/auth/refresh', identityTokenResponseSchema, {
      method: 'POST',
      body: JSON.stringify({}),
      browserCredentials: true,
    });
  }

  logout(accessToken: string) {
    return this.request('/api/v1/auth/logout', z.undefined(), {
      method: 'POST', accessToken, browserCredentials: true,
    });
  }

  logoutAll(accessToken: string) {
    return this.request('/api/v1/auth/logout-all', z.object({ revokedSessions: z.number().int().nonnegative() }).strict(), {
      method: 'POST', accessToken, browserCredentials: true,
    });
  }

  me(accessToken: string) {
    return this.request('/api/v1/auth/me', identityMeSchema, { method: 'GET', accessToken });
  }

  memberships(accessToken: string) {
    return this.request('/api/v1/auth/memberships', z.array(identityMembershipSchema), { method: 'GET', accessToken });
  }

  switchContext(accessToken: string, membershipId: string) {
    return this.request('/api/v1/auth/sessions/current-context', identityTokenResponseSchema, {
      method: 'POST', accessToken, body: JSON.stringify({ membershipId }),
    });
  }

  acceptInvitation(invitationToken: string, password: string) {
    return this.request('/api/v1/auth/invitations/accept', lifecycleResultSchema, {
      method: 'POST', body: JSON.stringify({ invitationToken, password }),
    });
  }

  completeActivation(institutionalUsername: string, activationCode: string, password: string) {
    return this.request('/api/v1/auth/activations/complete', lifecycleResultSchema, {
      method: 'POST', body: JSON.stringify({ institutionalUsername, activationCode, password }),
    });
  }

  requestPasswordRecovery(identifier: string, tenantHandle?: string) {
    return this.request('/api/v1/auth/password-recovery/request', recoveryAcceptedSchema, {
      method: 'POST', body: JSON.stringify({ identifier, ...(tenantHandle ? { tenantHandle } : {}) }),
    });
  }

  confirmPasswordRecovery(resetToken: string, password: string) {
    return this.request('/api/v1/auth/password-recovery/confirm', passwordResetSchema, {
      method: 'POST', body: JSON.stringify({ resetToken, password }),
    });
  }

  provisionMembership(accessToken: string, tenantId: string, input: {
    institutionalUsername: string;
    email?: string;
    roles: IdentityRole[];
  }) {
    return this.request(`/api/v1/tenants/${encodeURIComponent(tenantId)}/memberships`, provisionedMembershipSchema, {
      method: 'POST', accessToken, body: JSON.stringify(input),
    });
  }

  inviteMembership(accessToken: string, tenantId: string, membershipId: string) {
    return this.request(`/api/v1/tenants/${encodeURIComponent(tenantId)}/memberships/${encodeURIComponent(membershipId)}/invite`, invitationStateSchema, {
      method: 'POST', accessToken,
    });
  }

  createActivationChallenge(accessToken: string, tenantId: string, membershipId: string) {
    return this.request(`/api/v1/tenants/${encodeURIComponent(tenantId)}/memberships/${encodeURIComponent(membershipId)}/activation-challenge`, activationChallengeSchema, {
      method: 'POST', accessToken,
    });
  }
}
