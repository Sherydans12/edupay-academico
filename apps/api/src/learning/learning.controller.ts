import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  courseSubjectLearningRouteSchema,
  createLearningItemSchema,
  createLearningUnitSchema,
  learningItemSchema,
  learningUnitSchema,
  reorderLearningSchema,
  scheduleLearningItemSchema,
  updateLearningItemSchema,
  updateLearningUnitSchema,
  type CreateLearningItem,
  type CreateLearningUnit,
  type ReorderLearning,
  type ScheduleLearningItem,
  type UpdateLearningItem,
  type UpdateLearningUnit,
} from '@edupay/contracts';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import {
  ContractBody,
  ContractResponse,
} from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import type { AcademicRequestContext } from '../academic/academic-context';
import { LearningService } from './learning.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Learning content administration')
@Controller()
@RequireCapabilities(TenantCapability.ManageLearningContent)
export class LearningManagementController {
  constructor(
    private readonly learning: LearningService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Post('learning-units')
  @ContractBody(createLearningUnitSchema)
  @ContractResponse(learningUnitSchema)
  createUnit(
    @Body(new ZodValidationPipe(createLearningUnitSchema))
    input: CreateLearningUnit,
  ): Promise<object> {
    return this.learning.createUnit(this.context(), input);
  }

  @Patch('learning-units/:id')
  @ContractBody(updateLearningUnitSchema)
  @ContractResponse(learningUnitSchema)
  updateUnit(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateLearningUnitSchema))
    input: UpdateLearningUnit,
  ): Promise<object> {
    return this.learning.updateUnit(this.context(), id, input);
  }

  @Post('learning-units/:id/archive')
  @ContractResponse(learningUnitSchema)
  archiveUnit(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.archiveUnit(this.context(), id);
  }

  @Post('course-subjects/:courseSubjectId/learning-units/reorder')
  @ContractBody(reorderLearningSchema)
  @ContractResponse(learningUnitSchema.array())
  reorderUnits(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
    @Body(new ZodValidationPipe(reorderLearningSchema)) input: ReorderLearning,
  ): Promise<object[]> {
    return this.learning.reorderUnits(this.context(), courseSubjectId, input);
  }

  @Post('learning-units/:learningUnitId/items')
  @ContractBody(createLearningItemSchema)
  @ContractResponse(learningItemSchema)
  createItem(
    @Param('learningUnitId', uuid) learningUnitId: string,
    @Body(new ZodValidationPipe(createLearningItemSchema))
    input: CreateLearningItem,
  ): Promise<object> {
    return this.learning.createItem(this.context(), learningUnitId, input);
  }

  @Patch('learning-items/:id')
  @ContractBody(updateLearningItemSchema)
  @ContractResponse(learningItemSchema)
  updateItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateLearningItemSchema))
    input: UpdateLearningItem,
  ): Promise<object> {
    return this.learning.updateItem(this.context(), id, input);
  }

  @Post('learning-items/:id/schedule')
  @ContractBody(scheduleLearningItemSchema)
  @ContractResponse(learningItemSchema)
  scheduleItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(scheduleLearningItemSchema))
    input: ScheduleLearningItem,
  ): Promise<object> {
    return this.learning.scheduleItem(this.context(), id, input);
  }

  @Post('learning-items/:id/publish')
  @ContractResponse(learningItemSchema)
  publishItem(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.publishItem(this.context(), id);
  }

  @Post('learning-items/:id/archive')
  @ContractResponse(learningItemSchema)
  archiveItem(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.archiveItem(this.context(), id);
  }

  @Post('learning-units/:learningUnitId/items/reorder')
  @ContractBody(reorderLearningSchema)
  @ContractResponse(learningItemSchema.array())
  reorderItems(
    @Param('learningUnitId', uuid) learningUnitId: string,
    @Body(new ZodValidationPipe(reorderLearningSchema)) input: ReorderLearning,
  ): Promise<object[]> {
    return this.learning.reorderItems(this.context(), learningUnitId, input);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}

@ApiTags('Learning content')
@Controller()
@RequireCapabilities(TenantCapability.AccessTenant)
export class LearningReadController {
  constructor(
    private readonly learning: LearningService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('course-subjects/:courseSubjectId/learning')
  @ContractResponse(courseSubjectLearningRouteSchema)
  learningRoute(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
  ): Promise<object> {
    return this.learning.learningRoute(this.context(), courseSubjectId);
  }

  @Get('course-subjects/:courseSubjectId/learning-units')
  @ContractResponse(learningUnitSchema.array())
  listUnits(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
  ): Promise<object[]> {
    return this.learning.listUnits(this.context(), courseSubjectId);
  }

  @Get('learning-units/:id')
  @ContractResponse(learningUnitSchema)
  unit(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.getUnit(this.context(), id);
  }

  @Get('learning-units/:learningUnitId/items')
  @ContractResponse(learningItemSchema.array())
  listItems(
    @Param('learningUnitId', uuid) learningUnitId: string,
  ): Promise<object[]> {
    return this.learning.listItems(this.context(), learningUnitId);
  }

  @Get('learning-items/:id')
  @ContractResponse(learningItemSchema)
  item(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.getItem(this.context(), id);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}
