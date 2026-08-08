import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthorizationGuard } from '../authorization/authorization.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  DisabledSupportContextPolicy,
  SUPPORT_CONTEXT_POLICY,
} from '../authorization/support-context.policy';
import { IdentityAuthenticationGuard } from '../authentication/identity-authentication.guard';
import { CurrentIdentityStatusGuard } from '../identity/current-identity-status.guard';
import { CurrentIdentityStatusService } from '../identity/current-identity-status.service';
import { IdentityModule } from '../identity/identity.module';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { TenantContextGuard } from '../tenant/tenant-context.guard';

@Module({
  imports: [IdentityModule],
  providers: [
    AuthorizationService,
    DisabledSupportContextPolicy,
    CurrentIdentityStatusService,
    CurrentRequestContext,
    {
      provide: SUPPORT_CONTEXT_POLICY,
      useExisting: DisabledSupportContextPolicy,
    },
    { provide: APP_GUARD, useClass: IdentityAuthenticationGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_GUARD, useClass: CurrentIdentityStatusGuard },
  ],
  exports: [
    AuthorizationService,
    CurrentIdentityStatusService,
    CurrentRequestContext,
    IdentityModule,
    SUPPORT_CONTEXT_POLICY,
  ],
})
export class SecurityFoundationModule {}
