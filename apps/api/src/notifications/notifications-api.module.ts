import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { NotificationsModule } from './notifications.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [SecurityFoundationModule, NotificationsModule],
  controllers: [NotificationsController],
})
export class NotificationsApiModule {}
