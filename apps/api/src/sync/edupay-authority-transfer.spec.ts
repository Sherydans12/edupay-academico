import { describe, expect, it } from 'vitest';

import {
  AuthorityTransferUsageError,
  parseAuthorityTransferArguments,
} from './edupay-authority-transfer';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('parseAuthorityTransferArguments', () => {
  it('defaults to a dry run for one canonical tenant', () => {
    expect(
      parseAuthorityTransferArguments(['--tenant-id', TENANT_ID.toUpperCase()]),
    ).toEqual({ tenantId: TENANT_ID, apply: false, expected: null });
  });

  it('applies only with the three counts confirmed from the dry run', () => {
    expect(
      parseAuthorityTransferArguments([
        '--tenant-id',
        TENANT_ID,
        '--apply',
        '--expect-students',
        '252',
        '--expect-courses',
        '13',
        '--expect-enrollments',
        '242',
      ]),
    ).toEqual({
      tenantId: TENANT_ID,
      apply: true,
      expected: { students: 252, courses: 13, enrollments: 242 },
    });
  });

  it.each([
    [[]],
    [['--tenant-id', 'colegio-conquistadores']],
    [['--tenant-id', TENANT_ID, '--apply']],
    [
      [
        '--tenant-id',
        TENANT_ID,
        '--apply',
        '--expect-students',
        '1',
        '--expect-courses',
        '1',
      ],
    ],
    [['--tenant-id', TENANT_ID, '--expect-students', '1']],
    [
      [
        '--tenant-id',
        TENANT_ID,
        '--apply',
        '--expect-students',
        '-1',
        '--expect-courses',
        '1',
        '--expect-enrollments',
        '1',
      ],
    ],
    [['--tenant-id', TENANT_ID, '--tenant-id', TENANT_ID]],
    [['--tenant-id', TENANT_ID, '--force']],
  ])('rejects unsafe or ambiguous arguments %j', (args) => {
    expect(() => parseAuthorityTransferArguments(args)).toThrow(
      AuthorityTransferUsageError,
    );
  });
});
