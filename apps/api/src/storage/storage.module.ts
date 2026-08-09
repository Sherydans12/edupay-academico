import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module';
import { SecurityFoundationModule } from '../security/security-foundation.module';
import { LEARNING_ATTACHMENT_PORT } from '../learning/learning-attachment.port';
import { LEARNING_STUDENT_WORK_PORT } from '../learning/learning-student-work.port';
import { SubmissionService } from './submission.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { SubmissionController } from './submission.controller';
import { LocalPrivateStorageAdapter } from './local-private-storage.adapter';
import { PRIVATE_STORAGE_PROVIDER } from './private-storage.port';

@Module({
  imports: [SecurityFoundationModule, AcademicModule],
  controllers: [StorageController, SubmissionController],
  providers: [
    LocalPrivateStorageAdapter,
    {
      provide: PRIVATE_STORAGE_PROVIDER,
      useExisting: LocalPrivateStorageAdapter,
    },
    StorageService,
    SubmissionService,
    {
      provide: LEARNING_STUDENT_WORK_PORT,
      useExisting: SubmissionService,
    },
    {
      provide: LEARNING_ATTACHMENT_PORT,
      useExisting: StorageService,
    },
  ],
  exports: [StorageService, SubmissionService, LEARNING_STUDENT_WORK_PORT, LEARNING_ATTACHMENT_PORT],
})
export class StorageModule {}
