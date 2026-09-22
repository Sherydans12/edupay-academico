import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AcademicModule } from './academic/academic.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { LearningModule } from './learning/learning.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SecurityFoundationModule } from './security/security-foundation.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsApiModule } from './notifications/notifications-api.module';
import { SyncModule } from './sync/sync.module';
import { FinancialProjectionContractModule } from './financial-projection/financial-projection-contract.module';
import { DieModule } from './die/die.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PersistenceModule,
    SecurityFoundationModule,
    AcademicModule,
    LearningModule,
    StorageModule,
    NotificationsApiModule,
    SyncModule,
    FinancialProjectionContractModule,
    DieModule,
    HealthModule,
  ],
})
export class AppModule {}
