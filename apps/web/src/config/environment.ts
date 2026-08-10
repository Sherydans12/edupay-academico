import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .refine((value) => new URL(value).pathname.endsWith('/api/v1'), {
      message: 'must point to the versioned /api/v1 API base path',
    }),
  NEXT_PUBLIC_IDENTITY_BASE_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.pathname === '/' && !url.search && !url.hash;
    }, {
      message: 'must be an origin without a path, query, or fragment',
    })
    .transform((value) => value.replace(/\/$/, '')),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') return;

  for (const key of ['NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_IDENTITY_BASE_URL'] as const) {
    if (new URL(environment[key]).protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'must use HTTPS in production',
        path: [key],
      });
    }
  }
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
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_IDENTITY_BASE_URL: process.env.NEXT_PUBLIC_IDENTITY_BASE_URL,
  });
}
