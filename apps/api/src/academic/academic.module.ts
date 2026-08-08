import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import {
  ACADEMIC_AUDIT_PORT,
  CorrelatedAcademicAuditLogger,
} from './academic-audit.port';
import {
  AcademicAdminController,
  AcademicContextController,
} from './academic.controller';
import { AcademicService } from './academic.service';
import {
  ACADEMIC_IDENTITY_LINK_VERIFIER,
  UnconfiguredAcademicIdentityLinkVerifier,
} from './identity-link.port';

@Module({
  imports: [SecurityFoundationModule],
  controllers: [AcademicAdminController, AcademicContextController],
  providers: [
    AcademicService,
    CorrelatedAcademicAuditLogger,
    UnconfiguredAcademicIdentityLinkVerifier,
    {
      provide: ACADEMIC_AUDIT_PORT,
      useExisting: CorrelatedAcademicAuditLogger,
    },
    {
      provide: ACADEMIC_IDENTITY_LINK_VERIFIER,
      useExisting: UnconfiguredAcademicIdentityLinkVerifier,
    },
  ],
  exports: [AcademicService, ACADEMIC_AUDIT_PORT],
})
export class AcademicModule {}
