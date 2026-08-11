import { Module } from '@nestjs/common';

import {
  ACADEMIC_AUDIT_PORT,
  CorrelatedAcademicAuditLogger,
} from '../academic/academic-audit.port';
import { PersistenceModule } from '../persistence/persistence.module';
import { EduPayIntegrationClient } from './edupay-integration.client';
import { SyncItemApplicationService } from './sync-item-application.service';
import { SyncWorkerService } from './sync-worker.service';
import { EduPaySyncService } from './sync.service';

@Module({
  imports: [PersistenceModule],
  providers: [
    CorrelatedAcademicAuditLogger,
    {
      provide: ACADEMIC_AUDIT_PORT,
      useExisting: CorrelatedAcademicAuditLogger,
    },
    EduPayIntegrationClient,
    EduPaySyncService,
    SyncItemApplicationService,
    SyncWorkerService,
  ],
  exports: [EduPaySyncService, SyncWorkerService],
})
export class SyncExecutionModule {}
