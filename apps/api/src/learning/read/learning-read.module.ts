import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../../security/security-foundation.module';
import {
  LEARNING_READ_CLOCK,
  systemLearningReadClock,
} from './learning-read.constants';
import { LearningReadService } from './learning-read.service';

@Module({
  imports: [SecurityFoundationModule],
  providers: [
    LearningReadService,
    { provide: LEARNING_READ_CLOCK, useValue: systemLearningReadClock },
  ],
  exports: [LearningReadService],
})
export class LearningReadModule {}
