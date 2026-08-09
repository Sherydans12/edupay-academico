import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReview,
  CreateSubmission,
  CreateSubmissionRevision,
} from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
import { TenantCapability } from '../authorization/authorization.types';
import type { AcademicRequestContext } from '../academic/academic-context';
import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../academic/academic-audit.port';
import type { SubmissionStatus } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import { StorageService } from './storage.service';

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
  ) {}

  async hasStudentWork(input: {
    tenantId: string;
    learningItemId: string;
  }): Promise<boolean> {
    return (await this.prisma.submission.count({
      where: { tenantId: input.tenantId, learningItemId: input.learningItemId },
    })) > 0;
  }

  async submit(
    context: AcademicRequestContext,
    learningItemId: string,
    input: CreateSubmission | CreateSubmissionRevision,
  ): Promise<object> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const student = await this.requireStudent(context);
    const item = await this.requireEligibleVisibleItem(context, learningItemId, student.id);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findUnique({
        where: {
          tenantId_studentId_learningItemId: {
            tenantId,
            studentId: student.id,
            learningItemId,
          },
        },
      });
      if (existing && existing.status !== 'CHANGES_REQUESTED') {
        throw new ConflictException(
          'A new revision is allowed only after the teacher requests changes.',
        );
      }
      const now = new Date();
      const revisionNumber = existing
        ? ((await tx.submissionRevision.aggregate({
            where: { tenantId, submissionId: existing.id },
            _max: { revisionNumber: true },
          }))._max.revisionNumber ?? 0) + 1
        : 1;
      const submission = existing ?? await tx.submission.create({
        data: {
          tenantId,
          studentId: student.id,
          learningItemId: item.id,
          status: 'PENDING',
        },
      });
      const revision = await tx.submissionRevision.create({
        data: {
          tenantId,
          submissionId: submission.id,
          revisionNumber,
          studentComment: input.studentComment ?? null,
          submittedAt: now,
          effectiveDueAt: item.dueAt ?? now,
          isLate: item.dueAt ? now.getTime() > item.dueAt.getTime() : false,
          createdByIdentityUserId: context.principal.identityUserId,
        },
      });
      await this.storage.attachSubmissionFiles(tx, context, {
        revisionId: revision.id,
        learningItemId: item.id,
        fileObjectIds: input.fileObjectIds,
      });
      await tx.submission.update({
        where: { tenantId_id: { tenantId, id: submission.id } },
        data: { status: 'SUBMITTED' },
      });
      return { submissionId: submission.id, resubmission: Boolean(existing) };
    });
    await this.audit.record({
      action: outcome.resubmission ? 'SUBMISSION_RESUBMITTED' : 'SUBMISSION_SUBMITTED',
      context,
      resourceId: outcome.submissionId,
      resourceType: 'Submission',
      courseSubjectId: item.courseSubjectId,
    });
    return this.getById(context, outcome.submissionId);
  }

  async getByLearningItem(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<object> {
    const student = await this.requireStudent(context);
    const submission = await this.prisma.submission.findUnique({
      where: {
        tenantId_studentId_learningItemId: {
          tenantId: TenantQueryScope.fromTrustedContext(context.tenant).tenantId,
          studentId: student.id,
          learningItemId,
        },
      },
      select: { id: true },
    });
    if (!submission) this.notFound();
    return this.getById(context, submission.id);
  }

  async submitRevision(
    context: AcademicRequestContext,
    submissionId: string,
    input: CreateSubmissionRevision,
  ): Promise<object> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const submission = await this.prisma.submission.findUnique({
      where: { tenantId_id: { tenantId, id: submissionId } },
      select: { learningItemId: true },
    });
    if (!submission) this.notFound();
    return this.submit(context, submission.learningItemId, input);
  }

  async getById(
    context: AcademicRequestContext,
    submissionId: string,
  ): Promise<object> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const submission = await this.prisma.submission.findUnique({
      where: { tenantId_id: { tenantId, id: submissionId } },
      include: {
        revisions: {
          orderBy: { revisionNumber: 'asc' },
          include: {
            fileReferences: {
              include: { fileObject: true },
              orderBy: { createdAt: 'asc' },
            },
            reviews: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!submission) this.notFound();
    await this.requireSubmissionRead(context, submission);
    return this.mapSubmission(submission);
  }

  async listForTeacher(
    context: AcademicRequestContext,
    learningItemId: string,
  ): Promise<object[]> {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
    });
    if (!item) this.notFound();
    await this.requireTeacherOrAdminForSubject(context, item.courseSubjectId);
    const submissions = await this.prisma.submission.findMany({
      where: { tenantId, learningItemId },
      include: {
        revisions: {
          orderBy: { revisionNumber: 'asc' },
          include: {
            fileReferences: { include: { fileObject: true } },
            reviews: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
    return submissions.map(this.mapSubmission);
  }

  async review(
    context: AcademicRequestContext,
    revisionId: string,
    input: CreateReview,
  ): Promise<object> {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    if (!context.principal.roles.includes('TEACHER')) this.deny();
    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, identityUserId: context.principal.identityUserId, status: 'ACTIVE' },
    });
    if (!teacher) this.deny();
    const revision = await this.prisma.submissionRevision.findUnique({
      where: { tenantId_id: { tenantId, id: revisionId } },
      include: { submission: true },
    });
    if (!revision) this.notFound();
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: revision.submission.learningItemId } },
    });
    if (!item) this.notFound();
    const assignment = await this.prisma.courseSubjectTeacher.findFirst({
      where: {
        tenantId,
        teacherId: teacher.id,
        courseSubjectId: item.courseSubjectId,
        status: 'ACTIVE',
      },
    });
    if (!assignment) this.deny();
    if (
      (input.action === 'REVIEWED' || input.action === 'CHANGES_REQUESTED') &&
      revision.submission.status !== 'SUBMITTED'
    ) {
      throw new ConflictException('Only a submitted revision can receive this review action.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          tenantId,
          submissionRevisionId: revision.id,
          reviewerTeacherId: teacher.id,
          reviewerIdentityUserId: context.principal.identityUserId,
          action: input.action,
          comment: input.comment ?? null,
        },
      });
      if (input.action !== 'COMMENTED') {
        await tx.submission.update({
          where: { tenantId_id: { tenantId, id: revision.submission.id } },
          data: {
            status: input.action === 'REVIEWED' ? 'REVIEWED' : 'CHANGES_REQUESTED',
          },
        });
      }
    });
    await this.audit.record({
      action: `SUBMISSION_${input.action}`,
      context,
      resourceId: revision.submission.id,
      resourceType: 'Submission',
      courseSubjectId: item.courseSubjectId,
    });
    return this.getById(context, revision.submission.id);
  }

  private async requireEligibleVisibleItem(
    context: AcademicRequestContext,
    learningItemId: string,
    studentId: string,
  ) {
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const item = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId, id: learningItemId } },
      include: { learningUnit: true },
    });
    if (!item) this.notFound();
    if (item.type !== 'ASSIGNMENT' && item.type !== 'ASSESSMENT') {
      throw new ConflictException('Only assignment and assessment items accept submissions.');
    }
    const courseSubject = await this.prisma.courseSubject.findFirst({
      where: {
        tenantId,
        id: item.courseSubjectId,
        status: 'ACTIVE',
        OR: [
          {
            defaultForCourse: true,
            course: { enrollments: { some: { studentId, status: 'ACTIVE' } } },
          },
          { directEnrollments: { some: { studentId, status: 'ACTIVE' } } },
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
    return item;
  }

  private async requireStudent(context: AcademicRequestContext) {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    if (!context.principal.roles.includes('STUDENT')) this.deny();
    const tenantId = TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
    const student = await this.prisma.student.findFirst({
      where: { tenantId, identityUserId: context.principal.identityUserId, status: 'ACTIVE' },
    });
    if (!student) this.deny();
    return student;
  }

  private async requireSubmissionRead(
    context: AcademicRequestContext,
    submission: {
      tenantId: string;
      studentId: string;
      learningItemId: string;
    },
  ): Promise<void> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    if (context.principal.roles.includes('STUDENT')) {
      const student = await this.requireStudent(context);
      if (student.id !== submission.studentId) this.deny();
      return;
    }
    if (context.principal.roles.includes('TEACHER')) {
      const item = await this.prisma.learningItem.findUnique({
        where: { tenantId_id: { tenantId: submission.tenantId, id: submission.learningItemId } },
      });
      if (!item || !(await this.hasTeacherAssignment(context, item.courseSubjectId))) this.deny();
      return;
    }
    this.deny();
  }

  private async requireTeacherOrAdminForSubject(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<void> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    if (!context.principal.roles.includes('TEACHER') || !(await this.hasTeacherAssignment(context, courseSubjectId))) {
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
    });
    if (!teacher) return false;
    const assignment = await this.prisma.courseSubjectTeacher.findFirst({
      where: { tenantId, teacherId: teacher.id, courseSubjectId, status: 'ACTIVE' },
    });
    return Boolean(assignment);
  }

  private mapSubmission = (submission: {
    id: string;
    studentId: string;
    learningItemId: string;
    status: SubmissionStatus;
    createdAt: Date;
    updatedAt: Date;
    revisions: Array<{
      id: string;
      revisionNumber: number;
      studentComment: string | null;
      submittedAt: Date;
      effectiveDueAt: Date;
      isLate: boolean;
      createdByIdentityUserId: string;
      createdAt: Date;
      fileReferences: Array<{
        fileObject: {
          id: string;
          originalFilename: string;
          authoritativeSizeBytes: bigint;
          declaredMime: string;
          detectedMime: string;
          extension: string;
          category: string;
          createdAt: Date;
        };
      }>;
      reviews: Array<{
        id: string;
        action: string;
        comment: string | null;
        reviewerIdentityUserId: string;
        createdAt: Date;
      }>;
    }>;
  }): object => ({
    id: submission.id,
    studentId: submission.studentId,
    learningItemId: submission.learningItemId,
    status: submission.status,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    revisions: submission.revisions.map((revision) => ({
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      studentComment: revision.studentComment,
      submittedAt: revision.submittedAt.toISOString(),
      effectiveDueAt: revision.effectiveDueAt.toISOString(),
      isLate: revision.isLate,
      createdByIdentityUserId: revision.createdByIdentityUserId,
      createdAt: revision.createdAt.toISOString(),
      files: revision.fileReferences.map((reference) => ({
        id: reference.fileObject.id,
        originalFilename: reference.fileObject.originalFilename,
        sizeBytes: Number(reference.fileObject.authoritativeSizeBytes),
        declaredMime: reference.fileObject.declaredMime,
        detectedMime: reference.fileObject.detectedMime,
        extension: reference.fileObject.extension,
        category: reference.fileObject.category,
        createdAt: reference.fileObject.createdAt.toISOString(),
      })),
      reviews: revision.reviews.map((review) => ({
        id: review.id,
        action: review.action,
        comment: review.comment,
        reviewerIdentityUserId: review.reviewerIdentityUserId,
        createdAt: review.createdAt.toISOString(),
      })),
    })),
  });

  private deny(): never {
    throw new ForbiddenException('The requested submission action is not authorized.');
  }

  private notFound(): never {
    throw new NotFoundException('The requested submission was not found.');
  }
}
