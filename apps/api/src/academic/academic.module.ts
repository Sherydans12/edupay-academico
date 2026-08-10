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

@Module({
  imports: [SecurityFoundationModule],
  controllers: [AcademicAdminController, AcademicContextController],
  providers: [
    AcademicService,
    CorrelatedAcademicAuditLogger,
    {
      provide: ACADEMIC_AUDIT_PORT,
      useExisting: CorrelatedAcademicAuditLogger,
    },
  ],
  exports: [AcademicService, ACADEMIC_AUDIT_PORT],
})
export class AcademicModule {}
