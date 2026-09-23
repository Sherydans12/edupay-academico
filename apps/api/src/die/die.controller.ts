import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  addDieMemberSchema,
  correctDieJournalEntrySchema,
  createDieActionSchema,
  createDieJournalEntrySchema,
  createDieUploadIntentSchema,
  dieActionSchema,
  dieAccessSchema,
  dieJournalEntrySchema,
  dieMemberSchema,
  dieStudentSummarySchema,
  dieStudentCandidateSchema,
  dieSupportEpisodeSchema,
  dieUploadIntentSchema,
  finishDieSupportSchema,
  reassignDieActionSchema,
  removeDieMemberSchema,
  startDieSupportSchema,
  updateDieActionSchema,
  updateDieMemberRoleSchema,
  voidDieJournalEntrySchema,
  type AddDieMember,
  type CorrectDieJournalEntry,
  type CreateDieAction,
  type CreateDieJournalEntry,
  type CreateDieUploadIntent,
  type FinishDieSupport,
  type ReassignDieAction,
  type RemoveDieMember,
  type StartDieSupport,
  type UpdateDieAction,
} from '@edupay/contracts';

import type { AcademicRequestContext } from '../academic/academic-context';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { TenantCapability } from '../authorization/authorization.types';
import {
  ContractBody,
  ContractResponse,
} from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { DieService } from './die.service';
import { StorageService } from '../storage/storage.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('die')
@RequireCapabilities(TenantCapability.AccessTenant)
export class DieController {
  constructor(
    private readonly die: DieService,
    private readonly current: CurrentRequestContext,
    private readonly storage: StorageService,
  ) {}

  @Get('access')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieAccessSchema)
  async access() {
    await this.die.listMembers(this.context());
    return { allowed: true };
  }

  @Get('members')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieMemberSchema.array())
  members() {
    return this.die.listMembers(this.context());
  }

  @Post('members')
  @ContractBody(addDieMemberSchema)
  @ContractResponse(dieMemberSchema)
  addMember(
    @Body(new ZodValidationPipe(addDieMemberSchema)) input: AddDieMember,
  ) {
    return this.die.addMember(this.context(), input);
  }

  @Patch('members/:memberId/role')
  @ContractBody(updateDieMemberRoleSchema)
  @ContractResponse(dieMemberSchema)
  updateRole(
    @Param('memberId', uuid) memberId: string,
    @Body(new ZodValidationPipe(updateDieMemberRoleSchema))
    input: { role: 'MEMBER' | 'COORDINATOR' },
  ) {
    return this.die.updateMemberRole(this.context(), memberId, input.role);
  }

  @Post('members/:memberId/remove')
  @ContractBody(removeDieMemberSchema)
  async removeMember(
    @Param('memberId', uuid) memberId: string,
    @Body(new ZodValidationPipe(removeDieMemberSchema)) input: RemoveDieMember,
  ) {
    await this.die.removeMember(this.context(), memberId, input);
    return { removed: true };
  }

  @Get('student-candidates')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieStudentCandidateSchema.array())
  studentCandidates(@Query('search') search?: string) {
    return this.die.listStudentCandidates(this.context(), search);
  }

  @Get('students')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieStudentSummarySchema.array())
  students(@Query('search') search?: string) {
    return this.die.listStudents(this.context(), search);
  }

  @Post('support-episodes')
  @ContractBody(startDieSupportSchema)
  @ContractResponse(dieSupportEpisodeSchema)
  startSupport(
    @Body(new ZodValidationPipe(startDieSupportSchema)) input: StartDieSupport,
  ) {
    return this.die.startSupport(this.context(), input);
  }

  @Get('students/:studentId/support-episodes')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieSupportEpisodeSchema.array())
  episodes(@Param('studentId', uuid) studentId: string) {
    return this.die.listEpisodes(this.context(), studentId);
  }

  @Post('support-episodes/:episodeId/finish')
  @ContractBody(finishDieSupportSchema)
  @ContractResponse(dieSupportEpisodeSchema)
  finishSupport(
    @Param('episodeId', uuid) episodeId: string,
    @Body(new ZodValidationPipe(finishDieSupportSchema))
    input: FinishDieSupport,
  ) {
    return this.die.finishSupport(this.context(), episodeId, input);
  }

  @Post('journal-entries')
  @ContractBody(createDieJournalEntrySchema)
  @ContractResponse(dieJournalEntrySchema)
  createEntry(
    @Body(new ZodValidationPipe(createDieJournalEntrySchema))
    input: CreateDieJournalEntry,
  ) {
    return this.die.createJournalEntry(this.context(), input);
  }

  @Get('students/:studentId/journal')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieJournalEntrySchema.array())
  journal(
    @Param('studentId', uuid) studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('authorIdentityUserId') authorIdentityUserId?: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    return this.die.listJournal(this.context(), studentId, {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(category ? { category } : {}),
      ...(authorIdentityUserId ? { authorIdentityUserId } : {}),
      includeVoided: includeVoided === 'true',
    });
  }

  @Get('journal-entries/:entryId')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieJournalEntrySchema)
  entry(@Param('entryId', uuid) entryId: string) {
    return this.die.getJournalEntry(this.context(), entryId);
  }

  @Patch('journal-entries/:entryId')
  @ContractBody(correctDieJournalEntrySchema)
  @ContractResponse(dieJournalEntrySchema)
  correctEntry(
    @Param('entryId', uuid) entryId: string,
    @Body(new ZodValidationPipe(correctDieJournalEntrySchema))
    input: CorrectDieJournalEntry,
  ) {
    return this.die.correctJournalEntry(this.context(), entryId, input);
  }

  @Post('journal-entries/:entryId/void')
  @ContractBody(voidDieJournalEntrySchema)
  @ContractResponse(dieJournalEntrySchema)
  voidEntry(
    @Param('entryId', uuid) entryId: string,
    @Body(new ZodValidationPipe(voidDieJournalEntrySchema))
    input: { reason: string },
  ) {
    return this.die.voidJournalEntry(this.context(), entryId, input.reason);
  }

  @Post('journal-entries/:entryId/upload-intents')
  @ContractBody(createDieUploadIntentSchema)
  @ContractResponse(dieUploadIntentSchema)
  createAttachmentIntent(
    @Param('entryId', uuid) entryId: string,
    @Body(new ZodValidationPipe(createDieUploadIntentSchema))
    input: CreateDieUploadIntent,
  ) {
    return this.storage.createDieUploadIntent(this.context(), entryId, input);
  }

  @Post('actions')
  @ContractBody(createDieActionSchema)
  @ContractResponse(dieActionSchema)
  createAction(
    @Body(new ZodValidationPipe(createDieActionSchema)) input: CreateDieAction,
  ) {
    return this.die.createAction(this.context(), input);
  }

  @Get('actions')
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(dieActionSchema.array())
  actions(
    @Query('studentId') studentId?: string,
    @Query('assigneeMemberAssignmentId') assigneeMemberAssignmentId?: string,
    @Query('status')
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    @Query('overdue') overdue?: string,
    @Query('mine') mine?: string,
  ) {
    return this.die.listActions(this.context(), {
      ...(studentId ? { studentId } : {}),
      ...(assigneeMemberAssignmentId ? { assigneeMemberAssignmentId } : {}),
      ...(status ? { status } : {}),
      overdue: overdue === 'true',
      mine: mine === 'true',
    });
  }

  @Patch('actions/:actionId')
  @ContractBody(updateDieActionSchema)
  @ContractResponse(dieActionSchema)
  updateAction(
    @Param('actionId', uuid) actionId: string,
    @Body(new ZodValidationPipe(updateDieActionSchema)) input: UpdateDieAction,
  ) {
    return this.die.updateAction(this.context(), actionId, input);
  }

  @Post('actions/:actionId/reassign')
  @ContractBody(reassignDieActionSchema)
  @ContractResponse(dieActionSchema)
  reassignAction(
    @Param('actionId', uuid) actionId: string,
    @Body(new ZodValidationPipe(reassignDieActionSchema))
    input: ReassignDieAction,
  ) {
    return this.die.reassignAction(this.context(), actionId, input);
  }

  @Get('students/:studentId/export.pdf')
  async exportPdf(
    @Param('studentId', uuid) studentId: string,
    @Res() response: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('authorIdentityUserId') authorIdentityUserId?: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    const pdf = await this.die.exportStudentPdf(this.context(), studentId, {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(category ? { category } : {}),
      ...(authorIdentityUserId ? { authorIdentityUserId } : {}),
      includeVoided: includeVoided === 'true',
    });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(pdf.length));
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="hoja-de-vida-die.pdf"',
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(pdf);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      tenant: this.current.tenant(),
      requestId: this.current.requestId(),
    };
  }
}
