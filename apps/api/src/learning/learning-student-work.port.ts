import { Injectable } from '@nestjs/common';

export const LEARNING_STUDENT_WORK_PORT = Symbol('LEARNING_STUDENT_WORK_PORT');

export interface LearningStudentWorkPort {
  hasStudentWork(input: {
    tenantId: string;
    learningItemId: string;
  }): Promise<boolean>;
}

/**
 * Submission is a later bounded context. Until it is installed, Learning has
 * no submission persistence to inspect; the port keeps that dependency
 * explicit without inventing submission records or storage behavior.
 */
@Injectable()
export class NoSubmissionStudentWorkPort implements LearningStudentWorkPort {
  hasStudentWork(input: {
    tenantId: string;
    learningItemId: string;
  }): Promise<boolean> {
    void input;
    return Promise.resolve(false);
  }
}
