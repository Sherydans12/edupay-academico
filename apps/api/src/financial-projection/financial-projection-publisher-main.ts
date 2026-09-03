import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnvironment } from '../config/environment';
import { PersistenceModule } from '../persistence/persistence.module';
import { FinancialProjectionConfigService } from './financial-projection-config.service';
import { FinancialProjectionPublisherService } from './financial-projection-publisher.service';

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
    FinancialProjectionConfigService,
    FinancialProjectionPublisherService,
  ],
})
class FinancialProjectionPublisherAppModule {}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(
    FinancialProjectionPublisherAppModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const publisher = application.get(FinancialProjectionPublisherService);
    console.log(
      JSON.stringify({
        action: 'FINANCIAL_PROJECTION_PUBLISH_DRAIN',
        ...(await publisher.publishPending()),
      }),
    );
  } finally {
    await application.close();
  }
}

void main();
