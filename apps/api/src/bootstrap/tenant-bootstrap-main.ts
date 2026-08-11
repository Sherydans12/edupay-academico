import { PrismaService } from '../persistence/prisma.service';
import {
  TENANT_BOOTSTRAP_USAGE,
  TenantBootstrapConflictError,
  TenantBootstrapUsageError,
  bootstrapAcademicTenant,
  parseTenantBootstrapArguments,
} from './tenant-bootstrap';

async function main(): Promise<void> {
  const parsed = parseTenantBootstrapArguments(process.argv.slice(2));
  if ('help' in parsed) {
    console.log(TENANT_BOOTSTRAP_USAGE);
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new TenantBootstrapUsageError('DATABASE_URL is required.');
  }

  const prisma = new PrismaService();
  try {
    const result = await bootstrapAcademicTenant(prisma, parsed);
    console.log(
      JSON.stringify({
        action: 'ACADEMIC_TENANT_BOOTSTRAP',
        evidence: 'structured-operator-log',
        requestId: parsed.requestId,
        status:
          result.tenantCreated ||
          result.globalQuotaPolicyCreated ||
          result.globalUsageAccountCreated ||
          result.tenantQuotaPolicyCreated ||
          result.tenantUsageAccountCreated
            ? 'created-or-completed'
            : 'already-compatible',
        ...result,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof TenantBootstrapUsageError) {
    console.error(`${error.message}\n${TENANT_BOOTSTRAP_USAGE}`);
  } else if (error instanceof TenantBootstrapConflictError) {
    console.error(`Academic tenant bootstrap refused: ${error.message}`);
  } else {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    const databaseUrl = process.env.DATABASE_URL;
    const safeMessage = databaseUrl ? message.replaceAll(databaseUrl, '[redacted database URL]') : message;
    console.error(`Academic tenant bootstrap failed: ${safeMessage}`);
  }
  process.exitCode = 1;
});
