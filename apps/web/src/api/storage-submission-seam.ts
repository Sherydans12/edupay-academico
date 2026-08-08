/**
 * UI-only seam for the Storage/Submission bounded context.
 *
 * The Learning frontend does not invent payloads or persistence for this
 * context. The parallel integration can provide these operations once its
 * reviewed contracts are available.
 */
export const STORAGE_SUBMISSION_SEAM_STATE = 'NOT_CONNECTED' as const;

export interface StorageSubmissionAdapter {
  readonly state: typeof STORAGE_SUBMISSION_SEAM_STATE;
  getAssignmentAttachments: (learningItemId: string) => Promise<unknown>;
  uploadStudentWork: (input: unknown) => Promise<unknown>;
  getSubmissionHistory: (learningItemId: string) => Promise<unknown>;
  reviewSubmission: (input: unknown) => Promise<unknown>;
}
