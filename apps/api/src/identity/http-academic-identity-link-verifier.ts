import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

import type {
  AcademicIdentityLinkRequest,
  AcademicIdentityLinkVerifier,
} from '../academic/identity-link.port';
import { identityRoles } from './identity.types';
import {
  IdentityInternalHttpClient,
  IdentityInternalHttpResponseError,
} from './identity-internal-http.client';

const membershipStatusSchema = z.enum([
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
]);

const identityLinkVerificationSchema = z
  .object({
    verified: z.boolean(),
    identityUserId: z.string().min(1),
    membershipId: z.string().min(1),
    tenantId: z.string().min(1),
    membershipStatus: membershipStatusSchema,
    roles: z.array(z.enum(identityRoles)),
  })
  .strict();

const LINKABLE_MEMBERSHIP_STATUSES = new Set(['ACTIVE', 'PENDING_ACTIVATION']);

@Injectable()
export class HttpAcademicIdentityLinkVerifier implements AcademicIdentityLinkVerifier {
  constructor(private readonly client: IdentityInternalHttpClient) {}

  async verifyExactLink(request: AcademicIdentityLinkRequest): Promise<void> {
    const expectedRole = request.academicRecordType;
    let response: unknown;
    try {
      response = await this.client.post(
        '/internal/v1/identity-users/resolve',
        request.context.requestId,
        {
          actor: {
            identityUserId: request.context.principal.identityUserId,
            sessionId: request.context.principal.sessionId,
            membershipId: request.context.tenant.membershipId,
            tenantId: request.context.tenant.tenantId,
          },
          targetIdentityUserId: request.identityUserId,
          expectedRole,
        },
      );
    } catch (error) {
      if (
        error instanceof IdentityInternalHttpResponseError &&
        error.status === 404
      ) {
        this.notVerified();
      }
      throw new ServiceUnavailableException(
        'Identity verification is temporarily unavailable.',
      );
    }
    const parsed = identityLinkVerificationSchema.safeParse(response);

    if (!parsed.success) {
      throw new ServiceUnavailableException(
        'Identity verification is temporarily unavailable.',
      );
    }

    const verification = parsed.data;
    if (
      !verification.verified ||
      verification.identityUserId !== request.identityUserId ||
      verification.tenantId !== request.context.tenant.tenantId ||
      !LINKABLE_MEMBERSHIP_STATUSES.has(verification.membershipStatus) ||
      !verification.roles.includes(expectedRole)
    ) {
      this.notVerified();
    }
  }

  private notVerified(): never {
    throw new ForbiddenException(
      'The requested Identity link could not be verified.',
    );
  }
}
