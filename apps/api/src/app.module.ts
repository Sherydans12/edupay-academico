import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AcademicModule } from './academic/academic.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { LearningModule } from './learning/learning.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SecurityFoundationModule } from './security/security-foundation.module';
import { StorageModule } from './storage/storage.module';

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
    HealthModule,
  ],
})
export class AppModule {}
