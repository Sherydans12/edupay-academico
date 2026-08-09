import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { ApiErrorDetail, ApiErrorEnvelope } from '@edupay/contracts';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = this.status(exception);
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const body: ApiErrorEnvelope = {
      error: {
        code: this.errorCode(status, exception),
        details: this.errorDetails(exceptionResponse),
        message: this.safeMessage(status, exceptionResponse, exception),
        requestId: request.requestId ?? 'unavailable',
      },
    };

    response.status(status).json(body);
  }

  private errorCode(status: number, exception: unknown): string {
    if (this.isMultipartLimit(exception)) return 'FILE_TOO_LARGE';
    const codes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'FILE_TOO_LARGE',
      [HttpStatus.UNAUTHORIZED]: 'TOKEN_INVALID',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
    };

    return codes[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  private errorDetails(
    exceptionResponse: string | object | undefined,
  ): ApiErrorDetail[] {
    if (
      typeof exceptionResponse !== 'object' ||
      exceptionResponse === null ||
      !('message' in exceptionResponse) ||
      !Array.isArray(exceptionResponse.message)
    ) {
      return [];
    }

    return exceptionResponse.message
      .filter((message): message is string => typeof message === 'string')
      .map((message) => ({ message }));
  }

  private safeMessage(
    status: number,
    exceptionResponse: string | object | undefined,
    exception: unknown,
  ): string {
    if (this.isMultipartLimit(exception) || status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return 'The file is too large.';
    }
    if (status >= 500) {
      return 'The request could not be completed.';
    }

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      'message' in exceptionResponse &&
      typeof exceptionResponse.message === 'string'
    ) {
      return exceptionResponse.message;
    }

    return 'The request could not be completed.';
  }

  private status(exception: unknown): number {
    if (this.isMultipartLimit(exception)) return HttpStatus.BAD_REQUEST;
    return exception instanceof HttpException ? exception.getStatus() : 500;
  }

  private isMultipartLimit(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code?: unknown }).code === 'LIMIT_FILE_SIZE'
    );
  }
}
