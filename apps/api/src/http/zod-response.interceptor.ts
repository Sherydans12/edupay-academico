import { applyDecorators, Injectable, UseInterceptors } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z, type ZodType } from 'zod';

@Injectable()
export class ZodResponseInterceptor<T> implements NestInterceptor<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<T> {
    return next.handle().pipe(map((value) => this.schema.parse(value)));
  }
}

const openApiSchema = (schema: ZodType): SchemaObject => {
  const document = z.toJSONSchema(schema, {
    target: 'draft-7',
  }) as Record<string, unknown>;
  delete document.$schema;
  return document as SchemaObject;
};

export const ContractBody = (schema: ZodType): MethodDecorator =>
  ApiBody({ schema: openApiSchema(schema) });

export const ContractResponse = <T>(schema: ZodType<T>): MethodDecorator =>
  applyDecorators(
    ApiResponse({ status: '2XX', schema: openApiSchema(schema) }),
    UseInterceptors(new ZodResponseInterceptor(schema)),
  );
