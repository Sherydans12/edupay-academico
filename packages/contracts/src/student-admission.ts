import { z } from 'zod';

import { courseEnrollmentSchema, studentSchema } from './academic.js';

/**
 * Stable student identifier types accepted by ADR-0024: the Chilean RUN, or
 * the provisional school identifier (IPE) for students who do not have a RUN.
 */
export const studentNationalIdTypeSchema = z.enum(['RUN', 'IPE']);
export type StudentNationalIdType = z.infer<typeof studentNationalIdTypeSchema>;

const NATIONAL_ID_MAX_LENGTH = 20;

/** Removes formatting characters and upper-cases a raw identifier. */
export function normalizeStudentNationalId(raw: string): string {
  return raw.replace(/[\s.\-]/g, '').toUpperCase();
}

/** Computes the RUN check digit (modulo 11) for a numeric body. */
export function runCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

/** Validates a normalized RUN (body digits followed by its check digit). */
export function isValidRun(normalized: string): boolean {
  const withoutLeadingZeros = normalized.replace(/^0+/, '');
  if (!/^\d{1,8}[0-9K]$/.test(withoutLeadingZeros)) return false;
  const body = withoutLeadingZeros.slice(0, -1);
  return runCheckDigit(body) === withoutLeadingZeros.slice(-1);
}

/**
 * Normalized identifier for storage and uniqueness, or null when invalid.
 * RUN: leading zeros removed and check digit validated.
 * IPE: alphanumeric only. Its official format is pending (ADR-0024), so no
 * further structure is assumed here.
 */
export function canonicalStudentNationalId(
  type: StudentNationalIdType,
  raw: string,
): string | null {
  const normalized = normalizeStudentNationalId(raw);
  if (normalized.length === 0 || normalized.length > NATIONAL_ID_MAX_LENGTH) {
    return null;
  }
  if (type === 'RUN') {
    if (!isValidRun(normalized)) return null;
    return normalized.replace(/^0+/, '');
  }
  return /^[0-9A-Z]+$/.test(normalized) ? normalized : null;
}

const nationalIdInputSchema = z.string().trim().min(1).max(32);

const studentNationalIdFields = {
  nationalIdType: studentNationalIdTypeSchema,
  nationalId: nationalIdInputSchema,
} as const;

function refineNationalId(
  value: { nationalIdType: StudentNationalIdType; nationalId: string },
  context: z.RefinementCtx,
) {
  if (
    canonicalStudentNationalId(value.nationalIdType, value.nationalId) === null
  ) {
    context.addIssue({
      code: 'custom',
      message:
        value.nationalIdType === 'RUN'
          ? 'The RUN is not valid'
          : 'The IPE must contain only letters and digits',
      path: ['nationalId'],
    });
  }
}

/** Creates a student record and its MANUAL enrollment in one command. */
export const admitStudentSchema = z
  .object({
    ...studentNationalIdFields,
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.email().max(320).optional(),
    courseId: z.string().uuid(),
  })
  .strict()
  .superRefine(refineNationalId);
export type AdmitStudent = z.infer<typeof admitStudentSchema>;

/**
 * The identifier value is intentionally absent: command receipts persist this
 * response for idempotent replay, and the RUN/IPE must not be copied there.
 */
export const studentAdmissionResultSchema = z
  .object({
    student: studentSchema,
    enrollment: courseEnrollmentSchema,
    nationalIdType: studentNationalIdTypeSchema,
  })
  .strict();
export type StudentAdmissionResult = z.infer<
  typeof studentAdmissionResultSchema
>;

/** Looks up an existing record by identifier (sent in the body, never the URL). */
export const studentNationalIdLookupSchema = z
  .object(studentNationalIdFields)
  .strict()
  .superRefine(refineNationalId);
export type StudentNationalIdLookup = z.infer<
  typeof studentNationalIdLookupSchema
>;

export const studentNationalIdLookupResultSchema = z
  .object({ student: studentSchema.nullable() })
  .strict();
export type StudentNationalIdLookupResult = z.infer<
  typeof studentNationalIdLookupResultSchema
>;

/** Stable error code when the identifier already belongs to a record. */
export const STUDENT_NATIONAL_ID_EXISTS = 'STUDENT_NATIONAL_ID_EXISTS';
