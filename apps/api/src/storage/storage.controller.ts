import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { LearningAttachmentUpload } from '@edupay/contracts';
import {
  learningAttachmentUploadSchema,
  storagePolicySchema,
  storageUsageSchema,
  storageFileSchema,
} from '@edupay/contracts';
import type { Response } from 'express';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractBody, ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import type { AcademicRequestContext } from '../academic/academic-context';
import { StorageService } from './storage.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Storage')
@Controller()
@RequireCapabilities(TenantCapability.AccessTenant)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('storage/usage')
  @ContractResponse(storageUsageSchema)
  usage(): Promise<object> {
    return this.storage.getUsage(this.context());
  }

  @Get('storage/policy')
  @ContractResponse(storagePolicySchema)
  policy(): Promise<object> {
    return this.storage.getPolicy(this.context());
  }

  @Post('learning-items/:learningItemId/attachments')
  @ContractBody(learningAttachmentUploadSchema)
  @ContractResponse(storageFileSchema)
  attach(
    @Param('learningItemId', uuid) learningItemId: string,
    @Body(new ZodValidationPipe(learningAttachmentUploadSchema))
    input: LearningAttachmentUpload,
  ): Promise<object> {
    return this.storage.attachLearningFile(
      this.context(),
      learningItemId,
      input.purpose,
      input,
    );
  }

  @Get('learning-items/:learningItemId/attachments')
  @ContractResponse(storageFileSchema.array())
  attachments(
    @Param('learningItemId', uuid) learningItemId: string,
  ): Promise<object[]> {
    return this.storage.listLearningAttachments(this.context(), learningItemId);
  }

  @Get('files/:fileObjectId/download')
  async download(
    @Param('fileObjectId', uuid) fileObjectId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.storage.download(this.context(), fileObjectId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    if (Buffer.isBuffer(file.body)) {
      response.send(file.body);
      return;
    }
    file.body.pipe(response);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}
