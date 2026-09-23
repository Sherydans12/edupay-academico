import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });

export const tenantOperationalProfileSchema = z
  .object({
    institutionDisplayName: z.string().min(1).max(240).nullable(),
    timeZone: z.string().min(1).max(80).nullable(),
    version: z.number().int().nonnegative(),
    updatedAt: timestamp.nullable(),
    complete: z.boolean(),
    missingFields: z
      .array(z.enum(['institutionDisplayName', 'timeZone']))
      .max(2),
  })
  .strict();

export const updateTenantOperationalProfileSchema = z
  .object({
    institutionDisplayName: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .nullable()
      .optional(),
    timeZone: z.string().trim().min(1).max(80).nullable().optional(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) =>
      value.institutionDisplayName !== undefined ||
      value.timeZone !== undefined,
    { message: 'At least one profile field is required.' },
  );

export type TenantOperationalProfile = z.infer<
  typeof tenantOperationalProfileSchema
>;
export type UpdateTenantOperationalProfile = z.infer<
  typeof updateTenantOperationalProfileSchema
>;
