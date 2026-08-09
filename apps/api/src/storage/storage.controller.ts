import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  NestInterceptor,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  createUploadIntentSchema,
  storageFileSchema,
  storagePolicySchema,
  storageUsageSchema,
  uploadIntentSchema,
} from '@edupay/contracts';
import type { CreateUploadIntent } from '@edupay/contracts';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Response } from 'express';
import { catchError, defer, type Observable } from 'rxjs';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractBody, ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import type { AcademicRequestContext } from '../academic/academic-context';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { StorageService } from './storage.service';
import { MAX_FILE_SIZE_BYTES } from './file-validation';

const uuid = new ParseUUIDPipe({ version: '4' });
const multipartTempRoot =
  process.env.STORAGE_TEMP_ROOT ??
  join(process.env.STORAGE_ROOT ?? join(process.cwd(), 'var', 'private-storage'), 'tmp');
const boundedMultipart = FileInterceptor('file', {
  dest: multipartTempRoot,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 0,
  },
});

type MultipartFile = {
  readonly path: string;
  readonly originalname: string;
  readonly mimetype: string;
};

@Injectable()
export class BoundedMultipartUploadInterceptor implements NestInterceptor {
  private readonly multerInterceptor: NestInterceptor;

  constructor(
    private readonly storage: StorageService,
    private readonly current: CurrentRequestContext,
  ) {
    const Interceptor = boundedMultipart;
    this.multerInterceptor = new Interceptor();
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      const delegated = await this.multerInterceptor.intercept(context, next);
      return delegated.pipe(
        catchError((error: unknown) =>
          defer(async () => {
            try {
              await this.releaseFailedIntent(context);
            } finally {
              throw error;
            }
          }),
        ),
      );
    } catch (error) {
      await this.releaseFailedIntent(context);
      throw error;
    }
  }

  private async releaseFailedIntent(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<{
      params?: { intentId?: string };
    }>();
    const intentId = request.params?.intentId;
    if (intentId) await this.storage.releaseFailedUploadIntent(this.context(), intentId);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}

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

  @Post('file-upload-intents')
  @ContractBody(createUploadIntentSchema)
  @ContractResponse(uploadIntentSchema)
  createIntent(
    @Body(new ZodValidationPipe(createUploadIntentSchema)) input: CreateUploadIntent,
  ): Promise<object> {
    return this.storage.createUploadIntent(this.context(), input);
  }

  @Post('file-upload-intents/:intentId/content')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(BoundedMultipartUploadInterceptor)
  @ContractResponse(storageFileSchema)
  async completeIntent(
    @Param('intentId', uuid) intentId: string,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('A single multipart file is required.');
    }
    try {
      return await this.storage.completeUpload(this.context(), intentId, {
        filePath: file.path,
        filename: file.originalname,
        mimeType: file.mimetype,
      });
    } finally {
      await rm(file.path, { force: true });
    }
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
