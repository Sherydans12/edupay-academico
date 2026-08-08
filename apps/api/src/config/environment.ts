import { z } from 'zod';

const postgresUrl = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'postgresql:' || protocol === 'postgres:';
    } catch {
      return false;
    }
  },
  { message: 'must be a PostgreSQL connection URL' },
);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: postgresUrl,
    IDENTITY_ISSUER: z.string().url(),
    IDENTITY_AUDIENCE: z.string().min(1),
    IDENTITY_JWKS_URI: z.string().url(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') {
      return;
    }

    for (const key of ['IDENTITY_ISSUER', 'IDENTITY_JWKS_URI'] as const) {
      if (new URL(environment[key]).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: 'must use HTTPS in production',
          path: [key],
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  environment: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }

  return result.data;
}
