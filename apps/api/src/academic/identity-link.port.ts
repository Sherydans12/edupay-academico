import { ServiceUnavailableException } from '@nestjs/common';

import type { AcademicRequestContext } from './academic-context';

export const ACADEMIC_IDENTITY_LINK_VERIFIER = Symbol(
  'ACADEMIC_IDENTITY_LINK_VERIFIER',
);

export interface AcademicIdentityLinkRequest {
  readonly academicRecordId: string;
  readonly academicRecordType: 'STUDENT' | 'TEACHER';
  readonly context: AcademicRequestContext;
  readonly identityUserId: string;
}

export interface AcademicIdentityLinkVerifier {
  verifyExactLink(request: AcademicIdentityLinkRequest): Promise<void>;
}

/** Fails closed until the restricted Identity resolve transport is configured. */
export class UnconfiguredAcademicIdentityLinkVerifier implements AcademicIdentityLinkVerifier {
  verifyExactLink(): Promise<void> {
    throw new ServiceUnavailableException(
      'Academic identity linking is not configured.',
    );
  }
}
