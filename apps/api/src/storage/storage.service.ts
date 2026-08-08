import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Prisma } from '../generated/prisma/client';
import type {
  StorageCategory as PrismaStorageCategory,
} from '../generated/prisma/client';
import type { StorageUploadFile } from '@edupay/contracts';

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
  validateUploadFile,
  type ValidatedFile,
} from './file-validation';
import {
  PRIVATE_STORAGE_PROVIDER,
  type PrivateStorageProvider,
} from './private-storage.port';

const GLOBAL_SCOPE_KEY = 'GLOBAL';
const EXPIRY_MS = 15 * 60 * 1000;

type LearningAttachmentPurpose =
  | 'LEARNING_MATERIAL'
  | 'ASSIGNMENT_SOURCE'
  | 'ASSESSMENT_SOURCE';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(PRIVATE_STORAGE_PROVIDER)
    private readonly provider: PrivateStorageProvider,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
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
    });
    if (
      !reference ||
      reference.referenceType !== 'LEARNING_ITEM' ||
      reference.learningItemId !== target.learningItemId ||
      reference.category !== target.purpose
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

  async attachLearningFile(
    context: AcademicRequestContext,
    learningItemId: string,
    purpose: LearningAttachmentPurpose,
    input: StorageUploadFile,
  ): Promise<StoredFileResult> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
    });
    if (!item) this.notFound();
    if (
      (purpose === 'ASSIGNMENT_SOURCE' && item.type !== 'ASSIGNMENT') ||
      (purpose === 'ASSESSMENT_SOURCE' && item.type !== 'ASSESSMENT') ||
      (purpose === 'LEARNING_MATERIAL' && item.type !== 'MATERIAL')
    ) {
      throw new BadRequestException('The attachment purpose does not match the learning item.');
    }
    await this.requireTeacherOrTenantAdminForCourseSubject(context, item.courseSubjectId);
    return this.storeFile(context, input, {
      referenceType: 'LEARNING_ITEM',
      parentId: item.id,
      category: purpose,
      learningItemId: item.id,
    });
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
        fileReferences: { some: { tenantId, learningItemId: item.id } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(this.mapFile);
  }

  async storeSubmissionFile(
    context: AcademicRequestContext,
    submissionRevisionId: string,
    input: StorageUploadFile,
  ): Promise<StoredFileResult> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const revision = await this.prisma.submissionRevision.findUnique({
      where: { tenantId_id: { tenantId, id: submissionRevisionId } },
      include: { submission: true },
    });
    if (!revision) this.notFound();
    return this.storeFile(context, input, {
      referenceType: 'SUBMISSION_REVISION',
      parentId: revision.id,
      category: 'STUDENT_SUBMISSION',
      submissionRevisionId: revision.id,
    });
  }

  async removeRevisionArtifacts(
    context: AcademicRequestContext,
    revisionId: string,
  ): Promise<void> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const references = await this.prisma.fileReference.findMany({
      where: { tenantId, submissionRevisionId: revisionId },
      select: { id: true, fileObjectId: true },
    });
    if (references.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.fileReference.deleteMany({
        where: { tenantId, submissionRevisionId: revisionId },
      });
      await tx.fileObject.deleteMany({
        where: {
          tenantId,
          id: { in: references.map((reference) => reference.fileObjectId) },
        },
      });
      await this.adjustAccount(tx, tenantId, -references.length, 0, 0, 0);
    });
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
    if (!file || file.lifecycle !== 'AVAILABLE' || file.storedBlob.lifecycle !== 'AVAILABLE') {
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

  private async storeFile(
    context: AcademicRequestContext,
    input: StorageUploadFile,
    reference: {
      referenceType: 'LEARNING_ITEM' | 'SUBMISSION_REVISION';
      parentId: string;
      category: LearningAttachmentPurpose | 'STUDENT_SUBMISSION';
      learningItemId?: string;
      submissionRevisionId?: string;
    },
  ): Promise<StoredFileResult> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    let validated: ValidatedFile;
    try {
      validated = validateUploadFile(input);
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const intent = await this.reserveUpload(context, reference, validated);
    let stagedKey: string | undefined;
    let finalKey: string | undefined;
    try {
      const staged = await this.provider.stage({
        tenantId,
        intentId: intent.id,
        bytes: validated.bytes,
      });
      if (
        staged.sizeBytes !== validated.authoritativeSizeBytes ||
        staged.sizeBytes > MAX_FILE_SIZE_BYTES
      ) {
        throw new BadRequestException('The authoritative stored size is invalid.');
      }
      stagedKey = staged.storageKey;
      const sha256 = createHash('sha256').update(validated.bytes).digest('hex');
      const existing = await this.prisma.storedBlob.findFirst({
        where: {
          tenantId,
          sha256,
          storedSizeBytes: BigInt(validated.authoritativeSizeBytes),
          lifecycle: 'AVAILABLE',
        },
      });
      let storedBlobId = existing?.id;
      let isNewBlob = false;
      if (!storedBlobId) {
        storedBlobId = randomUUID();
        finalKey = `tenants/${createHash('sha256').update(tenantId).digest('hex')}/blobs/${storedBlobId}`;
        await this.provider.promote({ stagingKey: stagedKey, finalKey });
        stagedKey = undefined;
        isNewBlob = true;
      } else {
        await this.provider.remove(stagedKey);
        stagedKey = undefined;
      }
      try {
        const result = await this.finalizeUpload({
          context,
          intentId: intent.id,
          tenantId,
          validated,
          sha256,
          storedBlobId,
          storageKey: finalKey ?? existing?.storageKey,
          isNewBlob,
          reference,
        });
        await this.audit.record({
          action: isNewBlob ? 'FILE_STORED' : 'FILE_DEDUPLICATED',
          context,
          resourceId: result.id,
          resourceType: 'FileObject',
          ...(reference.learningItemId
            ? { courseSubjectId: (await this.prisma.learningItem.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id: reference.learningItemId } } })).courseSubjectId }
            : {}),
        });
        return result;
      } catch (error) {
        if (isNewBlob && this.isUniqueViolation(error)) {
          if (finalKey) await this.provider.remove(finalKey);
          const winner = await this.prisma.storedBlob.findFirst({
            where: {
              tenantId,
              sha256,
              storedSizeBytes: BigInt(validated.authoritativeSizeBytes),
              lifecycle: 'AVAILABLE',
            },
          });
          if (winner) {
            return this.finalizeUpload({
              context,
              intentId: intent.id,
              tenantId,
              validated,
              sha256,
              storedBlobId: winner.id,
              storageKey: winner.storageKey,
              isNewBlob: false,
              reference,
            });
          }
        }
        if (isNewBlob && finalKey) await this.provider.remove(finalKey);
        throw error;
      }
    } catch (error) {
      if (stagedKey) await this.provider.remove(stagedKey);
      await this.failIntent(context, intent.id, tenantId);
      throw error;
    }
  }

  private async reserveUpload(
    context: AcademicRequestContext,
    reference: {
      referenceType: 'LEARNING_ITEM' | 'SUBMISSION_REVISION';
      parentId: string;
      category: LearningAttachmentPurpose | 'STUDENT_SUBMISSION';
    },
    validated: ValidatedFile,
  ): Promise<{ id: string }> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    await this.provider.assertPhysicalCapacity(validated.authoritativeSizeBytes);
    const intentId = randomUUID();
    const size = BigInt(validated.authoritativeSizeBytes);
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
          parentType: reference.referenceType,
          parentId: reference.parentId,
          category: reference.category,
          expectedFilename: validated.normalizedFilename,
          expectedSizeBytes: size,
          expectedMime: validated.declaredMime,
          reservedBytes: size,
          stagingKey: `tenants/${createHash('sha256').update(tenantId).digest('hex')}/pending/${intentId}`,
          expiresAt: new Date(Date.now() + EXPIRY_MS),
        },
      });
    });
    return { id: intentId };
  }

  private async finalizeUpload(input: {
    context: AcademicRequestContext;
    intentId: string;
    tenantId: string;
    validated: ValidatedFile;
    sha256: string;
    storedBlobId: string;
    storageKey: string | undefined;
    isNewBlob: boolean;
    reference: {
      referenceType: 'LEARNING_ITEM' | 'SUBMISSION_REVISION';
      parentId: string;
      category: LearningAttachmentPurpose | 'STUDENT_SUBMISSION';
      learningItemId?: string;
      submissionRevisionId?: string;
    };
  }): Promise<StoredFileResult> {
    if (!input.storageKey) throw new Error('Stored blob key is missing.');
    const now = new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      if (input.isNewBlob) {
        await tx.storedBlob.create({
          data: {
            id: input.storedBlobId,
            tenantId: input.tenantId,
            storageKey: input.storageKey as string,
            sha256: input.sha256,
            storedSizeBytes: BigInt(input.validated.authoritativeSizeBytes),
            detectedMime: input.validated.detectedMime,
            detectedExtension: input.validated.extension,
            lifecycle: 'AVAILABLE',
            validationStatus: 'VALID',
            scanStatus: 'NOT_SCANNED',
            validatedAt: now,
            availableAt: now,
          },
        });
      }
      const file = await tx.fileObject.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          storedBlobId: input.storedBlobId,
          originalFilename: input.validated.originalFilename,
          normalizedFilename: input.validated.normalizedFilename,
          declaredSizeBytes: BigInt(input.validated.declaredSizeBytes),
          authoritativeSizeBytes: BigInt(input.validated.authoritativeSizeBytes),
          declaredMime: input.validated.declaredMime,
          detectedMime: input.validated.detectedMime,
          extension: input.validated.extension,
          category: input.reference.category,
          uploadedByIdentityUserId: input.context.principal.identityUserId,
          lifecycle: 'AVAILABLE',
          validatedAt: now,
        },
      });
      await tx.fileReference.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          fileObjectId: file.id,
          referenceType: input.reference.referenceType,
          category: input.reference.category,
          learningItemId: input.reference.learningItemId ?? null,
          submissionRevisionId: input.reference.submissionRevisionId ?? null,
          createdByIdentityUserId: input.context.principal.identityUserId,
        },
      });
      await this.releaseAndAccount(
        tx,
        input.tenantId,
        input.intentId,
        input.validated.authoritativeSizeBytes,
        input.isNewBlob,
      );
      await tx.uploadIntent.update({
        where: { tenantId_id: { tenantId: input.tenantId, id: input.intentId } },
        data: { status: 'FINALIZED', finalizedAt: now },
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
    if (intent.status !== 'RESERVED') throw new ConflictException('Upload intent is no longer available.');
    const reservedBytes = this.toSafeNumber(intent.reservedBytes);
      await this.adjustAccount(tx, tenantId, 1, newBlob ? 1 : 0, newBlob ? sizeBytes : 0, -reservedBytes);
  }

  private async failIntent(
    _context: AcademicRequestContext,
    intentId: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.uploadIntent.findUnique({
        where: { tenantId_id: { tenantId, id: intentId } },
      });
      if (!intent || intent.status !== 'RESERVED') return;
      const reserved = this.toSafeNumber(intent.reservedBytes);
      await this.adjustAccount(tx, tenantId, 0, 0, 0, -reserved);
      await tx.uploadIntent.update({
        where: { tenantId_id: { tenantId, id: intentId } },
        data: { status: 'FAILED' },
      });
    });
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
