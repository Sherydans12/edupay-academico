import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createReviewSchema,
  createSubmissionSchema,
  createSubmissionRevisionSchema,
  submissionSchema,
} from '@edupay/contracts';
import type {
  CreateReview,
  CreateSubmission,
  CreateSubmissionRevision,
} from '@edupay/contracts';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractBody, ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import type { AcademicRequestContext } from '../academic/academic-context';
import { SubmissionService } from './submission.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Student submissions')
@Controller()
@RequireCapabilities(TenantCapability.AccessTenant)
export class SubmissionController {
  constructor(
    private readonly submissions: SubmissionService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Post('learning-items/:learningItemId/submission')
  @ContractBody(createSubmissionSchema)
  @ContractResponse(submissionSchema)
  submit(
    @Param('learningItemId', uuid) learningItemId: string,
    @Body(new ZodValidationPipe(createSubmissionSchema)) input: CreateSubmission,
  ): Promise<object> {
    return this.submissions.submit(this.context(), learningItemId, input);
  }

  @Post('submissions/:submissionId/revisions')
  @ContractBody(createSubmissionRevisionSchema)
  @ContractResponse(submissionSchema)
  revision(
    @Param('submissionId', uuid) submissionId: string,
    @Body(new ZodValidationPipe(createSubmissionRevisionSchema))
    input: CreateSubmissionRevision,
  ): Promise<object> {
    return this.submissions.submitRevision(this.context(), submissionId, input);
  }

  @Get('learning-items/:learningItemId/submission')
  @ContractResponse(submissionSchema)
  ownSubmission(@Param('learningItemId', uuid) learningItemId: string): Promise<object> {
    return this.submissions.getByLearningItem(this.context(), learningItemId);
  }

  @Get('submissions/:submissionId')
  @ContractResponse(submissionSchema)
  detail(@Param('submissionId', uuid) submissionId: string): Promise<object> {
    return this.submissions.getById(this.context(), submissionId);
  }

  @Get('learning-items/:learningItemId/submissions')
  @ContractResponse(submissionSchema.array())
  teacherList(@Param('learningItemId', uuid) learningItemId: string): Promise<object[]> {
    return this.submissions.listForTeacher(this.context(), learningItemId);
  }

  @Post('submission-revisions/:revisionId/reviews')
  @ContractBody(createReviewSchema)
  @ContractResponse(submissionSchema)
  review(
    @Param('revisionId', uuid) revisionId: string,
    @Body(new ZodValidationPipe(createReviewSchema)) input: CreateReview,
  ): Promise<object> {
    return this.submissions.review(this.context(), revisionId, input);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}
