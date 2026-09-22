import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

import type { AcademicRequestContext } from '../academic/academic-context';
import { identityRoles } from '../identity/identity.types';
import {
  IdentityInternalHttpClient,
  IdentityInternalHttpResponseError,
} from '../identity/identity-internal-http.client';

const responseSchema = z
  .object({
    verified: z.literal(true),
    identityUserId: z.string().min(1),
    membershipId: z.string().min(1),
    tenantId: z.string().min(1),
    membershipStatus: z.literal('ACTIVE'),
    roles: z.array(z.enum(identityRoles)),
  })
  .strict();

export interface VerifiedDieTargetMembership {
  readonly identityUserId: string;
  readonly membershipId: string;
  readonly roles: readonly string[];
}

@Injectable()
export class DieIdentityMembershipVerifier {
  constructor(private readonly client: IdentityInternalHttpClient) {}

  async verify(
    context: AcademicRequestContext,
    targetIdentityUserId: string,
  ): Promise<VerifiedDieTargetMembership> {
    let response: unknown;
    try {
      response = await this.client.post(
        '/internal/v1/tenant-memberships/verify',
        context.requestId,
        {
          actor: {
            identityUserId: context.principal.identityUserId,
            sessionId: context.principal.sessionId,
            membershipId: context.tenant.membershipId,
            tenantId: context.tenant.tenantId,
          },
          targetIdentityUserId,
        },
      );
    } catch (error) {
      if (
        error instanceof IdentityInternalHttpResponseError &&
        (error.status === 403 || error.status === 404)
      ) {
        throw new ForbiddenException(
          'The requested department member is not eligible.',
        );
      }
      throw new ServiceUnavailableException(
        'Identity verification is temporarily unavailable.',
      );
    }
    const parsed = responseSchema.safeParse(response);
    if (
      !parsed.success ||
      parsed.data.identityUserId !== targetIdentityUserId ||
      parsed.data.tenantId !== context.tenant.tenantId ||
      !parsed.data.roles.some((role) =>
        ['TEACHER', 'TENANT_ADMIN'].includes(role),
      )
    ) {
      throw new ForbiddenException(
        'The requested department member is not eligible.',
      );
    }
    return parsed.data;
  }
}
