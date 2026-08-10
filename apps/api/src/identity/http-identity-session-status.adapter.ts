import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import type {
  IdentitySessionStatus,
  IdentitySessionStatusAdapter,
  IdentitySessionStatusRequest,
} from './identity-adapter.port';
import { IdentityInternalHttpClient } from './identity-internal-http.client';

const identitySessionStatusSchema = z
  .object({
    active: z.boolean(),
    identityUserId: z.string().min(1),
    membershipActive: z.boolean(),
    membershipId: z.string().min(1),
    sessionActive: z.boolean(),
    sessionId: z.string().min(1),
    tenantId: z.string().min(1),
  })
  .strict();

@Injectable()
export class HttpIdentitySessionStatusAdapter implements IdentitySessionStatusAdapter {
  constructor(private readonly client: IdentityInternalHttpClient) {}

  async checkSessionStatus(
    request: IdentitySessionStatusRequest,
  ): Promise<IdentitySessionStatus> {
    let response: unknown;
    try {
      response = await this.client.get(
        `/internal/v1/sessions/${encodeURIComponent(request.sessionId)}/status`,
        request.correlationId,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Identity verification is temporarily unavailable.',
      );
    }
    const parsed = identitySessionStatusSchema.safeParse(response);

    if (!parsed.success) {
      throw new ServiceUnavailableException(
        'Identity verification is temporarily unavailable.',
      );
    }

    return parsed.data;
  }
}
