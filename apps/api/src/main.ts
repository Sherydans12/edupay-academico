import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication } from './bootstrap/configure-application';
import { validateEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const application = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureApplication(application);
  await application.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
