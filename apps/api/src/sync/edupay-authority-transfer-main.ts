import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import {
  ACADEMIC_AUDIT_PORT,
  CorrelatedAcademicAuditLogger,
} from '../academic/academic-audit.port';
import { validateEnvironment } from '../config/environment';
import { PersistenceModule } from '../persistence/persistence.module';
import {
  AuthorityTransferConflictError,
  AuthorityTransferUsageError,
  EduPayAuthorityTransferService,
  parseAuthorityTransferArguments,
} from './edupay-authority-transfer';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PersistenceModule,
  ],
  providers: [
    CorrelatedAcademicAuditLogger,
    {
      provide: ACADEMIC_AUDIT_PORT,
      useExisting: CorrelatedAcademicAuditLogger,
    },
    EduPayAuthorityTransferService,
  ],
})
class AuthorityTransferAppModule {}

async function main(): Promise<void> {
  const input = parseAuthorityTransferArguments(process.argv.slice(2));
  const application = await NestFactory.createApplicationContext(
    AuthorityTransferAppModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const service = application.get(EduPayAuthorityTransferService);
    if (input.apply && input.expected) {
      const result = await service.apply(input.tenantId, input.expected);
      console.log(
        JSON.stringify({ action: 'EDUPAY_AUTHORITY_TRANSFER', ...result }),
      );
      return;
    }
    const plan = await service.plan(input.tenantId);
    console.log(
      JSON.stringify({
        action: 'EDUPAY_AUTHORITY_TRANSFER_DRY_RUN',
        applied: false,
        ...plan,
      }),
    );
    if (plan.blockers.length > 0) process.exitCode = 1;
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof AuthorityTransferUsageError ||
    error instanceof AuthorityTransferConflictError
  ) {
    console.error(
      JSON.stringify({
        action: 'EDUPAY_AUTHORITY_TRANSFER_REFUSED',
        code:
          error instanceof AuthorityTransferConflictError
            ? error.code
            : 'USAGE',
        message: error.message,
      }),
    );
  } else {
    console.error('EDUPAY_AUTHORITY_TRANSFER_FAILED');
  }
  process.exitCode = 1;
});
