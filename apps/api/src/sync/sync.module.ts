import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { SyncExecutionModule } from './sync-execution.module';
import { SyncStatusController } from './sync-status.controller';
import { SyncStatusService } from './sync-status.service';

@Module({
  imports: [SecurityFoundationModule, SyncExecutionModule],
  controllers: [SyncStatusController],
  providers: [SyncStatusService],
  exports: [SyncExecutionModule, SyncStatusService],
})
export class SyncModule {}
