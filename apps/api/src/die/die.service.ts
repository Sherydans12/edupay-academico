import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddDieMember,
  CorrectDieJournalEntry,
  CreateDieAction,
  CreateDieJournalEntry,
  FinishDieSupport,
  ReassignDieAction,
  RemoveDieMember,
  StartDieSupport,
  UpdateDieAction,
} from '@edupay/contracts';
import PDFDocument from 'pdfkit';

import type { AcademicRequestContext } from '../academic/academic-context';
import { Prisma, type DieActionStatus } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TenantOperationalProfileService } from '../tenant-profile/tenant-operational-profile.service';
import { DieAccessService } from './die-access.service';
import { DieIdentityMembershipVerifier } from './die-identity-membership.verifier';

const OPEN_ACTION_STATUSES: DieActionStatus[] = ['PENDING', 'IN_PROGRESS'];

type JournalFilters = {
  readonly from?: string;
  readonly to?: string;
  readonly category?: string;
  readonly authorIdentityUserId?: string;
  readonly includeVoided?: boolean;
};

type ActionFilters = {
  readonly studentId?: string;
  readonly assigneeMemberAssignmentId?: string;
  readonly status?: DieActionStatus;
  readonly overdue?: boolean;
  readonly mine?: boolean;
};

type AcademicSnapshot = {
  academicYearId: string | null;
  courseId: string | null;
  academicYearLabel: string | null;
  courseLabel: string | null;
};

@Injectable()
export class DieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DieAccessService,
    private readonly identityMemberships: DieIdentityMembershipVerifier,
    private readonly tenantProfiles: TenantOperationalProfileService,
  ) {}

  async listMemberCandidates(context: AcademicRequestContext, search?: string) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const teachers = await this.prisma.teacher.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        identityUserId: { not: null },
        ...(search?.trim()
          ? {
              OR: [
                { firstName: { contains: search.trim(), mode: 'insensitive' } },
                { lastName: { contains: search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 50,
      select: { id: true, firstName: true, lastName: true },
    });
    const active = await this.prisma.dieMemberAssignment.findMany({
      where: { tenantId, removedAt: null },
      select: { teacherId: true },
    });
    const assigned = new Set(active.map((item) => item.teacherId));
    return teachers
      .filter((teacher) => !assigned.has(teacher.id))
      .map((teacher) => ({
        teacherId: teacher.id,
        displayName: `${teacher.firstName} ${teacher.lastName}`,
      }));
  }

  async listMembers(context: AcademicRequestContext) {
    await this.access.require(context);
    return this.prisma.dieMemberAssignment
      .findMany({
        where: { tenantId: context.tenant.tenantId, removedAt: null },
        include: { teacher: true },
        orderBy: [{ role: 'asc' }, { teacher: { lastName: 'asc' } }],
      })
      .then((rows) => rows.map((row) => this.memberView(row)));
  }

  async addMember(context: AcademicRequestContext, input: AddDieMember) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const teacher = await this.prisma.teacher.findUnique({
      where: { tenantId_id: { tenantId, id: input.teacherId } },
    });
    if (!teacher || teacher.status !== 'ACTIVE' || !teacher.identityUserId) {
      this.notFound();
    }
    const verified = await this.identityMemberships.verify(
      context,
      teacher.identityUserId,
    );
    const existing = await this.prisma.dieMemberAssignment.findFirst({
      where: {
        tenantId,
        identityUserId: verified.identityUserId,
        removedAt: null,
      },
    });
    if (existing)
      throw new ConflictException(
        'The user is already an active department member.',
      );
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const member = await tx.dieMemberAssignment.create({
          data: {
            tenantId,
            teacherId: teacher.id,
            identityUserId: verified.identityUserId,
            identityMembershipId: verified.membershipId,
            role: 'MEMBER',
            addedByIdentityUserId: context.principal.identityUserId,
          },
          include: { teacher: true },
        });
        await this.audit(
          tx,
          context,
          'DIE_MEMBER_ADDED',
          'DieMemberAssignment',
          member.id,
          { role: 'MEMBER' },
        );
        return member;
      });
      return this.memberView(created);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException(
          'The user is already an active department member.',
        );
      }
      throw error;
    }
  }

  async updateMemberRole(
    context: AcademicRequestContext,
    memberId: string,
    role: 'MEMBER' | 'COORDINATOR',
  ) {
    const access = await this.access.require(context);
    this.access.requireTenantAdmin(access);
    const tenantId = context.tenant.tenantId;
    const member = await this.activeMember(tenantId, memberId);
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.dieMemberAssignment.update({
          where: { tenantId_id: { tenantId, id: member.id } },
          data: { role },
          include: { teacher: true },
        });
        await this.audit(
          tx,
          context,
          'DIE_MEMBER_ROLE_CHANGED',
          'DieMemberAssignment',
          member.id,
          { role },
        );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.memberView(updated);
  }

  async removeMember(
    context: AcademicRequestContext,
    memberId: string,
    input: RemoveDieMember,
  ): Promise<void> {
    const actor = await this.access.require(context);
    this.access.requireCoordinator(actor);
    const tenantId = context.tenant.tenantId;
    const member = await this.activeMember(tenantId, memberId);
    if (member.role === 'COORDINATOR') this.access.requireTenantAdmin(actor);
    if (member.identityUserId === context.principal.identityUserId) {
      throw new ConflictException(
        'A department member cannot remove their own active assignment.',
      );
    }
    await this.prisma.$transaction(
      async (tx) => {
        const currentMember = await this.activeMemberIn(
          tx,
          tenantId,
          member.id,
        );
        if (currentMember.role === 'COORDINATOR')
          this.access.requireTenantAdmin(actor);
        if (currentMember.identityUserId === context.principal.identityUserId)
          throw new ConflictException(
            'A department member cannot remove their own active assignment.',
          );
        const openCount = await tx.dieAction.count({
          where: {
            tenantId,
            assigneeMemberAssignmentId: currentMember.id,
            status: { in: OPEN_ACTION_STATUSES },
          },
        });
        const activeResponsibilityCount = await tx.dieSupportEpisode.count({
          where: {
            tenantId,
            responsibleMemberAssignmentId: currentMember.id,
            endedAt: null,
          },
        });
        let replacement = null;
        if (openCount > 0 || activeResponsibilityCount > 0) {
          if (!input.reassignToMemberAssignmentId) {
            throw new ConflictException(
              'Open actions and active support responsibilities must be reassigned before removing this member.',
            );
          }
          replacement = await this.activeMemberIn(
            tx,
            tenantId,
            input.reassignToMemberAssignmentId,
          );
          if (replacement.id === currentMember.id)
            throw new BadRequestException(
              'The replacement member must be different.',
            );
        }
        if (replacement) {
          await tx.dieSupportEpisode.updateMany({
            where: {
              tenantId,
              responsibleMemberAssignmentId: currentMember.id,
              endedAt: null,
            },
            data: { responsibleMemberAssignmentId: replacement.id },
          });
          const actions = await tx.dieAction.findMany({
            where: {
              tenantId,
              assigneeMemberAssignmentId: currentMember.id,
              status: { in: OPEN_ACTION_STATUSES },
            },
            select: { id: true },
          });
          const now = new Date();
          for (const action of actions) {
            await tx.dieActionAssignment.updateMany({
              where: { tenantId, actionId: action.id, unassignedAt: null },
              data: { unassignedAt: now },
            });
            await tx.dieAction.update({
              where: { tenantId_id: { tenantId, id: action.id } },
              data: { assigneeMemberAssignmentId: replacement.id },
            });
            await tx.dieActionAssignment.create({
              data: {
                tenantId,
                actionId: action.id,
                memberAssignmentId: replacement.id,
                assignedByIdentityUserId: context.principal.identityUserId,
                reason: 'Reasignación por retiro de miembro DIE.',
              },
            });
          }
        }
        await tx.dieMemberAssignment.update({
          where: { tenantId_id: { tenantId, id: currentMember.id } },
          data: {
            removedAt: new Date(),
            removedByIdentityUserId: context.principal.identityUserId,
            removalReason: input.reason,
          },
        });
        await this.audit(
          tx,
          context,
          'DIE_MEMBER_REMOVED',
          'DieMemberAssignment',
          currentMember.id,
          {
            reassignedActionCount: openCount,
            reassignedActiveResponsibilityCount: activeResponsibilityCount,
          },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listStudents(context: AcademicRequestContext, search?: string) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const episodes = await this.prisma.dieSupportEpisode.findMany({
      where: {
        tenantId,
        ...(search?.trim()
          ? {
              student: {
                OR: [
                  {
                    firstName: {
                      contains: search.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    lastName: {
                      contains: search.trim(),
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            }
          : {}),
      },
      include: { student: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    const byStudent = new Map<string, typeof episodes>();
    for (const episode of episodes) {
      const rows = byStudent.get(episode.studentId) ?? [];
      rows.push(episode);
      byStudent.set(episode.studentId, rows);
    }
    const summaries = [];
    for (const rows of byStudent.values()) {
      const latest = rows[0];
      if (!latest) continue;
      const active = rows.find((row) => row.endedAt === null);
      summaries.push({
        studentId: latest.studentId,
        displayName: `${latest.student.firstName} ${latest.student.lastName}`,
        activeEpisode: active ? this.episodeView(active) : null,
        latestEpisode: this.episodeView(latest),
      });
    }
    return summaries;
  }

  async listStudentCandidates(
    context: AcademicRequestContext,
    search?: string,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const activeEpisodes = await this.prisma.dieSupportEpisode.findMany({
      where: { tenantId, endedAt: null },
      select: { studentId: true },
    });
    const excluded = activeEpisodes.map((row) => row.studentId);
    return this.prisma.student
      .findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          ...(excluded.length ? { id: { notIn: excluded } } : {}),
          ...(search?.trim()
            ? {
                OR: [
                  {
                    firstName: { contains: search.trim(), mode: 'insensitive' },
                  },
                  {
                    lastName: { contains: search.trim(), mode: 'insensitive' },
                  },
                  {
                    courseEnrollments: {
                      some: {
                        status: 'ACTIVE',
                        course: {
                          label: {
                            contains: search.trim(),
                            mode: 'insensitive',
                          },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 50,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          courseEnrollments: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: { course: { select: { label: true } } },
          },
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          studentId: row.id,
          displayName: `${row.firstName} ${row.lastName}`,
          courseLabel: row.courseEnrollments[0]?.course.label ?? null,
        })),
      );
  }

  async startSupport(context: AcademicRequestContext, input: StartDieSupport) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const student = await this.prisma.student.findUnique({
      where: { tenantId_id: { tenantId, id: input.studentId } },
    });
    if (!student || student.status !== 'ACTIVE') this.notFound();
    const academic = await this.captureAcademicContext(
      tenantId,
      input.studentId,
    );
    try {
      const episode = await this.prisma.$transaction(
        async (tx) => {
          if (input.responsibleMemberAssignmentId)
            await this.activeMemberIn(
              tx,
              tenantId,
              input.responsibleMemberAssignmentId,
            );
          const row = await tx.dieSupportEpisode.create({
            data: {
              tenantId,
              studentId: input.studentId,
              startDate: this.date(input.startDate),
              reason: input.reason,
              responsibleMemberAssignmentId:
                input.responsibleMemberAssignmentId ?? null,
              ...academic,
              createdByIdentityUserId: context.principal.identityUserId,
            },
          });
          await this.audit(
            tx,
            context,
            'DIE_SUPPORT_STARTED',
            'DieSupportEpisode',
            row.id,
          );
          return row;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.episodeView(episode);
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException(
          'The student already has an active support episode.',
        );
      throw error;
    }
  }

  async finishSupport(
    context: AcademicRequestContext,
    episodeId: string,
    input: FinishDieSupport,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const episode = await this.prisma.dieSupportEpisode.findUnique({
      where: { tenantId_id: { tenantId, id: episodeId } },
    });
    if (!episode) this.notFound();
    if (episode.endedAt)
      throw new ConflictException('The support episode is already finished.');
    const endDate = this.date(input.endDate);
    if (endDate < episode.startDate)
      throw new BadRequestException(
        'The end date cannot precede the start date.',
      );
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const changed = await tx.dieSupportEpisode.updateMany({
          where: { tenantId, id: episode.id, endedAt: null },
          data: {
            endedAt: endDate,
            endReason: input.reason,
            endedByIdentityUserId: context.principal.identityUserId,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'The support episode is already finished.',
          );
        const row = await tx.dieSupportEpisode.findUniqueOrThrow({
          where: { tenantId_id: { tenantId, id: episode.id } },
        });
        await this.audit(
          tx,
          context,
          'DIE_SUPPORT_FINISHED',
          'DieSupportEpisode',
          row.id,
        );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.episodeView(updated);
  }

  async listEpisodes(context: AcademicRequestContext, studentId: string) {
    await this.access.require(context);
    return this.prisma.dieSupportEpisode
      .findMany({
        where: { tenantId: context.tenant.tenantId, studentId },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      })
      .then((rows) => rows.map((row) => this.episodeView(row)));
  }

  async createJournalEntry(
    context: AcademicRequestContext,
    input: CreateDieJournalEntry,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const episode = await this.prisma.dieSupportEpisode.findUnique({
      where: { tenantId_id: { tenantId, id: input.supportEpisodeId } },
    });
    if (!episode || episode.studentId !== input.studentId) this.notFound();
    if (episode.endedAt)
      throw new ConflictException(
        'New journal entries require an active support episode.',
      );
    const academic = await this.captureAcademicContext(
      tenantId,
      input.studentId,
    );
    const eventTimeZone = input.eventTime
      ? await this.tenantProfiles.requireTimeZone(tenantId)
      : null;
    const entry = await this.prisma.$transaction(
      async (tx) => {
        const currentEpisode = await tx.dieSupportEpisode.findUnique({
          where: {
            tenantId_id: { tenantId, id: input.supportEpisodeId },
          },
        });
        if (!currentEpisode || currentEpisode.studentId !== input.studentId)
          this.notFound();
        if (currentEpisode.endedAt)
          throw new ConflictException(
            'New journal entries require an active support episode.',
          );
        const row = await tx.dieJournalEntry.create({
          data: {
            tenantId,
            studentId: input.studentId,
            supportEpisodeId: input.supportEpisodeId,
            originalAuthorIdentityUserId: context.principal.identityUserId,
          },
        });
        await tx.dieJournalRevision.create({
          data: {
            tenantId,
            journalEntryId: row.id,
            revisionNumber: 1,
            ...this.revisionData(input, academic, eventTimeZone),
            correctedByIdentityUserId: context.principal.identityUserId,
          },
        });
        await this.audit(
          tx,
          context,
          'DIE_JOURNAL_ENTRY_CREATED',
          'DieJournalEntry',
          row.id,
          { category: input.category },
        );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getJournalEntry(context, entry.id);
  }

  async listJournal(
    context: AcademicRequestContext,
    studentId: string,
    filters: JournalFilters,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const entries = await this.prisma.dieJournalEntry.findMany({
      where: {
        tenantId,
        studentId,
        ...(!filters.includeVoided ? { status: 'CURRENT' } : {}),
        ...(filters.authorIdentityUserId
          ? { originalAuthorIdentityUserId: filters.authorIdentityUserId }
          : {}),
        revisions: {
          some: {
            ...(filters.category
              ? { category: filters.category as never }
              : {}),
            ...(filters.from || filters.to
              ? {
                  eventDate: {
                    ...(filters.from ? { gte: this.date(filters.from) } : {}),
                    ...(filters.to ? { lte: this.date(filters.to) } : {}),
                  },
                }
              : {}),
          },
        },
      },
      include: {
        revisions: { orderBy: { revisionNumber: 'asc' } },
        fileReferences: { include: { fileObject: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return entries
      .map((entry) => this.journalView(entry))
      .filter((entry) => {
        const current = entry.current;
        return (
          (!filters.category || current.category === filters.category) &&
          (!filters.from || current.eventDate >= filters.from) &&
          (!filters.to || current.eventDate <= filters.to)
        );
      });
  }

  async getJournalEntry(context: AcademicRequestContext, entryId: string) {
    await this.access.require(context);
    const entry = await this.prisma.dieJournalEntry.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenant.tenantId, id: entryId },
      },
      include: {
        revisions: { orderBy: { revisionNumber: 'asc' } },
        fileReferences: { include: { fileObject: true } },
      },
    });
    if (!entry) this.notFound();
    return this.journalView(entry);
  }

  async correctJournalEntry(
    context: AcademicRequestContext,
    entryId: string,
    input: CorrectDieJournalEntry,
  ) {
    const access = await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const entry = await this.prisma.dieJournalEntry.findUnique({
      where: { tenantId_id: { tenantId, id: entryId } },
      include: { revisions: true },
    });
    if (!entry) this.notFound();
    if (entry.status === 'VOIDED')
      throw new ConflictException('A voided entry cannot be corrected.');
    const own =
      entry.originalAuthorIdentityUserId === context.principal.identityUserId;
    if (!own) {
      this.access.requireCoordinator(access);
      if (!input.reason?.trim())
        throw new BadRequestException(
          'A correction reason is required when correcting another author.',
        );
    }
    const previous = entry.revisions.find(
      (revision) => revision.revisionNumber === entry.currentRevisionNumber,
    );
    if (!previous)
      throw new ConflictException(
        'The current journal revision is unavailable.',
      );
    const academic = {
      academicYearId: previous.academicYearId,
      courseId: previous.courseId,
      academicYearLabel: previous.academicYearLabel,
      courseLabel: previous.courseLabel,
    };
    const previousTime =
      previous.eventTimeMinutes === null
        ? null
        : this.timeString(previous.eventTimeMinutes);
    const eventTimeZone =
      input.eventTime === null
        ? null
        : input.eventTime === previousTime && previous.eventTimeZone
          ? previous.eventTimeZone
          : await this.tenantProfiles.requireTimeZone(tenantId);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.dieJournalEntry.findUniqueOrThrow({
            where: { tenantId_id: { tenantId, id: entry.id } },
          });
          const next = current.currentRevisionNumber + 1;
          await tx.dieJournalRevision.create({
            data: {
              tenantId,
              journalEntryId: entry.id,
              revisionNumber: next,
              ...this.revisionData(input, academic, eventTimeZone),
              correctedByIdentityUserId: context.principal.identityUserId,
              correctionReason: input.reason,
            },
          });
          await tx.dieJournalEntry.update({
            where: { tenantId_id: { tenantId, id: entry.id } },
            data: { currentRevisionNumber: next },
          });
          await this.audit(
            tx,
            context,
            'DIE_JOURNAL_ENTRY_CORRECTED',
            'DieJournalEntry',
            entry.id,
            { revisionNumber: next, correctedOtherAuthor: !own },
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isUniqueConflict(error) || this.isSerializationFailure(error)) {
        throw new ConflictException(
          'The entry changed concurrently. Reload it before correcting again.',
        );
      }
      throw error;
    }
    return this.getJournalEntry(context, entry.id);
  }

  async voidJournalEntry(
    context: AcademicRequestContext,
    entryId: string,
    reason: string,
  ) {
    const access = await this.access.require(context);
    this.access.requireCoordinator(access);
    const tenantId = context.tenant.tenantId;
    const entry = await this.prisma.dieJournalEntry.findUnique({
      where: { tenantId_id: { tenantId, id: entryId } },
    });
    if (!entry) this.notFound();
    if (entry.status === 'VOIDED')
      throw new ConflictException('The entry is already voided.');
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.dieJournalEntry.updateMany({
        where: { tenantId, id: entry.id, status: 'CURRENT' },
        data: {
          status: 'VOIDED',
          voidReason: reason,
          voidedAt: new Date(),
          voidedByIdentityUserId: context.principal.identityUserId,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('The entry is already voided.');
      await this.audit(
        tx,
        context,
        'DIE_JOURNAL_ENTRY_VOIDED',
        'DieJournalEntry',
        entry.id,
      );
    });
    return this.getJournalEntry(context, entry.id);
  }

  async createAction(context: AcademicRequestContext, input: CreateDieAction) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const student = await this.prisma.student.findUnique({
      where: { tenantId_id: { tenantId, id: input.studentId } },
    });
    if (!student) this.notFound();
    if (input.journalEntryId) {
      const entry = await this.prisma.dieJournalEntry.findUnique({
        where: { tenantId_id: { tenantId, id: input.journalEntryId } },
      });
      if (!entry || entry.studentId !== input.studentId) this.notFound();
    }
    const action = await this.prisma.$transaction(
      async (tx) => {
        const assignee = await this.activeMemberIn(
          tx,
          tenantId,
          input.assigneeMemberAssignmentId,
        );
        const row = await tx.dieAction.create({
          data: {
            tenantId,
            studentId: input.studentId,
            journalEntryId: input.journalEntryId ?? null,
            title: input.title,
            description: input.description ?? null,
            assigneeMemberAssignmentId: assignee.id,
            dueDate: input.dueDate ? this.date(input.dueDate) : null,
            createdByIdentityUserId: context.principal.identityUserId,
          },
        });
        await tx.dieActionAssignment.create({
          data: {
            tenantId,
            actionId: row.id,
            memberAssignmentId: assignee.id,
            assignedByIdentityUserId: context.principal.identityUserId,
          },
        });
        await this.audit(
          tx,
          context,
          'DIE_ACTION_CREATED',
          'DieAction',
          row.id,
        );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.actionView(
      action,
      await this.tenantProfiles.today(context.tenant.tenantId),
    );
  }

  async listActions(context: AcademicRequestContext, filters: ActionFilters) {
    const access = await this.access.require(context);
    const assignee = filters.mine
      ? access.member?.id
      : filters.assigneeMemberAssignmentId;
    if (filters.mine && !assignee) return [];
    const today = await this.tenantProfiles.today(context.tenant.tenantId);
    if (filters.overdue && !today)
      throw new ConflictException({
        code: 'TENANT_TIME_ZONE_REQUIRED',
        message:
          'Configure the tenant time zone before filtering overdue actions.',
      });
    const rows = await this.prisma.dieAction.findMany({
      where: {
        tenantId: context.tenant.tenantId,
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...(assignee ? { assigneeMemberAssignmentId: assignee } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.overdue
          ? {
              dueDate: { lt: this.date(today!) },
              status: { in: OPEN_ACTION_STATUSES },
            }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.actionView(row, today));
  }

  async updateAction(
    context: AcademicRequestContext,
    actionId: string,
    input: UpdateDieAction,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const action = await this.prisma.dieAction.findUnique({
      where: { tenantId_id: { tenantId, id: actionId } },
    });
    if (!action) this.notFound();
    const status = input.status ?? action.status;
    if (status === 'COMPLETED' && !input.result?.trim() && !action.result)
      throw new BadRequestException('A completion result is required.');
    if (
      status === 'CANCELLED' &&
      !input.cancellationReason?.trim() &&
      !action.cancellationReason
    )
      throw new BadRequestException('A cancellation reason is required.');
    if (status !== 'COMPLETED' && input.result)
      throw new BadRequestException(
        'A result is only valid for a completed action.',
      );
    if (status !== 'CANCELLED' && input.cancellationReason)
      throw new BadRequestException(
        'A cancellation reason is only valid for a cancelled action.',
      );
    const closed = status === 'COMPLETED' || status === 'CANCELLED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dieAction.update({
        where: { tenantId_id: { tenantId, id: action.id } },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.dueDate !== undefined
            ? {
                dueDate:
                  input.dueDate === null ? null : this.date(input.dueDate),
              }
            : {}),
          status,
          result:
            status === 'COMPLETED' ? (input.result ?? action.result) : null,
          cancellationReason:
            status === 'CANCELLED'
              ? (input.cancellationReason ?? action.cancellationReason)
              : null,
          closedAt: closed ? (action.closedAt ?? new Date()) : null,
          completedOrCancelledByIdentityUserId: closed
            ? context.principal.identityUserId
            : null,
        },
      });
      await this.audit(tx, context, 'DIE_ACTION_UPDATED', 'DieAction', row.id, {
        status,
      });
      return row;
    });
    return this.actionView(
      updated,
      await this.tenantProfiles.today(context.tenant.tenantId),
    );
  }

  async reassignAction(
    context: AcademicRequestContext,
    actionId: string,
    input: ReassignDieAction,
  ) {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const action = await this.prisma.dieAction.findUnique({
      where: { tenantId_id: { tenantId, id: actionId } },
    });
    if (!action) this.notFound();
    if (!OPEN_ACTION_STATUSES.includes(action.status))
      throw new ConflictException('Closed actions cannot be reassigned.');
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const currentAction = await tx.dieAction.findUnique({
          where: { tenantId_id: { tenantId, id: action.id } },
        });
        if (!currentAction) this.notFound();
        if (!OPEN_ACTION_STATUSES.includes(currentAction.status))
          throw new ConflictException('Closed actions cannot be reassigned.');
        const assignee = await this.activeMemberIn(
          tx,
          tenantId,
          input.assigneeMemberAssignmentId,
        );
        if (assignee.id === currentAction.assigneeMemberAssignmentId)
          throw new BadRequestException(
            'The action is already assigned to this member.',
          );
        const now = new Date();
        await tx.dieActionAssignment.updateMany({
          where: { tenantId, actionId: action.id, unassignedAt: null },
          data: { unassignedAt: now },
        });
        const row = await tx.dieAction.update({
          where: { tenantId_id: { tenantId, id: action.id } },
          data: { assigneeMemberAssignmentId: assignee.id },
        });
        await tx.dieActionAssignment.create({
          data: {
            tenantId,
            actionId: action.id,
            memberAssignmentId: assignee.id,
            assignedByIdentityUserId: context.principal.identityUserId,
            reason: input.reason,
          },
        });
        await this.audit(
          tx,
          context,
          'DIE_ACTION_REASSIGNED',
          'DieAction',
          row.id,
        );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.actionView(
      updated,
      await this.tenantProfiles.today(context.tenant.tenantId),
    );
  }

  async exportStudentPdf(
    context: AcademicRequestContext,
    studentId: string,
    filters: JournalFilters,
  ): Promise<Buffer> {
    await this.access.require(context);
    const tenantId = context.tenant.tenantId;
    const operationalProfile = await this.tenantProfiles.get(context);
    if (!operationalProfile.institutionDisplayName)
      throw new ConflictException({
        code: 'TENANT_OPERATIONAL_PROFILE_INCOMPLETE',
        message: 'Configure the institutional name before exporting a DIE PDF.',
      });
    const student = await this.prisma.student.findUnique({
      where: { tenantId_id: { tenantId, id: studentId } },
    });
    if (!student) this.notFound();
    const [entries, actions] = await Promise.all([
      this.listJournal(context, studentId, filters),
      this.listActions(context, { studentId }),
    ]);
    const generatedAt = new Date();
    const document = new PDFDocument({
      bufferPages: true,
      compress: false,
      margins: { bottom: 80, left: 48, right: 48, top: 48 },
      size: 'A4',
      info: { Title: 'Hoja de vida DIE', Author: 'EduPay Académico' },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#1d2f70')
      .text('Hoja de vida - Inclusión Educativa');
    document.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#263149');
    document.text(
      `Institución: ${this.safePdfText(operationalProfile.institutionDisplayName)}`,
    );
    document.text(
      `Zona operativa actual: ${this.safePdfText(operationalProfile.timeZone ?? 'no configurada')}`,
    );
    document.text(
      `Alumno: ${this.safePdfText(`${student.firstName} ${student.lastName}`)}`,
    );
    document.text(
      `Período: ${filters.from ?? 'inicio'} a ${filters.to ?? 'actualidad'}`,
    );
    document.text(
      `Filtros: categoría ${filters.category ?? 'todas'}; autor ${filters.authorIdentityUserId ?? 'todos'}; anulados ${filters.includeVoided ? 'incluidos' : 'excluidos'}`,
    );
    document.text(
      `Generado: ${generatedAt.toISOString()} por ${context.principal.identityUserId}`,
    );
    document.moveDown();
    document.font('Helvetica-Bold').fontSize(13).text('Registros');
    if (entries.length === 0)
      document
        .font('Helvetica')
        .fontSize(10)
        .text('No hay registros para los filtros aplicados.');
    for (const entry of entries) {
      const revision = entry.current;
      document
        .moveDown(0.6)
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(entry.status === 'VOIDED' ? '#b1444b' : '#263149');
      document.text(
        `${revision.eventDate}${revision.eventTime ? ` ${revision.eventTime}${revision.eventTimeApproximate ? ' aprox.' : ''} (${this.safePdfText(revision.eventTimeZone ?? 'zona no informada')})` : ''} - ${this.safePdfText(revision.title)}${entry.status === 'VOIDED' ? ' [ANULADO]' : ''}`,
      );
      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#526777')
        .text(
          `Categoría: ${revision.category} | Autor original: ${entry.originalAuthorIdentityUserId} | Creado: ${entry.createdAt}`,
        );
      if (
        revision.academicContext.courseLabel ||
        revision.academicContext.academicYearLabel
      )
        document.text(
          `Contexto: ${this.safePdfText(revision.academicContext.courseLabel ?? 'sin curso')} / ${this.safePdfText(revision.academicContext.academicYearLabel ?? 'sin año')}`,
        );
      document
        .fontSize(10)
        .fillColor('#263149')
        .text(this.safePdfText(revision.description));
      if (revision.immediateAction)
        document.text(
          `Actuación inmediata: ${this.safePdfText(revision.immediateAction)}`,
        );
      if (entry.status === 'VOIDED')
        document.text(
          `Motivo de anulación: ${this.safePdfText(entry.voidReason ?? '')}`,
        );
      if (entry.attachments.length)
        document.text(
          `Adjuntos: ${entry.attachments.map((file) => this.safePdfText(file.filename)).join(', ')}`,
        );
    }
    document.addPage();
    document
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#1d2f70')
      .text('Acciones relacionadas');
    if (!actions.length)
      document
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#263149')
        .text('No hay acciones registradas.');
    for (const action of actions) {
      document
        .moveDown(0.5)
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#263149')
        .text(this.safePdfText(action.title));
      document
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Estado: ${action.status} | Vencimiento: ${action.dueDate ?? 'sin fecha'}${action.overdue === true ? ' | VENCIDA' : action.overdue === null && action.dueDate ? ' | VENCIMIENTO NO EVALUADO: zona no configurada' : ''}`,
        );
      if (action.description)
        document.text(this.safePdfText(action.description));
      if (action.result)
        document.text(`Resultado: ${this.safePdfText(action.result)}`);
      if (action.cancellationReason)
        document.text(
          `Cancelación: ${this.safePdfText(action.cancellationReason)}`,
        );
    }
    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(index);
      const contentBottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#5f687b')
        .text(
          `EduPay Académico - DIE | Página ${index + 1} de ${pages.count}`,
          48,
          810,
          { align: 'center', lineBreak: false, width: 499 },
        );
      document.page.margins.bottom = contentBottomMargin;
    }
    document.end();
    const pdf = await complete;
    await this.prisma.$transaction(async (tx) => {
      await this.audit(
        tx,
        context,
        'DIE_STUDENT_PDF_EXPORTED',
        'Student',
        studentId,
        {
          recordCount: entries.length,
          actionCount: actions.length,
          includedVoided: Boolean(filters.includeVoided),
        },
      );
    });
    return pdf;
  }

  private async activeMember(tenantId: string, id: string) {
    const member = await this.prisma.dieMemberAssignment.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!member || member.removedAt) this.notFound();
    return member;
  }

  private async activeMemberIn(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const member = await tx.dieMemberAssignment.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!member || member.removedAt) this.notFound();
    return member;
  }

  private async captureAcademicContext(
    tenantId: string,
    studentId: string,
  ): Promise<AcademicSnapshot> {
    const enrollment = await this.prisma.courseEnrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
      include: { course: { include: { academicYear: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return enrollment
      ? {
          academicYearId: enrollment.course.academicYearId,
          courseId: enrollment.courseId,
          academicYearLabel: enrollment.course.academicYear.label,
          courseLabel: enrollment.course.label,
        }
      : {
          academicYearId: null,
          courseId: null,
          academicYearLabel: null,
          courseLabel: null,
        };
  }

  private revisionData(
    input: Omit<CreateDieJournalEntry, 'studentId' | 'supportEpisodeId'>,
    academic: AcademicSnapshot,
    eventTimeZone: string | null,
  ) {
    return {
      category: input.category,
      eventDate: this.date(input.eventDate),
      eventTimeMinutes: input.eventTime
        ? this.timeMinutes(input.eventTime)
        : null,
      eventTimeApproximate: input.eventTimeApproximate,
      eventTimeZone,
      place: input.place,
      title: input.title,
      description: input.description,
      immediateAction: input.immediateAction,
      informationSource: input.informationSource,
      thirdPartySource: input.thirdPartySource,
      ...academic,
    };
  }

  private memberView(row: {
    id: string;
    teacherId: string;
    identityUserId: string;
    role: 'MEMBER' | 'COORDINATOR';
    addedAt: Date;
    teacher: { firstName: string; lastName: string };
  }) {
    return {
      id: row.id,
      teacherId: row.teacherId,
      identityUserId: row.identityUserId,
      displayName: `${row.teacher.firstName} ${row.teacher.lastName}`,
      role: row.role,
      addedAt: row.addedAt.toISOString(),
    };
  }

  private episodeView(row: {
    id: string;
    studentId: string;
    startDate: Date;
    reason: string;
    responsibleMemberAssignmentId: string | null;
    endedAt: Date | null;
    endReason: string | null;
    academicYearId: string | null;
    courseId: string | null;
    academicYearLabel: string | null;
    courseLabel: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      studentId: row.studentId,
      startDate: this.dateString(row.startDate),
      reason: row.reason,
      responsibleMemberAssignmentId: row.responsibleMemberAssignmentId,
      status: row.endedAt ? ('FINISHED' as const) : ('ACTIVE' as const),
      endDate: row.endedAt ? this.dateString(row.endedAt) : null,
      endReason: row.endReason,
      academicContext: {
        academicYearId: row.academicYearId,
        academicYearLabel: row.academicYearLabel,
        courseId: row.courseId,
        courseLabel: row.courseLabel,
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  private journalView(entry: {
    id: string;
    studentId: string;
    supportEpisodeId: string;
    originalAuthorIdentityUserId: string;
    currentRevisionNumber: number;
    status: 'CURRENT' | 'VOIDED';
    voidReason: string | null;
    voidedByIdentityUserId: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    revisions: Array<{
      revisionNumber: number;
      category: string;
      eventDate: Date;
      eventTimeMinutes: number | null;
      eventTimeApproximate: boolean;
      eventTimeZone: string | null;
      place: string | null;
      title: string;
      description: string;
      immediateAction: string | null;
      informationSource: string;
      thirdPartySource: string | null;
      academicYearId: string | null;
      academicYearLabel: string | null;
      courseId: string | null;
      courseLabel: string | null;
      correctedByIdentityUserId: string;
      correctionReason: string | null;
      createdAt: Date;
    }>;
    fileReferences: Array<{
      id: string;
      fileObjectId: string;
      createdAt: Date;
      fileObject: {
        normalizedFilename: string;
        authoritativeSizeBytes: bigint;
        detectedMime: string;
      };
    }>;
  }) {
    const revisions = entry.revisions.map((revision) => ({
      revisionNumber: revision.revisionNumber,
      category: revision.category,
      eventDate: this.dateString(revision.eventDate),
      eventTime:
        revision.eventTimeMinutes === null
          ? null
          : this.timeString(revision.eventTimeMinutes),
      eventTimeApproximate: revision.eventTimeApproximate,
      eventTimeZone: revision.eventTimeZone,
      place: revision.place,
      title: revision.title,
      description: revision.description,
      immediateAction: revision.immediateAction,
      informationSource: revision.informationSource,
      thirdPartySource: revision.thirdPartySource,
      academicContext: {
        academicYearId: revision.academicYearId,
        academicYearLabel: revision.academicYearLabel,
        courseId: revision.courseId,
        courseLabel: revision.courseLabel,
      },
      correctedByIdentityUserId: revision.correctedByIdentityUserId,
      correctionReason: revision.correctionReason,
      createdAt: revision.createdAt.toISOString(),
    }));
    const current = revisions.find(
      (revision) => revision.revisionNumber === entry.currentRevisionNumber,
    );
    if (!current)
      throw new ConflictException(
        'The current journal revision is unavailable.',
      );
    return {
      id: entry.id,
      studentId: entry.studentId,
      supportEpisodeId: entry.supportEpisodeId,
      originalAuthorIdentityUserId: entry.originalAuthorIdentityUserId,
      status: entry.status,
      voidReason: entry.voidReason,
      voidedByIdentityUserId: entry.voidedByIdentityUserId,
      voidedAt: entry.voidedAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      current,
      revisions,
      attachments: entry.fileReferences.map((reference) => ({
        id: reference.id,
        fileObjectId: reference.fileObjectId,
        filename: reference.fileObject.normalizedFilename,
        sizeBytes: Number(reference.fileObject.authoritativeSizeBytes),
        detectedMime: reference.fileObject.detectedMime,
        createdAt: reference.createdAt.toISOString(),
      })),
    };
  }

  private actionView(
    row: {
      id: string;
      studentId: string;
      journalEntryId: string | null;
      title: string;
      description: string | null;
      assigneeMemberAssignmentId: string;
      dueDate: Date | null;
      status: DieActionStatus;
      result: string | null;
      cancellationReason: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    today?: string | null,
  ) {
    const dueDate = row.dueDate ? this.dateString(row.dueDate) : null;
    return {
      id: row.id,
      studentId: row.studentId,
      journalEntryId: row.journalEntryId,
      title: row.title,
      description: row.description,
      assigneeMemberAssignmentId: row.assigneeMemberAssignmentId,
      dueDate,
      status: row.status,
      result: row.result,
      cancellationReason: row.cancellationReason,
      overdue:
        dueDate === null || !OPEN_ACTION_STATUSES.includes(row.status)
          ? false
          : today === undefined || today === null
            ? null
            : dueDate < today,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: AcademicRequestContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, string | number | boolean>,
  ) {
    await tx.dieAuditEvent.create({
      data: {
        tenantId: context.tenant.tenantId,
        action,
        actorIdentityUserId: context.principal.identityUserId,
        membershipId: context.tenant.membershipId,
        resourceType,
        resourceId,
        requestId: context.requestId,
        ...(metadata ? { metadata } : {}),
      },
    });
  }

  private date(value: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
      throw new BadRequestException('An invalid date was provided.');
    return parsed;
  }
  private dateString(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
  private timeMinutes(value: string): number {
    const [hours = 0, minutes = 0] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }
  private timeString(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }
  private safePdfText(value: string): string {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
  private isSerializationFailure(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
  private notFound(): never {
    throw new NotFoundException('The requested resource was not found.');
  }
}
