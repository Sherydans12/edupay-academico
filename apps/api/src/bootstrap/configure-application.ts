import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { Environment } from '../config/environment';
import { ApiExceptionFilter } from '../http/api-exception.filter';
import { correlationIdMiddleware } from '../http/correlation-id.middleware';

export function configureApplication(application: INestApplication): void {
  const config = application.get(ConfigService<Environment, true>);
  const trustedOrigins = new Set(config.getOrThrow('ACADEMIC_TRUSTED_WEB_ORIGINS'));

  application.setGlobalPrefix('api');
  application.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  application.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, origin?: boolean | string) => void,
    ) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      try {
        const parsed = new URL(origin);
        const normalized =
          ['http:', 'https:'].includes(parsed.protocol) &&
          parsed.username === '' &&
          parsed.password === '' &&
          (parsed.pathname === '' || parsed.pathname === '/') &&
          parsed.search === '' &&
          parsed.hash === ''
            ? parsed.origin
            : null;
        callback(null, normalized && trustedOrigins.has(normalized) ? origin : false);
      } catch {
        callback(null, false);
      }
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-EduPay-Client-Type',
      'X-EduPay-Upload-Token',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
    optionsSuccessStatus: 204,
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
