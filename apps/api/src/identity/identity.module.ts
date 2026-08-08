import { Module } from '@nestjs/common';

import {
  IDENTITY_ACCESS_TOKEN_VERIFIER,
  IDENTITY_SESSION_STATUS_ADAPTER,
} from './identity-adapter.port';
import { JwksIdentityAccessTokenVerifier } from './jwks-identity-access-token-verifier';
import { UnconfiguredIdentitySessionStatusAdapter } from './unconfigured-identity-session-status.adapter';

@Module({
  providers: [
    JwksIdentityAccessTokenVerifier,
    UnconfiguredIdentitySessionStatusAdapter,
    {
      provide: IDENTITY_ACCESS_TOKEN_VERIFIER,
      useExisting: JwksIdentityAccessTokenVerifier,
    },
    {
      provide: IDENTITY_SESSION_STATUS_ADAPTER,
      useExisting: UnconfiguredIdentitySessionStatusAdapter,
    },
  ],
  exports: [IDENTITY_ACCESS_TOKEN_VERIFIER, IDENTITY_SESSION_STATUS_ADAPTER],
})
export class IdentityModule {}
