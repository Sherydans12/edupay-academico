import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnvironment } from '../config/environment';
import { SyncExecutionModule } from './sync-execution.module';
import { SyncWorkerService } from './sync-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SyncExecutionModule,
  ],
})
class SyncWorkerAppModule {}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(
    SyncWorkerAppModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const worker = application.get(SyncWorkerService);
    if (process.argv.includes('--check')) {
      console.log(
        JSON.stringify({
          service: 'edupay-academico-sync-worker',
          status: 'ready',
          ...(await worker.checkReadiness()),
        }),
      );
      return;
    }
    if (process.argv.includes('--once')) {
      console.log(
        JSON.stringify({
          service: 'edupay-academico-sync-worker',
          status: 'ok',
          ...(await worker.runOnce()),
        }),
      );
      return;
    }
    await worker.runForever();
  } finally {
    await application.close();
  }
}

void main().catch(() => {
  console.error('EduPay synchronization worker failed.');
  process.exitCode = 1;
});
