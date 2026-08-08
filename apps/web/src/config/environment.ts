import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .refine((value) => new URL(value).pathname.endsWith('/api/v1'), {
      message: 'must point to the versioned /api/v1 API base path',
    }),
});

export type ClientEnvironment = z.infer<typeof clientEnvironmentSchema>;

export function validateClientEnvironment(
  environment: Record<string, string | undefined>,
): ClientEnvironment {
  const result = clientEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Client environment validation failed: ${details}`);
  }

  return result.data;
}

export function getClientEnvironment(): ClientEnvironment {
  return validateClientEnvironment({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}
