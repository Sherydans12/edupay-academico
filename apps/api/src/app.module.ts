import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { SecurityFoundationModule } from './security/security-foundation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SecurityFoundationModule,
    HealthModule,
  ],
})
export class AppModule {}
