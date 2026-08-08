import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module';
import { SecurityFoundationModule } from '../security/security-foundation.module';
import {
  LEARNING_STUDENT_WORK_PORT,
  NoSubmissionStudentWorkPort,
} from './learning-student-work.port';
import {
  LearningManagementController,
  LearningReadController,
} from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [SecurityFoundationModule, AcademicModule],
  controllers: [LearningManagementController, LearningReadController],
  providers: [
    LearningService,
    {
      provide: LEARNING_STUDENT_WORK_PORT,
      useClass: NoSubmissionStudentWorkPort,
    },
  ],
  exports: [LearningService],
})
export class LearningModule {}
