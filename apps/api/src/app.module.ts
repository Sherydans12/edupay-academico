import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AcademicModule } from './academic/academic.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SecurityFoundationModule } from './security/security-foundation.module';

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
    HealthModule,
  ],
})
export class AppModule {}
