export interface LearningAttachmentTarget {
  readonly tenantId: string;
  readonly learningItemId: string;
  readonly purpose: 'LEARNING_MATERIAL' | 'ASSIGNMENT_SOURCE' | 'ASSESSMENT_SOURCE';
}

export const LEARNING_ATTACHMENT_PORT = Symbol('LEARNING_ATTACHMENT_PORT');

/**
 * Storage owns FileObject/FileReference persistence. Learning intentionally
 * exposes only this future integration seam and has no upload or file-path
 * fields in its MVP records.
 */
export interface LearningAttachmentPort {
  validateReference(target: LearningAttachmentTarget, fileReferenceId: string):
    | Promise<void>
    | void;
}
