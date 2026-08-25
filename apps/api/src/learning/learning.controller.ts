import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  contentRevisionSchema,
  courseSubjectLearningRouteSchema,
  createLearningItemSchema,
  createLearningUnitSchema,
  duplicateLearningItemSchema,
  duplicateLearningUnitSchema,
  learningItemDraftSchema,
  learningItemSchema,
  learningUnitSchema,
  moveLearningItemSchema,
  publishLearningItemDraftSchema,
  reorderLearningSchema,
  restoreRevisionSchema,
  saveLearningItemDraftSchema,
  scheduleLearningItemSchema,
  updateLearningItemSchema,
  updateLearningUnitSchema,
  studentCourseSubjectLearningRouteSchema,
  teacherCourseSubjectLearningRouteSchema,
  teacherLearnerPreviewQuerySchema,
  type LearningReadAudience,
  type TeacherLearnerPreviewQuery,
  type CreateLearningItem,
  type CreateLearningUnit,
  type DuplicateLearningItem,
  type DuplicateLearningUnit,
  type MoveLearningItem,
  type PublishLearningItemDraft,
  type ReorderLearning,
  type RestoreRevision,
  type SaveLearningItemDraft,
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
import { RequireTenantContext } from '../tenant/require-tenant-context.decorator';
import type { AcademicRequestContext } from '../academic/academic-context';
import { LearningService } from './learning.service';
import { LearningReadService } from './read/learning-read.service';

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
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.createUnit(
      this.context(idempotencyKey ?? xIdempotencyKey),
      input,
    );
  }

  @Patch('learning-units/:id')
  @ContractBody(updateLearningUnitSchema)
  @ContractResponse(learningUnitSchema)
  updateUnit(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateLearningUnitSchema))
    input: UpdateLearningUnit,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.updateUnit(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('learning-units/:id/archive')
  @ContractResponse(learningUnitSchema)
  archiveUnit(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.archiveUnit(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-units/:id/restore')
  @ContractResponse(learningUnitSchema)
  restoreArchivedUnit(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.restoreArchivedUnit(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-units/:id/duplicate')
  @ContractBody(duplicateLearningUnitSchema)
  @ContractResponse(learningUnitSchema)
  duplicateUnit(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(duplicateLearningUnitSchema))
    input?: DuplicateLearningUnit,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.duplicateUnit(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('course-subjects/:courseSubjectId/learning-units/reorder')
  @ContractBody(reorderLearningSchema)
  @ContractResponse(learningUnitSchema.array())
  reorderUnits(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
    @Body(new ZodValidationPipe(reorderLearningSchema)) input: ReorderLearning,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object[]> {
    return this.learning.reorderUnits(
      this.context(idempotencyKey ?? xIdempotencyKey),
      courseSubjectId,
      input,
    );
  }

  @Post('learning-units/:learningUnitId/items')
  @ContractBody(createLearningItemSchema)
  @ContractResponse(learningItemSchema)
  createItem(
    @Param('learningUnitId', uuid) learningUnitId: string,
    @Body(new ZodValidationPipe(createLearningItemSchema))
    input: CreateLearningItem,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.createItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      learningUnitId,
      input,
    );
  }

  @Patch('learning-items/:id')
  @ContractBody(updateLearningItemSchema)
  @ContractResponse(learningItemSchema)
  updateItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateLearningItemSchema))
    input: UpdateLearningItem,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.updateItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('learning-items/:id/schedule')
  @ContractBody(scheduleLearningItemSchema)
  @ContractResponse(learningItemSchema)
  scheduleItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(scheduleLearningItemSchema))
    input: ScheduleLearningItem,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.scheduleItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('learning-items/:id/publish')
  @ContractResponse(learningItemSchema)
  publishItem(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.publishItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-items/:id/unpublish')
  @ContractResponse(learningItemSchema)
  unpublishItem(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.unpublishItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-items/:id/archive')
  @ContractResponse(learningItemSchema)
  archiveItem(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.archiveItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-items/:id/restore')
  @ContractResponse(learningItemSchema)
  restoreArchivedItem(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.restoreArchivedItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-items/:id/move')
  @ContractBody(moveLearningItemSchema)
  @ContractResponse(learningItemSchema)
  moveItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(moveLearningItemSchema))
    input: MoveLearningItem,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.moveItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('learning-items/:id/duplicate')
  @ContractBody(duplicateLearningItemSchema)
  @ContractResponse(learningItemSchema)
  duplicateItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(duplicateLearningItemSchema))
    input?: DuplicateLearningItem,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.duplicateItem(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Post('learning-units/:learningUnitId/items/reorder')
  @ContractBody(reorderLearningSchema)
  @ContractResponse(learningItemSchema.array())
  reorderItems(
    @Param('learningUnitId', uuid) learningUnitId: string,
    @Body(new ZodValidationPipe(reorderLearningSchema)) input: ReorderLearning,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object[]> {
    return this.learning.reorderItems(
      this.context(idempotencyKey ?? xIdempotencyKey),
      learningUnitId,
      input,
    );
  }

  @Post('learning-items/:id/draft')
  @ContractBody(saveLearningItemDraftSchema)
  @ContractResponse(learningItemDraftSchema)
  saveDraft(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(saveLearningItemDraftSchema))
    input: SaveLearningItemDraft,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.saveDraft(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Get('learning-items/:id/draft')
  @ContractResponse(
    z.object({ draft: learningItemDraftSchema.nullable() }).strict(),
  )
  getDraft(@Param('id', uuid) id: string): Promise<object> {
    return this.learning.getDraft(this.context(), id);
  }

  @Delete('learning-items/:id/draft')
  @HttpCode(204)
  async discardDraft(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<void> {
    await this.learning.discardDraft(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
    );
  }

  @Post('learning-items/:id/draft/publish')
  @ContractBody(publishLearningItemDraftSchema)
  @ContractResponse(learningItemSchema)
  publishDraft(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(publishLearningItemDraftSchema))
    input: PublishLearningItemDraft,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.publishDraft(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      input,
    );
  }

  @Get('learning-units/:id/history')
  @ContractResponse(contentRevisionSchema.array())
  unitHistory(@Param('id', uuid) id: string): Promise<object[]> {
    return this.learning.listUnitHistory(this.context(), id);
  }

  @Get('learning-items/:id/history')
  @ContractResponse(contentRevisionSchema.array())
  itemHistory(@Param('id', uuid) id: string): Promise<object[]> {
    return this.learning.listItemHistory(this.context(), id);
  }

  @Post('learning-units/:id/history/:revisionNumber/restore')
  @ContractBody(restoreRevisionSchema)
  @ContractResponse(learningUnitSchema)
  restoreUnit(
    @Param('id', uuid) id: string,
    @Param('revisionNumber', new ParseIntPipe()) revisionNumber: number,
    @Body(new ZodValidationPipe(restoreRevisionSchema)) input: RestoreRevision,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.restoreUnitRevision(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      revisionNumber,
      input,
    );
  }

  @Post('learning-items/:id/history/:revisionNumber/restore')
  @ContractBody(restoreRevisionSchema)
  @ContractResponse(z.union([learningItemSchema, learningItemDraftSchema]))
  restoreItem(
    @Param('id', uuid) id: string,
    @Param('revisionNumber', new ParseIntPipe()) revisionNumber: number,
    @Body(new ZodValidationPipe(restoreRevisionSchema)) input: RestoreRevision,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<object> {
    return this.learning.restoreItemRevision(
      this.context(idempotencyKey ?? xIdempotencyKey),
      id,
      revisionNumber,
      input,
    );
  }

  private context(idempotencyKey?: string): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
  }
}

@ApiTags('Learning content')
@Controller()
@RequireTenantContext()
export class LearningReadController {
  constructor(
    private readonly learning: LearningService,
    private readonly learningRead: LearningReadService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('course-subjects/:courseSubjectId/learning')
  @ContractResponse(
    z.union([
      courseSubjectLearningRouteSchema,
      studentCourseSubjectLearningRouteSchema,
      teacherCourseSubjectLearningRouteSchema,
    ]),
  )
  learningRoute(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
  ): Promise<object> {
    const context = this.context();
    return this.learningRead.read(
      context,
      { audience: this.audience(context), courseSubjectId },
      () => this.learning.learningRoute(context, courseSubjectId),
    );
  }

  @Get('course-subjects/:courseSubjectId/learning/preview')
  @ContractResponse(studentCourseSubjectLearningRouteSchema)
  preview(
    @Param('courseSubjectId', uuid) courseSubjectId: string,
    @Query(new ZodValidationPipe(teacherLearnerPreviewQuerySchema))
    _query: TeacherLearnerPreviewQuery,
    @Body() body: unknown,
  ): Promise<object> {
    if (
      body !== undefined &&
      (typeof body !== 'object' ||
        body === null ||
        Object.keys(body as Record<string, unknown>).length > 0)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Preview does not accept request body fields.',
      });
    }
    return this.learningRead.read(this.context(), {
      audience: 'TEACHER_PREVIEW',
      courseSubjectId,
    });
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

  private audience(context: AcademicRequestContext): LearningReadAudience {
    if (
      context.principal.roles.includes('TENANT_ADMIN') ||
      context.principal.roles.includes('TEACHER') ||
      context.principal.roles.includes('SYSTEM_ADMIN')
    ) {
      return 'TEACHER_AUTHORING';
    }
    return 'STUDENT';
  }
}
