import {
  admitStudentSchema,
  canonicalStudentNationalId,
  isValidRun,
  normalizeStudentNationalId,
  runCheckDigit,
  studentAdmissionResultSchema,
  studentNationalIdLookupSchema,
} from '@edupay/contracts';
import { describe, expect, it } from 'vitest';

// Synthetic sequential identifiers only; none is taken from a real roster.
describe('student national identifier (ADR-0024)', () => {
  it('computes the RUN check digit including 0 and K', () => {
    expect(runCheckDigit('11111111')).toBe('1');
    expect(runCheckDigit('22222222')).toBe('2');
    expect(runCheckDigit('10000004')).toBe('0');
    expect(runCheckDigit('10000013')).toBe('K');
  });

  it('normalizes formatting before validating a RUN', () => {
    expect(normalizeStudentNationalId(' 11.111.111-1 ')).toBe('111111111');
    expect(normalizeStudentNationalId('10.000.013-k')).toBe('10000013K');
    expect(isValidRun('111111111')).toBe(true);
    expect(isValidRun('111111112')).toBe(false);
    expect(isValidRun('K')).toBe(false);
    expect(isValidRun('12A45678K')).toBe(false);
  });

  it('stores one canonical RUN regardless of dots, dash, case or leading zeros', () => {
    const canonical = canonicalStudentNationalId('RUN', '11.111.111-1');
    expect(canonical).toBe('111111111');
    expect(canonicalStudentNationalId('RUN', '011111111-1')).toBe(canonical);
    expect(canonicalStudentNationalId('RUN', '10000013-k')).toBe('10000013K');
    expect(canonicalStudentNationalId('RUN', '11.111.111-2')).toBeNull();
    expect(canonicalStudentNationalId('RUN', '')).toBeNull();
  });

  it('accepts alphanumeric IPE values without assuming an official structure', () => {
    expect(canonicalStudentNationalId('IPE', ' ab-12.34 ')).toBe('AB1234');
    expect(canonicalStudentNationalId('IPE', 'AB_12')).toBeNull();
    expect(canonicalStudentNationalId('IPE', 'X'.repeat(21))).toBeNull();
  });

  it('rejects an admission with an invalid identifier before reaching the API', () => {
    const base = {
      nationalIdType: 'RUN' as const,
      firstName: 'Alumna',
      lastName: 'Sintética',
      courseId: '00000000-0000-4000-8000-000000000001',
    };
    expect(
      admitStudentSchema.safeParse({ ...base, nationalId: '11.111.111-1' })
        .success,
    ).toBe(true);
    const invalid = admitStudentSchema.safeParse({
      ...base,
      nationalId: '11.111.111-2',
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.path).toEqual(['nationalId']);
    expect(
      admitStudentSchema.safeParse({
        ...base,
        nationalId: '11.111.111-1',
        tenantId: 'tenant-b',
      }).success,
    ).toBe(false);
    expect(
      studentNationalIdLookupSchema.safeParse({
        nationalIdType: 'IPE',
        nationalId: 'AB_12',
      }).success,
    ).toBe(false);
  });

  it('never returns the identifier value in the persisted admission result', () => {
    expect(Object.keys(studentAdmissionResultSchema.shape)).not.toContain(
      'nationalId',
    );
  });
});
