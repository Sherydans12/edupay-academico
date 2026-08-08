import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiExceptionFilter } from '../http/api-exception.filter';
import { correlationIdMiddleware } from '../http/correlation-id.middleware';

export function configureApplication(application: INestApplication): void {
  application.setGlobalPrefix('api');
  application.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  application.use(correlationIdMiddleware);
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  application.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfiguration = new DocumentBuilder()
    .setTitle('EduPay Academico API')
    .setDescription('Versioned academic service API')
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(
    application,
    openApiConfiguration,
  );

  SwaggerModule.setup('api/docs', application, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });
}
