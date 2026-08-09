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

@Module({
  imports: [SecurityFoundationModule, AcademicModule, StorageModule, NotificationsModule],
  controllers: [LearningManagementController, LearningReadController],
  providers: [
    LearningService,
  ],
  exports: [LearningService],
})
export class LearningModule {}
