import { PrismaService } from '../persistence/prisma.service';
import {
  configureEduPaySync,
  parseSyncConfigurationArguments,
  SYNC_CONFIGURE_USAGE,
  SyncConfigurationConflictError,
  SyncConfigurationUsageError,
} from './sync-configuration';

async function main(): Promise<void> {
  const parsed = parseSyncConfigurationArguments(process.argv.slice(2));
  if ('help' in parsed) {
    console.log(SYNC_CONFIGURE_USAGE);
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new SyncConfigurationUsageError('DATABASE_URL is required.');
  }
  const prisma = new PrismaService();
  try {
    const result = await configureEduPaySync(prisma, parsed);
    console.log(
      JSON.stringify({
        action: 'EDUPAY_SYNC_CONFIGURED',
        status: result.created ? 'created' : 'already-compatible',
        ...result,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof SyncConfigurationUsageError ||
    error instanceof SyncConfigurationConflictError
  ) {
    console.error(`${error.message}\n${SYNC_CONFIGURE_USAGE}`);
  } else {
    console.error('EduPay synchronization configuration failed.');
  }
  process.exitCode = 1;
});
