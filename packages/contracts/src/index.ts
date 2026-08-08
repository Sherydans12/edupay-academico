import { z } from 'zod';

export * from './academic';
export * from './learning';
export * from './storage';
export * from './submissions';

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
