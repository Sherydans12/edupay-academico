import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type {
  IdentitySessionStatus,
  IdentitySessionStatusAdapter,
} from './identity-adapter.port';

/**
 * Fails closed until the restricted service-authentication transport contract
 * is implemented. Tests and future deployments can replace this provider.
 */
@Injectable()
export class UnconfiguredIdentitySessionStatusAdapter implements IdentitySessionStatusAdapter {
  checkSessionStatus(): Promise<IdentitySessionStatus> {
    throw new ServiceUnavailableException(
      'Current Identity status verification is unavailable.',
    );
  }
}
