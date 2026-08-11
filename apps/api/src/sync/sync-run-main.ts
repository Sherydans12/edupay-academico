import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnvironment } from '../config/environment';
import { SyncExecutionModule } from './sync-execution.module';
import { EduPaySyncService } from './sync.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE =
  'Usage: pnpm sync:run -- --tenant-id <canonical-uuid> --mode incremental|full';

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
class SyncRunAppModule {}

function argumentsForRun(args: readonly string[]): {
  tenantId: string;
  mode: 'INCREMENTAL' | 'FULL';
} {
  let tenantId: string | undefined;
  let mode: 'INCREMENTAL' | 'FULL' | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(USAGE);
    if (option === '--tenant-id' && !tenantId) tenantId = value.toLowerCase();
    else if (option === '--mode' && !mode) {
      if (value !== 'incremental' && value !== 'full') throw new Error(USAGE);
      mode = value.toUpperCase() as 'INCREMENTAL' | 'FULL';
    } else throw new Error(USAGE);
  }
  if (!tenantId || !UUID_PATTERN.test(tenantId) || !mode) {
    throw new Error(USAGE);
  }
  return { tenantId, mode };
}

async function main(): Promise<void> {
  const input = argumentsForRun(process.argv.slice(2));
  const application = await NestFactory.createApplicationContext(
    SyncRunAppModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const result = await application
      .get(EduPaySyncService)
      .execute(input.tenantId, input.mode, 'MANUAL');
    console.log(
      JSON.stringify({
        action: 'EDUPAY_SYNC_MANUAL_RUN',
        tenantId: input.tenantId,
        mode: input.mode,
        ...result,
      }),
    );
    if (result.status !== 'SUCCEEDED') process.exitCode = 1;
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : USAGE);
  process.exitCode = 1;
});
