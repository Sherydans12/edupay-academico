import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function correlationIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const candidate = request.header('x-request-id');
  const requestId =
    candidate && SAFE_CORRELATION_ID.test(candidate) ? candidate : randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
