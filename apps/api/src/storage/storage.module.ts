import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';

import { AcademicModule } from '../academic/academic.module';
import { SecurityFoundationModule } from '../security/security-foundation.module';
import { LEARNING_ATTACHMENT_PORT } from '../learning/learning-attachment.port';
import { LEARNING_STUDENT_WORK_PORT } from '../learning/learning-student-work.port';
import { SubmissionService } from './submission.service';
import {
  BoundedMultipartUploadInterceptor,
  StorageController,
} from './storage.controller';
import { StorageService } from './storage.service';
import { SubmissionController } from './submission.controller';
import { LocalPrivateStorageAdapter } from './local-private-storage.adapter';
import { PRIVATE_STORAGE_PROVIDER } from './private-storage.port';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClamAvMalwareScanner } from './clamav-malware-scanner.adapter';
import { FakeMalwareScanner } from './fake-malware-scanner.adapter';
import { BoundedMalwareScanner } from './bounded-malware-scanner';
import {
  MALWARE_SCANNER,
  MALWARE_SCANNER_ADAPTER,
  type MalwareScanner,
} from './malware-scanner.port';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
  imports: [SecurityFoundationModule, AcademicModule, NotificationsModule],
  controllers: [StorageController, SubmissionController],
  providers: [
    LocalPrivateStorageAdapter,
    ClamAvMalwareScanner,
    FakeMalwareScanner,
    {
      provide: MALWARE_SCANNER_ADAPTER,
      inject: [ConfigService, ClamAvMalwareScanner, FakeMalwareScanner],
      useFactory: (
        config: ConfigService<Environment, true>,
        clamav: ClamAvMalwareScanner,
        fake: FakeMalwareScanner,
      ): MalwareScanner =>
        config.get('ACADEMIC_MALWARE_SCANNER') === 'clamav' ? clamav : fake,
    },
    {
      provide: MALWARE_SCANNER,
      inject: [MALWARE_SCANNER_ADAPTER, ConfigService],
      useFactory: (
        adapter: MalwareScanner,
        config: ConfigService<Environment, true>,
      ): MalwareScanner => new BoundedMalwareScanner(adapter, config),
    },
    {
      provide: PRIVATE_STORAGE_PROVIDER,
      useExisting: LocalPrivateStorageAdapter,
    },
    StorageService,
    StorageCleanupService,
    SubmissionService,
    BoundedMultipartUploadInterceptor,
    {
      provide: LEARNING_STUDENT_WORK_PORT,
      useExisting: SubmissionService,
    },
    {
      provide: LEARNING_ATTACHMENT_PORT,
      useExisting: StorageService,
    },
  ],
  exports: [
    StorageService,
    SubmissionService,
    LocalPrivateStorageAdapter,
    MALWARE_SCANNER,
    LEARNING_STUDENT_WORK_PORT,
    LEARNING_ATTACHMENT_PORT,
  ],
})
export class StorageModule {}
