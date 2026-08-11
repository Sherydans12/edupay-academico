import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnvironment } from '../config/environment';
import { PersistenceModule } from '../persistence/persistence.module';
import { NotificationsModule } from './notifications.module';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PersistenceModule,
    NotificationsModule,
  ],
})
class NotificationWorkerAppModule {}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(
    NotificationWorkerAppModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const worker = application.get(NotificationWorkerService);
    if (process.argv.includes('--check')) {
      const result = await worker.checkReadiness();
      console.log(JSON.stringify({ service: 'edupay-academico-notification-worker', status: 'ready', ...result }));
      return;
    }
    if (process.argv.includes('--once')) {
      const result = await worker.runOnce();
      console.log(JSON.stringify({ service: 'edupay-academico-notification-worker', status: 'ok', ...result }));
      return;
    }
    await worker.runForever();
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Notification worker failed.');
  process.exitCode = 1;
});
