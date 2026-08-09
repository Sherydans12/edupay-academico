import { z } from 'zod';

const asymmetricJwtAlgorithms = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const;

const jwtAlgorithms = z
  .string()
  .default('RS256')
  .transform((value, context) => {
    const algorithms = [
      ...new Set(value.split(',').map((item) => item.trim())),
    ].filter((item) => item.length > 0);
    const invalid = algorithms.filter(
      (algorithm) =>
        !asymmetricJwtAlgorithms.includes(
          algorithm as (typeof asymmetricJwtAlgorithms)[number],
        ),
    );

    if (algorithms.length === 0 || invalid.length > 0) {
      context.addIssue({
        code: 'custom',
        message: `must contain only approved asymmetric algorithms: ${asymmetricJwtAlgorithms.join(', ')}`,
      });
      return z.NEVER;
    }

    return algorithms as (typeof asymmetricJwtAlgorithms)[number][];
  });

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

const optionalStorageNumber = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().optional(),
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
    IDENTITY_JWT_ALGORITHMS: jwtAlgorithms,
    IDENTITY_CLOCK_SKEW_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(120)
      .default(30),
    IDENTITY_JWKS_CACHE_MAX_AGE_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .default(300_000),
    IDENTITY_JWKS_COOLDOWN_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    IDENTITY_JWKS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),
    STORAGE_ROOT: z.string().min(1).optional(),
    STORAGE_MIN_FREE_BYTES: optionalStorageNumber.pipe(z.number().int().min(0).optional()),
    STORAGE_MIN_FREE_PERCENTAGE: optionalStorageNumber.pipe(z.number().min(0).max(100).optional()),
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
    for (const key of [
      'STORAGE_MIN_FREE_BYTES',
      'STORAGE_MIN_FREE_PERCENTAGE',
    ] as const) {
      if (environment[key] === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'must be configured in production',
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
