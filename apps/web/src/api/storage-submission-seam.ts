/**
 * Compatibility marker for the Learning surfaces that used the original
 * placeholder seam. The concrete operations now live on AcademicApiClient
 * and are validated against the shared contracts.
 */
export const STORAGE_SUBMISSION_SEAM_STATE = 'CONNECTED' as const;

export interface StorageSubmissionAdapter {
  readonly state: typeof STORAGE_SUBMISSION_SEAM_STATE;
  getAssignmentAttachments: (learningItemId: string) => Promise<unknown>;
  uploadStudentWork: (input: unknown) => Promise<unknown>;
  getSubmissionHistory: (learningItemId: string) => Promise<unknown>;
  reviewSubmission: (input: unknown) => Promise<unknown>;
}
