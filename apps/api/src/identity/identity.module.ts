import { Module } from '@nestjs/common';

import { ACADEMIC_IDENTITY_LINK_VERIFIER } from '../academic/identity-link.port';
import { HttpAcademicIdentityLinkVerifier } from './http-academic-identity-link-verifier';
import { HttpIdentitySessionStatusAdapter } from './http-identity-session-status.adapter';
import {
  IDENTITY_ACCESS_TOKEN_VERIFIER,
  IDENTITY_SESSION_STATUS_ADAPTER,
} from './identity-adapter.port';
import { IdentityInternalHttpClient } from './identity-internal-http.client';
import { JwksIdentityAccessTokenVerifier } from './jwks-identity-access-token-verifier';

@Module({
  providers: [
    JwksIdentityAccessTokenVerifier,
    IdentityInternalHttpClient,
    HttpIdentitySessionStatusAdapter,
    HttpAcademicIdentityLinkVerifier,
    {
      provide: IDENTITY_ACCESS_TOKEN_VERIFIER,
      useExisting: JwksIdentityAccessTokenVerifier,
    },
    {
      provide: IDENTITY_SESSION_STATUS_ADAPTER,
      useExisting: HttpIdentitySessionStatusAdapter,
    },
    {
      provide: ACADEMIC_IDENTITY_LINK_VERIFIER,
      useExisting: HttpAcademicIdentityLinkVerifier,
    },
  ],
  exports: [
    ACADEMIC_IDENTITY_LINK_VERIFIER,
    IDENTITY_ACCESS_TOKEN_VERIFIER,
    IDENTITY_SESSION_STATUS_ADAPTER,
  ],
})
export class IdentityModule {}
