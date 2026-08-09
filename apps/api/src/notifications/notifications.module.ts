import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { FakeAcademicEmailAdapter, ResendAcademicEmailAdapter } from './academic-email.adapter';
import { NotificationService } from './notification.service';
import {
  ACADEMIC_EMAIL_ADAPTER,
  type AcademicEmailAdapter as AcademicEmailAdapterPort,
} from './notification.types';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [ConfigModule],
  providers: [
    NotificationService,
    NotificationWorkerService,
    ResendAcademicEmailAdapter,
    FakeAcademicEmailAdapter,
    {
      provide: ACADEMIC_EMAIL_ADAPTER,
      inject: [ConfigService, ResendAcademicEmailAdapter, FakeAcademicEmailAdapter],
      useFactory: (
        config: ConfigService,
        resend: AcademicEmailAdapterPort,
        fake: AcademicEmailAdapterPort,
      ): AcademicEmailAdapterPort =>
        config.get<string>('NODE_ENV') === 'test' ||
        config.get<string>('ACADEMIC_EMAIL_MODE') === 'fake'
          ? fake
          : resend,
    },
  ],
  exports: [NotificationService, NotificationWorkerService, ACADEMIC_EMAIL_ADAPTER],
})
export class NotificationsModule {}
