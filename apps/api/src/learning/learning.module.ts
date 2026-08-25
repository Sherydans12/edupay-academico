import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module';
import { SecurityFoundationModule } from '../security/security-foundation.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  LearningManagementController,
  LearningReadController,
} from './learning.controller';
import { LearningService } from './learning.service';
import { LearningReadModule } from './read/learning-read.module';
import { SparseOrderingService } from './ordering/sparse-ordering.service';
import { CommandIdempotencyService } from './idempotency/command-idempotency.service';

@Module({
  imports: [
    SecurityFoundationModule,
    AcademicModule,
    StorageModule,
    NotificationsModule,
    LearningReadModule,
  ],
  controllers: [LearningManagementController, LearningReadController],
  providers: [
    LearningService,
    SparseOrderingService,
    CommandIdempotencyService,
  ],
  exports: [LearningService, SparseOrderingService, CommandIdempotencyService],
})
export class LearningModule {}
