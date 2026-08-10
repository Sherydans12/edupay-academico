import { z } from 'zod';

export * from './academic.js';
export * from './learning.js';
export * from './notifications.js';
export * from './storage.js';
export * from './submissions.js';

export const apiErrorDetailSchema = z
  .object({
    field: z.string().optional(),
    message: z.string(),
  })
  .strict();

export const apiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.array(apiErrorDetailSchema),
        requestId: z.string(),
      })
      .strict(),
  })
  .strict();

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
