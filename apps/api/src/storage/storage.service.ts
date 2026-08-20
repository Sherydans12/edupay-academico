import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Prisma } from '../generated/prisma/client';
import type {
  StorageCategory as PrismaStorageCategory,
} from '../generated/prisma/client';
import type { CreateUploadIntent } from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
import { TenantCapability } from '../authorization/authorization.types';
import type { AcademicRequestContext } from '../academic/academic-context';
import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../academic/academic-audit.port';
import { PrismaService } from '../persistence/prisma.service';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import {
  type LearningAttachmentTarget,
  type LearningAttachmentPort,
} from '../learning/learning-attachment.port';
import {
  COLEGIO_CONQUISTADORES_QUOTA_BYTES,
  GLOBAL_QUOTA_BYTES,
  MAX_FILE_SIZE_BYTES,
  FileValidationError,
  allowedExtensions,
  validateUploadFilePath,
  validateUploadMetadata,
  type ValidatedFile,
} from './file-validation';
import {
  PRIVATE_STORAGE_PROVIDER,
  type PrivateStorageProvider,
} from './private-storage.port';
import {
  MALWARE_SCANNER,
  type MalwareScanFailureReason,
  type MalwareScanner,
} from './malware-scanner.port';

const GLOBAL_SCOPE_KEY = 'GLOBAL';
const EXPIRY_MS = 15 * 60 * 1000;

type LearningAttachmentPurpose =
  | 'LEARNING_MATERIAL'
  | 'ASSIGNMENT_SOURCE'
  | 'ASSESSMENT_SOURCE';

type UploadCategory = LearningAttachmentPurpose | 'STUDENT_SUBMISSION';

export type StoredFileResult = {
  readonly id: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly declaredMime: string;
  readonly detectedMime: string;
  readonly extension: string;
  readonly category: PrismaStorageCategory;
  readonly createdAt: string;
};

export type AuthorizedDownload = {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly body: Buffer | Readable;
};

@Injectable()
export class StorageService implements LearningAttachmentPort {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(PRIVATE_STORAGE_PROVIDER)
    private readonly provider: PrivateStorageProvider,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
    @Inject(MALWARE_SCANNER)
    private readonly malwareScanner: MalwareScanner,
  ) {}

  async getUsage(context: AcademicRequestContext): Promise<object> {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    this.requireStorageVisibilityRole(context);
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    await this.ensureScopeRows(tenantId);
    const [policy, account, files] = await Promise.all([
      this.prisma.storageQuotaPolicy.findUniqueOrThrow({
        where: { scopeKey: this.tenantScopeKey(tenantId) },
      }),
      this.prisma.storageUsageAccount.findUniqueOrThrow({
        where: { scopeKey: this.tenantScopeKey(tenantId) },
      }),
      this.prisma.fileObject.findMany({
        where: { tenantId, lifecycle: 'AVAILABLE' },
        select: { category: true, authoritativeSizeBytes: true },
      }),
    ]);
    const quotaBytes = this.toSafeNumber(policy.quotaBytes);
    const usedBytes = this.toSafeNumber(account.usedBytes);
    const reservedBytes = this.toSafeNumber(account.reservedBytes);
    const availableBytes = Math.max(0, quotaBytes - usedBytes - reservedBytes);
    const allocationPercentage = this.percentage(
      usedBytes + reservedBytes,
      quotaBytes,
    );
    const byCategory = new Map<PrismaStorageCategory, { bytes: number; count: number }>();
    for (const file of files) {
      const current = byCategory.get(file.category) ?? { bytes: 0, count: 0 };
      current.bytes += this.toSafeNumber(file.authoritativeSizeBytes);
      current.count += 1;
      byCategory.set(file.category, current);
    }
    return {
      tenantId,
      quotaBytes,
      usedBytes,
      reservedBytes,
      availableBytes,
      usagePercentage: this.percentage(usedBytes, quotaBytes),
      allocationPercentage,
      remainingPercentage: this.percentage(availableBytes, quotaBytes),
      state: this.quotaState(allocationPercentage, policy),
      fileCount: account.fileCount,
      blobCount: account.blobCount,
      byCategory: Array.from(byCategory.entries()).map(([category, value]) => ({
        category,
        logicalBytes: value.bytes,
        fileCount: value.count,
      })),
    };
  }

  async validateReference(
    target: LearningAttachmentTarget,
    fileReferenceId: string,
  ): Promise<void> {
    const reference = await this.prisma.fileReference.findUnique({
      where: { tenantId_id: { tenantId: target.tenantId, id: fileReferenceId } },
      include: { fileObject: { include: { storedBlob: true } } },
    });
    if (
      !reference ||
      reference.referenceType !== 'LEARNING_ITEM' ||
      reference.learningItemId !== target.learningItemId ||
      reference.category !== target.purpose ||
      reference.fileObject.lifecycle !== 'AVAILABLE' ||
      reference.fileObject.storedBlob.lifecycle !== 'AVAILABLE' ||
      reference.fileObject.storedBlob.scanStatus !== 'CLEAR'
    ) {
      throw new ForbiddenException('The file reference is not authorized for this learning item.');
    }
  }

  async getPolicy(context: AcademicRequestContext): Promise<object> {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    this.requireStorageVisibilityRole(context);
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    await this.ensureScopeRows(tenantId);
    const global = await this.prisma.storageQuotaPolicy.findUniqueOrThrow({
      where: { scopeKey: GLOBAL_SCOPE_KEY },
    });
    const tenant = await this.prisma.storageQuotaPolicy.findUniqueOrThrow({
      where: { scopeKey: this.tenantScopeKey(tenantId) },
    });
    return {
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      allowedExtensions: allowedExtensions(),
      globalQuotaBytes: this.toSafeNumber(global.quotaBytes),
      tenantQuotaBytes: this.toSafeNumber(tenant.quotaBytes),
      initialOperationalTimezone: 'America/Santiago',
    };
  }

  async createUploadIntent(
    context: AcademicRequestContext,
    input: CreateUploadIntent,
  ): Promise<object> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: input.parentId } },
    });
    if (!item) this.notFound();

    const category = input.category as UploadCategory;
    if (category === 'STUDENT_SUBMISSION') {
      await this.requireStudentUploadTarget(context, item.id);
    } else {
      this.requireMatchingLearningAttachment(item.type, category);
      await this.requireTeacherOrTenantAdminForCourseSubject(context, item.courseSubjectId);
    }

    let metadata: ReturnType<typeof validateUploadMetadata>;
    try {
      metadata = validateUploadMetadata({
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });
    } catch (error) {
      this.logValidationRejection(context, undefined, category, error);
      this.throwValidation(error);
    }

    const intent = await this.reserveUpload(context, {
      parentType: 'LEARNING_ITEM',
      parentId: item.id,
      category,
    }, metadata);
    return {
      id: intent.id,
      parentType: 'LEARNING_ITEM',
      parentId: item.id,
      category,
      filename: metadata.normalizedFilename,
      mimeType: metadata.declaredMime,
      sizeBytes: metadata.declaredSizeBytes,
      status: 'RESERVED',
      expiresAt: intent.expiresAt.toISOString(),
      upload: {
        method: 'POST',
        path: `/api/v1/file-upload-intents/${intent.id}/content`,
        fieldName: 'file',
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
      },
    };
  }

  async completeUpload(
    context: AcademicRequestContext,
    intentId: string,
    input: { filePath: string; filename: string; mimeType: string },
  ): Promise<StoredFileResult> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    let intent: Awaited<ReturnType<StorageService['getAuthorizedIntent']>>;
    try {
      intent = await this.getAuthorizedIntent(context, intentId);
    } catch (error) {
      const owned = await this.prisma.uploadIntent.findUnique({
        where: { tenantId_id: { tenantId, id: intentId } },
      });
      if (owned?.createdByIdentityUserId === context.principal.identityUserId) {
        await this.failIntent(tenantId, intentId);
      }
      throw error;
    }
    if (intent.status === 'FINALIZED' && intent.finalizedFileObjectId) {
      const existing = await this.prisma.fileObject.findUnique({
        where: { tenantId_id: { tenantId, id: intent.finalizedFileObjectId } },
        include: { storedBlob: true },
      });
      if (
        existing?.lifecycle === 'AVAILABLE' &&
        existing.storedBlob.lifecycle === 'AVAILABLE' &&
        existing.storedBlob.scanStatus === 'CLEAR'
      ) {
        return this.mapFile(existing);
      }
    }
    if (intent.status !== 'RESERVED' && intent.status !== 'STAGED') {
      throw new ConflictException('The upload intent is no longer available.');
    }
    if (intent.expiresAt <= new Date()) {
      await this.expireIntent(tenantId, intent.id, intent.stagingKey);
      throw new BadRequestException('The upload intent has expired.');
    }

    let validated: ValidatedFile;
    try {
      validated = await validateUploadFilePath({
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: this.toSafeNumber(intent.expectedSizeBytes),
        filePath: input.filePath,
      });
      if (
        validated.normalizedFilename !== intent.expectedFilename ||
        validated.detectedMime !== intent.expectedMime ||
        validated.declaredSizeBytes !== this.toSafeNumber(intent.expectedSizeBytes)
      ) {
        throw new FileValidationError(
          'FILE_CONTENT_MISMATCH',
          'The transferred file does not match the upload intent.',
        );
      }
    } catch (error) {
      await this.failIntent(tenantId, intent.id);
      this.logValidationRejection(context, intent.id, intent.category, error);
      this.throwValidation(error);
    }

    let stagedKey: string | undefined;
    let finalKey: string | undefined;
    try {
      const staged = await this.provider.stage({
        tenantId,
        intentId: intent.id,
        sourcePath: input.filePath,
      });
      if (staged.sizeBytes !== validated.authoritativeSizeBytes || staged.sizeBytes > MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException('The authoritative stored size is invalid.');
      }
      stagedKey = staged.storageKey;
      await this.prisma.uploadIntent.update({
        where: { tenantId_id: { tenantId, id: intent.id } },
        data: { status: 'STAGED' },
      });

      await this.scanStagedUpload(context, intent.id, stagedKey, validated.authoritativeSizeBytes);

      const existingBlob = await this.prisma.storedBlob.findFirst({
        where: {
          tenantId,
          sha256: validated.sha256,
          storedSizeBytes: BigInt(validated.authoritativeSizeBytes),
          lifecycle: 'AVAILABLE',
          scanStatus: 'CLEAR',
        },
      });
      const storedBlobId = existingBlob?.id ?? randomUUID();
      const isNewBlob = !existingBlob;
      if (isNewBlob) {
        finalKey = `tenants/${createHash('sha256').update(tenantId).digest('hex')}/blobs/${storedBlobId}`;
        await this.provider.promote({ stagingKey: stagedKey, finalKey });
        stagedKey = undefined;
      } else {
        await this.provider.remove(stagedKey);
        stagedKey = undefined;
      }

      let result: StoredFileResult;
      try {
        result = await this.finalizeUpload({
          context,
          intent: { ...intent, status: 'STAGED' },
          validated,
          storedBlobId,
          storageKey: finalKey ?? existingBlob?.storageKey,
          isNewBlob,
        });
        finalKey = undefined;
      } catch (error) {
        if (!isNewBlob || !this.isUniqueViolation(error)) throw error;
        if (finalKey) {
          await this.provider.remove(finalKey);
          finalKey = undefined;
        }
        const winner = await this.prisma.storedBlob.findFirst({
          where: {
            tenantId,
            sha256: validated.sha256,
            storedSizeBytes: BigInt(validated.authoritativeSizeBytes),
            lifecycle: 'AVAILABLE',
            scanStatus: 'CLEAR',
          },
        });
        if (!winner) throw error;
        result = await this.finalizeUpload({
          context,
          intent: { ...intent, status: 'STAGED' },
          validated,
          storedBlobId: winner.id,
          storageKey: winner.storageKey,
          isNewBlob: false,
        });
        finalKey = undefined;
      }
      await this.audit.record({
        action: isNewBlob ? 'FILE_STORED' : 'FILE_DEDUPLICATED',
        context,
        resourceId: result.id,
        resourceType: 'FileObject',
      });
      return result;
    } catch (error) {
      if (stagedKey) await this.provider.remove(stagedKey);
      await this.failIntent(tenantId, intent.id);
      await this.provider.remove(intent.stagingKey);
      if (finalKey) await this.provider.remove(finalKey);
      throw error;
    }
  }

  async releaseFailedUploadIntent(
    context: AcademicRequestContext,
    intentId: string,
  ): Promise<void> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const intent = await this.prisma.uploadIntent.findUnique({
      where: { tenantId_id: { tenantId, id: intentId } },
    });
    if (!intent || intent.createdByIdentityUserId !== context.principal.identityUserId) return;
    await this.failIntent(tenantId, intentId);
    await this.provider.remove(intent.stagingKey);
  }

  async cleanupExpiredUploads(limit: number): Promise<number> {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const now = new Date();
    const intents = await this.prisma.uploadIntent.findMany({
      where: {
        OR: [
          {
            status: { in: ['RESERVED', 'STAGED'] },
            expiresAt: { lte: now },
          },
          { status: { in: ['FAILED', 'EXPIRED'] } },
        ],
      },
      orderBy: { expiresAt: 'asc' },
      take: boundedLimit,
      select: { tenantId: true, id: true, status: true, stagingKey: true },
    });

    for (const intent of intents) {
      if (intent.status === 'RESERVED' || intent.status === 'STAGED') {
        await this.expireIntent(intent.tenantId, intent.id, intent.stagingKey);
      } else {
        await this.provider.remove(intent.stagingKey);
      }
    }
    return intents.length;
  }

  async listLearningAttachments(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<StoredFileResult[]> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
    });
    if (!item) this.notFound();
    await this.requireLearningItemRead(context, item.id);
    const records = await this.prisma.fileObject.findMany({
      where: {
        tenantId,
        lifecycle: 'AVAILABLE',
        storedBlob: { lifecycle: 'AVAILABLE', scanStatus: 'CLEAR' },
        fileReferences: { some: { tenantId, learningItemId: item.id } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(this.mapFile);
  }

  async attachSubmissionFiles(
    tx: Prisma.TransactionClient,
    context: AcademicRequestContext,
    input: {
      revisionId: string;
      learningItemId: string;
      fileObjectIds: readonly string[];
    },
  ): Promise<void> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const studentIdentityUserId = context.principal.identityUserId;
    const files = await tx.fileObject.findMany({
      where: {
        tenantId,
        id: { in: [...input.fileObjectIds] },
        category: 'STUDENT_SUBMISSION',
        lifecycle: 'AVAILABLE',
        uploadedByIdentityUserId: studentIdentityUserId,
        storedBlob: { lifecycle: 'AVAILABLE', scanStatus: 'CLEAR' },
      },
      include: {
        fileReferences: { select: { id: true, submissionRevisionId: true } },
      },
    });
    if (files.length !== input.fileObjectIds.length) {
      throw new ForbiddenException('One or more files are not authorized for this submission.');
    }

    const intents = await tx.uploadIntent.findMany({
      where: {
        tenantId,
        finalizedFileObjectId: { in: [...input.fileObjectIds] },
        createdByIdentityUserId: studentIdentityUserId,
        parentType: 'LEARNING_ITEM',
        parentId: input.learningItemId,
        category: 'STUDENT_SUBMISSION',
        status: 'FINALIZED',
      },
      select: { finalizedFileObjectId: true },
    });
    if (intents.length !== input.fileObjectIds.length) {
      throw new ForbiddenException('One or more files are not authorized for this learning item.');
    }
    if (files.some((file) => file.fileReferences.length > 0)) {
      throw new ConflictException('A file is already attached to another evidence record.');
    }

    await Promise.all(files.map((file, index) =>
      tx.fileReference.create({
        data: {
          id: randomUUID(),
          tenantId,
          fileObjectId: file.id,
          referenceType: 'SUBMISSION_REVISION',
          category: 'STUDENT_SUBMISSION',
          submissionRevisionId: input.revisionId,
          displayOrder: index,
          createdByIdentityUserId: studentIdentityUserId,
        },
      }),
    ));
  }

  async download(
    context: AcademicRequestContext,
    fileObjectId: string,
  ): Promise<AuthorizedDownload> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const file = await this.prisma.fileObject.findUnique({
      where: { tenantId_id: { tenantId, id: fileObjectId } },
      include: {
        storedBlob: true,
        fileReferences: {
          include: {
            learningItem: true,
            submissionRevision: { include: { submission: true } },
          },
        },
      },
    });
    if (
      !file ||
      file.lifecycle !== 'AVAILABLE' ||
      file.storedBlob.lifecycle !== 'AVAILABLE' ||
      file.storedBlob.scanStatus !== 'CLEAR'
    ) {
      this.deny();
    }
    if (file.fileReferences.length === 0) this.deny();
    let allowed = false;
    for (const reference of file.fileReferences) {
      if (reference.learningItem) {
        allowed ||= await this.canReadLearningItem(context, reference.learningItem.id);
      }
      if (reference.submissionRevision) {
        const submission = reference.submissionRevision.submission;
        allowed ||= await this.canReadSubmission(context, submission);
      }
    }
    if (!allowed) this.deny();
    const body = await this.provider.read(file.storedBlob.storageKey);
    await this.audit.record({
      action: 'FILE_DOWNLOADED',
      context,
      resourceId: file.id,
      resourceType: 'FileObject',
    });
    return {
      filename: file.normalizedFilename,
      mimeType: file.detectedMime,
      sizeBytes: this.toSafeNumber(file.authoritativeSizeBytes),
      body,
    };
  }

  private async getAuthorizedIntent(
    context: AcademicRequestContext,
    intentId: string,
  ) {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const intent = await this.prisma.uploadIntent.findUnique({
      where: { tenantId_id: { tenantId, id: intentId } },
    });
    if (!intent || intent.createdByIdentityUserId !== context.principal.identityUserId) {
      this.deny();
    }
    if (intent.parentType !== 'LEARNING_ITEM') this.deny();
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: intent.parentId } },
    });
    if (!item) this.notFound();
    if (intent.category === 'STUDENT_SUBMISSION') {
      await this.requireStudentUploadTarget(context, item.id);
    } else {
      this.requireMatchingLearningAttachment(
        item.type,
        intent.category as LearningAttachmentPurpose,
      );
      await this.requireTeacherOrTenantAdminForCourseSubject(context, item.courseSubjectId);
    }
    return intent;
  }

  private requireMatchingLearningAttachment(
    itemType: string,
    category: UploadCategory,
  ): void {
    if (
      (category === 'ASSIGNMENT_SOURCE' && itemType !== 'ASSIGNMENT') ||
      (category === 'ASSESSMENT_SOURCE' && itemType !== 'ASSESSMENT') ||
      (category === 'LEARNING_MATERIAL' && itemType !== 'MATERIAL')
    ) {
      throw new BadRequestException('The attachment purpose does not match the learning item.');
    }
  }

  private async requireStudentUploadTarget(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<void> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const student = await this.studentForContext(context);
    if (!student) this.deny();
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
      include: { learningUnit: true },
    });
    if (!item || (item.type !== 'ASSIGNMENT' && item.type !== 'ASSESSMENT')) this.deny();
    const courseSubject = await this.prisma.courseSubject.findFirst({
      where: {
        tenantId,
        id: item.courseSubjectId,
        status: 'ACTIVE',
        OR: [
          {
            defaultForCourse: true,
            course: { enrollments: { some: { studentId: student.id, status: 'ACTIVE' } } },
          },
          { directEnrollments: { some: { studentId: student.id, status: 'ACTIVE' } } },
        ],
      },
    });
    const now = new Date();
    const visible =
      item.publicationStatus === 'PUBLISHED' ||
      (item.publicationStatus === 'SCHEDULED' && item.publishAt !== null && item.publishAt <= now);
    if (
      !courseSubject ||
      item.learningUnit.status !== 'ACTIVE' ||
      (item.learningUnit.startAt && item.learningUnit.startAt > now) ||
      (item.learningUnit.endAt && item.learningUnit.endAt < now) ||
      !visible
    ) {
      this.deny();
    }
  }

  private throwValidation(error: unknown): never {
    if (error instanceof FileValidationError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  /**
   * Structured, privacy-safe rejection log so upload validation failures are
   * observable (they otherwise return a plain 400 with no server-side trace).
   * Never includes filenames, byte contents, or other user-identifying data.
   */
  private logValidationRejection(
    context: AcademicRequestContext,
    uploadIntentId: string | undefined,
    category: string,
    error: unknown,
  ): void {
    const code = error instanceof FileValidationError ? error.code : 'UNEXPECTED_ERROR';
    this.logger.warn({
      action: 'STORAGE_UPLOAD_VALIDATION_REJECTED',
      requestId: context.requestId,
      tenantId: context.tenant.tenantId,
      uploadIntentId,
      category,
      code,
    });
  }

  private async scanStagedUpload(
    context: AcademicRequestContext,
    uploadIntentId: string,
    stagingKey: string,
    sizeBytes: number,
  ): Promise<void> {
    await this.audit.record({
      action: 'FILE_SCAN_STARTED',
      context,
      resourceId: uploadIntentId,
      resourceType: 'UploadIntent',
      summary: { outcome: 'PENDING', sizeBytes },
    });
    const startedAt = Date.now();
    let outcome: Awaited<ReturnType<MalwareScanner['scan']>>;
    try {
      outcome = await this.malwareScanner.scan({
        content: await this.provider.read(stagingKey),
        sizeBytes,
        tenantId: context.tenant.tenantId,
        uploadIntentId,
        correlationId: context.requestId,
      });
    } catch {
      outcome = { status: 'FAILED', reason: 'ERROR' };
    }
    const durationMs = Date.now() - startedAt;
    const summary = {
      outcome: outcome.status,
      durationMs,
      ...(outcome.status === 'FAILED' ? { reason: outcome.reason } : {}),
    };
    await this.audit.record({
      action: `FILE_SCAN_${outcome.status}`,
      context,
      resourceId: uploadIntentId,
      resourceType: 'UploadIntent',
      summary,
    });
    this.logger.log({
      action: `FILE_SCAN_${outcome.status}`,
      durationMs,
      requestId: context.requestId,
      tenantId: context.tenant.tenantId,
      uploadIntentId,
      ...(outcome.status === 'FAILED' ? { reason: outcome.reason } : {}),
    });

    if (outcome.status === 'INFECTED') {
      throw new BadRequestException({
        code: 'MALWARE_DETECTED',
        message: 'The file was rejected for security reasons.',
      });
    }
    if (outcome.status === 'FAILED') {
      throw this.scanFailureException(outcome.reason);
    }
  }

  private scanFailureException(reason: MalwareScanFailureReason): ServiceUnavailableException {
    const code =
      reason === 'TIMEOUT'
        ? 'MALWARE_SCAN_TIMEOUT'
        : reason === 'UNAVAILABLE'
          ? 'MALWARE_SCANNER_UNAVAILABLE'
          : 'MALWARE_SCAN_FAILED';
    return new ServiceUnavailableException({
      code,
      message: 'The file could not be cleared by the security scanner. Please retry later.',
    });
  }

  private async reserveUpload(
    context: AcademicRequestContext,
    reference: {
      parentType: 'LEARNING_ITEM';
      parentId: string;
      category: UploadCategory;
    },
    metadata: ReturnType<typeof validateUploadMetadata>,
  ): Promise<{ id: string; expiresAt: Date }> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    await this.provider.assertPhysicalCapacity(metadata.declaredSizeBytes);
    const intentId = randomUUID();
    const expiresAt = new Date(Date.now() + EXPIRY_MS);
    const size = BigInt(metadata.declaredSizeBytes);
    await this.prisma.$transaction(async (tx) => {
      await this.ensureScopeRows(tenantId, tx);
      const global = await tx.storageQuotaPolicy.findUniqueOrThrow({
        where: { scopeKey: GLOBAL_SCOPE_KEY },
      });
      const tenant = await tx.storageQuotaPolicy.findUniqueOrThrow({
        where: { scopeKey: this.tenantScopeKey(tenantId) },
      });
      const globalUpdated = await this.reserveAccount(tx, GLOBAL_SCOPE_KEY, size, global.quotaBytes);
      if (!globalUpdated) throw new BadRequestException('Global storage quota exceeded.');
      const tenantUpdated = await this.reserveAccount(tx, this.tenantScopeKey(tenantId), size, tenant.quotaBytes);
      if (!tenantUpdated) throw new BadRequestException('Tenant storage quota exceeded.');
      await tx.uploadIntent.create({
        data: {
          id: intentId,
          tenantId,
          createdByIdentityUserId: context.principal.identityUserId,
          parentType: reference.parentType,
          parentId: reference.parentId,
          category: reference.category,
          expectedFilename: metadata.normalizedFilename,
          expectedSizeBytes: size,
          expectedMime: metadata.detectedMime,
          reservedBytes: size,
          stagingKey: `tenants/${createHash('sha256').update(tenantId).digest('hex')}/pending/${intentId}`,
          expiresAt,
        },
      });
    });
    return { id: intentId, expiresAt };
  }

  private async finalizeUpload(input: {
    context: AcademicRequestContext;
    intent: {
      id: string;
      tenantId: string;
      parentType: string;
      parentId: string;
      category: PrismaStorageCategory;
      expectedFilename: string;
      expectedSizeBytes: bigint;
      expectedMime: string;
      reservedBytes: bigint;
      stagingKey: string;
      status: string;
      expiresAt: Date;
      finalizedFileObjectId: string | null;
    };
    validated: ValidatedFile;
    storedBlobId: string;
    storageKey: string | undefined;
    isNewBlob: boolean;
  }): Promise<StoredFileResult> {
    if (!input.storageKey) throw new Error('Stored blob key is missing.');
    if (input.intent.status !== 'STAGED') {
      throw new ConflictException('Upload intent is not staged for completion.');
    }
    const now = new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      if (input.isNewBlob) {
        await tx.storedBlob.create({
          data: {
            id: input.storedBlobId,
            tenantId: input.intent.tenantId,
            storageKey: input.storageKey as string,
            sha256: input.validated.sha256,
            storedSizeBytes: BigInt(input.validated.authoritativeSizeBytes),
            detectedMime: input.validated.detectedMime,
            detectedExtension: input.validated.extension,
            lifecycle: 'AVAILABLE',
            validationStatus: 'VALID',
            scanStatus: 'CLEAR',
            validatedAt: now,
            availableAt: now,
          },
        });
      }
      const file = await tx.fileObject.create({
        data: {
          id: randomUUID(),
          tenantId: input.intent.tenantId,
          storedBlobId: input.storedBlobId,
          originalFilename: input.validated.originalFilename,
          normalizedFilename: input.validated.normalizedFilename,
          declaredSizeBytes: BigInt(input.validated.declaredSizeBytes),
          authoritativeSizeBytes: BigInt(input.validated.authoritativeSizeBytes),
          declaredMime: input.validated.declaredMime,
          detectedMime: input.validated.detectedMime,
          extension: input.validated.extension,
          category: input.intent.category,
          uploadedByIdentityUserId: input.context.principal.identityUserId,
          lifecycle: 'AVAILABLE',
          validatedAt: now,
        },
      });
      if (input.intent.category !== 'STUDENT_SUBMISSION') {
        await tx.fileReference.create({
          data: {
            id: randomUUID(),
            tenantId: input.intent.tenantId,
            fileObjectId: file.id,
            referenceType: 'LEARNING_ITEM',
            category: input.intent.category,
            learningItemId: input.intent.parentId,
            createdByIdentityUserId: input.context.principal.identityUserId,
          },
        });
      }
      await this.releaseAndAccount(
        tx,
        input.intent.tenantId,
        input.intent.id,
        input.validated.authoritativeSizeBytes,
        input.isNewBlob,
      );
      await tx.uploadIntent.update({
        where: { tenantId_id: { tenantId: input.intent.tenantId, id: input.intent.id } },
        data: {
          status: 'FINALIZED',
          finalizedAt: now,
          finalizedFileObjectId: file.id,
        },
      });
      return file;
    });
    return this.mapFile(record);
  }

  private async releaseAndAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    intentId: string,
    sizeBytes: number,
    newBlob: boolean,
  ): Promise<void> {
    const intent = await tx.uploadIntent.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id: intentId } },
    });
    if (intent.status !== 'STAGED') throw new ConflictException('Upload intent is no longer available.');
    const reservedBytes = this.toSafeNumber(intent.reservedBytes);
    await this.adjustAccount(tx, tenantId, 1, newBlob ? 1 : 0, newBlob ? sizeBytes : 0, -reservedBytes);
  }

  private async failIntent(
    tenantId: string,
    intentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.uploadIntent.findUnique({
        where: { tenantId_id: { tenantId, id: intentId } },
      });
      if (!intent || (intent.status !== 'RESERVED' && intent.status !== 'STAGED')) return;
      const reserved = this.toSafeNumber(intent.reservedBytes);
      await this.adjustAccount(tx, tenantId, 0, 0, 0, -reserved);
      await tx.uploadIntent.update({
        where: { tenantId_id: { tenantId, id: intentId } },
        data: { status: 'FAILED' },
      });
    });
  }

  private async expireIntent(
    tenantId: string,
    intentId: string,
    stagingKey: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.uploadIntent.findUnique({
        where: { tenantId_id: { tenantId, id: intentId } },
      });
      if (!intent || (intent.status !== 'RESERVED' && intent.status !== 'STAGED')) return;
      await this.adjustAccount(
        tx,
        tenantId,
        0,
        0,
        0,
        -this.toSafeNumber(intent.reservedBytes),
      );
      await tx.uploadIntent.update({
        where: { tenantId_id: { tenantId, id: intentId } },
        data: { status: 'EXPIRED' },
      });
    });
    await this.provider.remove(stagingKey);
  }

  private async adjustAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    fileDelta: number,
    blobDelta: number,
    usedDelta: number,
    reservedDelta: number,
  ): Promise<void> {
    for (const scopeKey of [GLOBAL_SCOPE_KEY, this.tenantScopeKey(tenantId)]) {
      await tx.$executeRaw(
        Prisma.sql`UPDATE "storage_usage_accounts"
          SET "used_bytes" = "used_bytes" + ${BigInt(usedDelta)},
              "reserved_bytes" = "reserved_bytes" + ${BigInt(reservedDelta)},
              "file_count" = "file_count" + ${fileDelta},
              "blob_count" = "blob_count" + ${blobDelta},
              "version" = "version" + 1,
              "updated_at" = NOW()
          WHERE "scope_key" = ${scopeKey}`,
      );
    }
  }

  private async reserveAccount(
    tx: Prisma.TransactionClient,
    scopeKey: string,
    size: bigint,
    quota: bigint,
  ): Promise<boolean> {
    const result = await tx.$executeRaw(
      Prisma.sql`UPDATE "storage_usage_accounts"
        SET "reserved_bytes" = "reserved_bytes" + ${size},
            "version" = "version" + 1,
            "updated_at" = NOW()
        WHERE "scope_key" = ${scopeKey}
          AND "used_bytes" + "reserved_bytes" + ${size} <= ${quota}`,
    );
    return result === 1;
  }

  private async ensureScopeRows(
    tenantId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await tx.storageQuotaPolicy.upsert({
      where: { scopeKey: GLOBAL_SCOPE_KEY },
      create: {
        scopeKey: GLOBAL_SCOPE_KEY,
        scopeType: 'GLOBAL',
        quotaBytes: BigInt(GLOBAL_QUOTA_BYTES),
      },
      update: {},
    });
    await tx.storageUsageAccount.upsert({
      where: { scopeKey: GLOBAL_SCOPE_KEY },
      create: { scopeKey: GLOBAL_SCOPE_KEY, scopeType: 'GLOBAL' },
      update: {},
    });
    const tenantKey = this.tenantScopeKey(tenantId);
    await tx.storageQuotaPolicy.upsert({
      where: { scopeKey: tenantKey },
      create: {
        scopeKey: tenantKey,
        scopeType: 'TENANT',
        tenantId,
        quotaBytes: BigInt(COLEGIO_CONQUISTADORES_QUOTA_BYTES),
      },
      update: {},
    });
    await tx.storageUsageAccount.upsert({
      where: { scopeKey: tenantKey },
      create: { scopeKey: tenantKey, scopeType: 'TENANT', tenantId },
      update: {},
    });
  }

  private async requireLearningItemRead(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<void> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    await this.canReadLearningItem(context, learningItemId).then((allowed) => {
      if (!allowed) this.deny();
    });
  }

  private async canReadLearningItem(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<boolean> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
      include: { learningUnit: true },
    });
    if (!item) return false;
    if (context.principal.roles.includes('TENANT_ADMIN')) return true;
    if (context.principal.roles.includes('TEACHER')) {
      return this.hasTeacherAssignment(context, item.courseSubjectId);
    }
    if (!context.principal.roles.includes('STUDENT')) return false;
    const student = await this.studentForContext(context);
    if (!student) return false;
    const courseSubject = await this.prisma.courseSubject.findFirst({
      where: {
        tenantId,
        id: item.courseSubjectId,
        status: 'ACTIVE',
        OR: [
          {
            defaultForCourse: true,
            course: { enrollments: { some: { studentId: student.id, status: 'ACTIVE' } } },
          },
          { directEnrollments: { some: { studentId: student.id, status: 'ACTIVE' } } },
        ],
      },
    });
    const now = new Date();
    return Boolean(
      courseSubject &&
        item.learningUnit.status === 'ACTIVE' &&
        (!item.learningUnit.startAt || item.learningUnit.startAt <= now) &&
        (!item.learningUnit.endAt || item.learningUnit.endAt >= now) &&
        (item.publicationStatus === 'PUBLISHED' ||
          (item.publicationStatus === 'SCHEDULED' &&
            item.publishAt !== null &&
            item.publishAt <= now)),
    );
  }

  private async canReadSubmission(
    context: AcademicRequestContext,
    submission: { tenantId: string; studentId: string; learningItemId: string },
  ): Promise<boolean> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return true;
    if (context.principal.roles.includes('TEACHER')) {
      return this.hasTeacherAssignment(
        context,
        await this.courseSubjectForItem(context, submission.learningItemId),
      );
    }
    if (!context.principal.roles.includes('STUDENT')) return false;
    const student = await this.studentForContext(context);
    return Boolean(student && student.id === submission.studentId);
  }

  private async requireTeacherOrTenantAdminForCourseSubject(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<void> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    if (
      !context.principal.roles.includes('TEACHER') ||
      !(await this.hasTeacherAssignment(context, courseSubjectId))
    ) {
      this.deny();
    }
  }

  private async hasTeacherAssignment(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<boolean> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, identityUserId: context.principal.identityUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!teacher) return false;
    const assignment = await this.prisma.courseSubjectTeacher.findFirst({
      where: { tenantId, teacherId: teacher.id, courseSubjectId, status: 'ACTIVE' },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  private async studentForContext(context: AcademicRequestContext) {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    return this.prisma.student.findFirst({
      where: { tenantId, identityUserId: context.principal.identityUserId, status: 'ACTIVE' },
    });
  }

  private async courseSubjectForItem(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<string> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const item = await this.prisma.learningItem.findFirst({
      where: { tenantId, id: learningItemId },
      select: { courseSubjectId: true },
    });
    if (!item) this.notFound();
    return item.courseSubjectId;
  }

  private mapFile = (record: {
    id: string;
    originalFilename: string;
    authoritativeSizeBytes: bigint;
    declaredMime: string;
    detectedMime: string;
    extension: string;
    category: PrismaStorageCategory;
    createdAt: Date;
  }): StoredFileResult => ({
    id: record.id,
    originalFilename: record.originalFilename,
    sizeBytes: this.toSafeNumber(record.authoritativeSizeBytes),
    declaredMime: record.declaredMime,
    detectedMime: record.detectedMime,
    extension: record.extension,
    category: record.category,
    createdAt: record.createdAt.toISOString(),
  });

  private quotaState(
    percentage: number,
    policy: { infoThresholdPercent: number; warningThresholdPercent: number; criticalThresholdPercent: number },
  ): string {
    if (percentage >= 100) return 'FULL';
    if (percentage >= policy.criticalThresholdPercent) return 'CRITICAL';
    if (percentage >= policy.warningThresholdPercent) return 'WARNING';
    if (percentage >= policy.infoThresholdPercent) return 'INFO';
    return 'NORMAL';
  }

  private percentage(value: number, quota: number): number {
    return quota === 0 ? 100 : Math.min(100, Number(((value / quota) * 100).toFixed(2)));
  }

  private toSafeNumber(value: bigint): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('Storage byte count exceeds safe integer range.');
    return number;
  }

  private tenantScopeKey(tenantId: string): string {
    return `TENANT:${tenantId}`;
  }

  private requireStorageVisibilityRole(context: AcademicRequestContext): void {
    if (
      !context.principal.roles.includes('TENANT_ADMIN') &&
      !context.principal.roles.includes('TEACHER')
    ) {
      this.deny();
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private deny(): never {
    throw new ForbiddenException('The requested file action is not authorized.');
  }

  private notFound(): never {
    throw new NotFoundException('The requested file was not found.');
  }
}
