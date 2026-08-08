import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  academicYearPageSchema,
  academicYearSchema,
  assignCourseSubjectTeachersSchema,
  courseEnrollmentSchema,
  courseListQuerySchema,
  coursePageSchema,
  courseRosterItemSchema,
  courseSchema,
  courseSubjectListQuerySchema,
  courseSubjectPageSchema,
  courseSubjectRosterItemSchema,
  courseSubjectSchema,
  courseSubjectTeacherSchema,
  createAcademicYearSchema,
  createCourseEnrollmentSchema,
  createCourseSchema,
  createCourseSubjectSchema,
  createStudentSchema,
  createStudentSubjectEnrollmentSchema,
  createSubjectSchema,
  createTeacherSchema,
  cursorQuerySchema,
  personListQuerySchema,
  studentPageSchema,
  studentSchema,
  studentSubjectEnrollmentSchema,
  subjectListQuerySchema,
  subjectPageSchema,
  subjectSchema,
  teacherPageSchema,
  teacherSchema,
  tenantSchema,
  updateAcademicYearSchema,
  updateCourseSchema,
  updateCourseSubjectSchema,
  updateStudentSchema,
  updateSubjectSchema,
  updateTeacherSchema,
  verifiedIdentityLinkSchema,
  type AssignCourseSubjectTeachers,
  type CourseListQuery,
  type CourseSubjectListQuery,
  type CreateAcademicYear,
  type CreateCourse,
  type CreateCourseEnrollment,
  type CreateCourseSubject,
  type CreateStudent,
  type CreateStudentSubjectEnrollment,
  type CreateSubject,
  type CreateTeacher,
  type CursorQuery,
  type PersonListQuery,
  type SubjectListQuery,
  type UpdateAcademicYear,
  type UpdateCourse,
  type UpdateCourseSubject,
  type UpdateStudent,
  type UpdateSubject,
  type UpdateTeacher,
  type VerifiedIdentityLink,
} from '@edupay/contracts';

import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { TenantCapability } from '../authorization/authorization.types';
import {
  ContractBody,
  ContractResponse,
} from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { RequireCurrentIdentityStatus } from '../identity/require-current-identity-status.decorator';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import type { AcademicRequestContext } from './academic-context';
import { AcademicService } from './academic.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Academic administration')
@Controller()
@RequireCapabilities(TenantCapability.AdministerAcademicStructure)
export class AcademicAdminController {
  constructor(
    private readonly academics: AcademicService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('tenant')
  @ContractResponse(tenantSchema)
  tenant(): Promise<object> {
    return this.academics.currentTenant(this.context());
  }

  @Post('academic-years')
  @ContractBody(createAcademicYearSchema)
  @ContractResponse(academicYearSchema)
  createAcademicYear(
    @Body(new ZodValidationPipe(createAcademicYearSchema))
    input: CreateAcademicYear,
  ): Promise<object> {
    return this.academics.createAcademicYear(this.context(), input);
  }

  @Get('academic-years')
  @ContractResponse(academicYearPageSchema)
  listAcademicYears(
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<object> {
    return this.academics.listAcademicYears(this.context(), query);
  }

  @Get('academic-years/:id')
  @ContractResponse(academicYearSchema)
  academicYear(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.getAcademicYear(this.context(), id);
  }

  @Patch('academic-years/:id')
  @ContractBody(updateAcademicYearSchema)
  @ContractResponse(academicYearSchema)
  updateAcademicYear(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateAcademicYearSchema))
    input: UpdateAcademicYear,
  ): Promise<object> {
    return this.academics.updateAcademicYear(this.context(), id, input);
  }

  @Post('courses')
  @ContractBody(createCourseSchema)
  @ContractResponse(courseSchema)
  createCourse(
    @Body(new ZodValidationPipe(createCourseSchema)) input: CreateCourse,
  ): Promise<object> {
    return this.academics.createCourse(this.context(), input);
  }

  @Get('courses')
  @ContractResponse(coursePageSchema)
  listCourses(
    @Query(new ZodValidationPipe(courseListQuerySchema)) query: CourseListQuery,
  ): Promise<object> {
    return this.academics.listCourses(this.context(), query);
  }

  @Get('courses/:id')
  @ContractResponse(courseSchema)
  course(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.getCourse(this.context(), id);
  }

  @Patch('courses/:id')
  @ContractBody(updateCourseSchema)
  @ContractResponse(courseSchema)
  updateCourse(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateCourseSchema)) input: UpdateCourse,
  ): Promise<object> {
    return this.academics.updateCourse(this.context(), id, input);
  }

  @Post('students')
  @ContractBody(createStudentSchema)
  @ContractResponse(studentSchema)
  createStudent(
    @Body(new ZodValidationPipe(createStudentSchema)) input: CreateStudent,
  ): Promise<object> {
    return this.academics.createStudent(this.context(), input);
  }

  @Get('students')
  @ContractResponse(studentPageSchema)
  listStudents(
    @Query(new ZodValidationPipe(personListQuerySchema)) query: PersonListQuery,
  ): Promise<object> {
    return this.academics.listStudents(this.context(), query);
  }

  @Get('students/:id')
  @ContractResponse(studentSchema)
  student(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.getStudent(this.context(), id);
  }

  @Patch('students/:id')
  @ContractBody(updateStudentSchema)
  @ContractResponse(studentSchema)
  updateStudent(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) input: UpdateStudent,
  ): Promise<object> {
    return this.academics.updateStudent(this.context(), id, input);
  }

  @Post('students/:id/activate')
  @ContractResponse(studentSchema)
  activateStudent(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.setStudentStatus(this.context(), id, 'ACTIVE');
  }

  @Post('students/:id/inactivate')
  @ContractResponse(studentSchema)
  inactivateStudent(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.setStudentStatus(this.context(), id, 'INACTIVE');
  }

  @Put('students/:id/identity-link')
  @RequireCurrentIdentityStatus()
  @ContractBody(verifiedIdentityLinkSchema)
  @ContractResponse(studentSchema)
  linkStudent(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(verifiedIdentityLinkSchema))
    input: VerifiedIdentityLink,
  ): Promise<object> {
    return this.academics.linkStudentIdentity(
      this.context(),
      id,
      input.identityUserId,
    );
  }

  @Get('students/:id/effective-course-subjects')
  @ContractResponse(courseSubjectSchema.array())
  effectiveSubjects(@Param('id', uuid) id: string): Promise<object[]> {
    return this.academics.effectiveCourseSubjectsForStudent(this.context(), id);
  }

  @Post('teachers')
  @ContractBody(createTeacherSchema)
  @ContractResponse(teacherSchema)
  createTeacher(
    @Body(new ZodValidationPipe(createTeacherSchema)) input: CreateTeacher,
  ): Promise<object> {
    return this.academics.createTeacher(this.context(), input);
  }

  @Get('teachers')
  @ContractResponse(teacherPageSchema)
  listTeachers(
    @Query(new ZodValidationPipe(personListQuerySchema)) query: PersonListQuery,
  ): Promise<object> {
    return this.academics.listTeachers(this.context(), query);
  }

  @Get('teachers/:id')
  @ContractResponse(teacherSchema)
  teacher(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.getTeacher(this.context(), id);
  }

  @Patch('teachers/:id')
  @ContractBody(updateTeacherSchema)
  @ContractResponse(teacherSchema)
  updateTeacher(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateTeacherSchema)) input: UpdateTeacher,
  ): Promise<object> {
    return this.academics.updateTeacher(this.context(), id, input);
  }

  @Post('teachers/:id/activate')
  @ContractResponse(teacherSchema)
  activateTeacher(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.setTeacherStatus(this.context(), id, 'ACTIVE');
  }

  @Post('teachers/:id/inactivate')
  @ContractResponse(teacherSchema)
  inactivateTeacher(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.setTeacherStatus(this.context(), id, 'INACTIVE');
  }

  @Put('teachers/:id/identity-link')
  @RequireCurrentIdentityStatus()
  @ContractBody(verifiedIdentityLinkSchema)
  @ContractResponse(teacherSchema)
  linkTeacher(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(verifiedIdentityLinkSchema))
    input: VerifiedIdentityLink,
  ): Promise<object> {
    return this.academics.linkTeacherIdentity(
      this.context(),
      id,
      input.identityUserId,
    );
  }

  @Post('subjects')
  @ContractBody(createSubjectSchema)
  @ContractResponse(subjectSchema)
  createSubject(
    @Body(new ZodValidationPipe(createSubjectSchema)) input: CreateSubject,
  ): Promise<object> {
    return this.academics.createSubject(this.context(), input);
  }

  @Get('subjects')
  @ContractResponse(subjectPageSchema)
  listSubjects(
    @Query(new ZodValidationPipe(subjectListQuerySchema))
    query: SubjectListQuery,
  ): Promise<object> {
    return this.academics.listSubjects(this.context(), query);
  }

  @Get('subjects/:id')
  @ContractResponse(subjectSchema)
  subject(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.getSubject(this.context(), id);
  }

  @Patch('subjects/:id')
  @ContractBody(updateSubjectSchema)
  @ContractResponse(subjectSchema)
  updateSubject(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) input: UpdateSubject,
  ): Promise<object> {
    return this.academics.updateSubject(this.context(), id, input);
  }

  @Post('course-subjects')
  @ContractBody(createCourseSubjectSchema)
  @ContractResponse(courseSubjectSchema)
  createCourseSubject(
    @Body(new ZodValidationPipe(createCourseSubjectSchema))
    input: CreateCourseSubject,
  ): Promise<object> {
    return this.academics.createCourseSubject(this.context(), input);
  }

  @Get('course-subjects')
  @ContractResponse(courseSubjectPageSchema)
  listCourseSubjects(
    @Query(new ZodValidationPipe(courseSubjectListQuerySchema))
    query: CourseSubjectListQuery,
  ): Promise<object> {
    return this.academics.listCourseSubjects(this.context(), query);
  }

  @Patch('course-subjects/:id')
  @ContractBody(updateCourseSubjectSchema)
  @ContractResponse(courseSubjectSchema)
  updateCourseSubject(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateCourseSubjectSchema))
    input: UpdateCourseSubject,
  ): Promise<object> {
    return this.academics.updateCourseSubject(this.context(), id, input);
  }

  @Post('course-enrollments')
  @ContractBody(createCourseEnrollmentSchema)
  @ContractResponse(courseEnrollmentSchema)
  enrollStudent(
    @Body(new ZodValidationPipe(createCourseEnrollmentSchema))
    input: CreateCourseEnrollment,
  ): Promise<object> {
    return this.academics.enrollStudentInCourse(this.context(), input);
  }

  @Post('course-enrollments/:id/deactivate')
  @ContractResponse(courseEnrollmentSchema)
  deactivateEnrollment(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.deactivateCourseEnrollment(this.context(), id);
  }

  @Get('courses/:id/roster')
  @ContractResponse(courseRosterItemSchema.array())
  courseRoster(@Param('id', uuid) id: string): Promise<object[]> {
    return this.academics.courseRoster(this.context(), id);
  }

  @Post('student-subject-enrollments')
  @ContractBody(createStudentSubjectEnrollmentSchema)
  @ContractResponse(studentSubjectEnrollmentSchema)
  directlyEnroll(
    @Body(new ZodValidationPipe(createStudentSubjectEnrollmentSchema))
    input: CreateStudentSubjectEnrollment,
  ): Promise<object> {
    return this.academics.directlyEnrollStudent(this.context(), input);
  }

  @Post('student-subject-enrollments/:id/deactivate')
  @ContractResponse(studentSubjectEnrollmentSchema)
  deactivateDirectEnrollment(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.deactivateDirectEnrollment(this.context(), id);
  }

  @Post('course-subject-teachers')
  @ContractBody(assignCourseSubjectTeachersSchema)
  @ContractResponse(courseSubjectTeacherSchema.array())
  assignTeachers(
    @Body(new ZodValidationPipe(assignCourseSubjectTeachersSchema))
    input: AssignCourseSubjectTeachers,
  ): Promise<object[]> {
    return this.academics.assignTeachers(this.context(), input);
  }

  @Post('course-subject-teachers/:id/deactivate')
  @ContractResponse(courseSubjectTeacherSchema)
  deactivateTeacherAssignment(@Param('id', uuid) id: string): Promise<object> {
    return this.academics.deactivateTeacherAssignment(this.context(), id);
  }

  @Get('course-subjects/:id/teachers')
  @ContractResponse(courseSubjectTeacherSchema.array())
  assignedTeachers(@Param('id', uuid) id: string): Promise<object[]> {
    return this.academics.assignedTeachers(this.context(), id);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}

@ApiTags('Academic context')
@Controller()
@RequireCapabilities(TenantCapability.AccessTenant)
export class AcademicContextController {
  constructor(
    private readonly academics: AcademicService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('student-context/profile')
  @ContractResponse(studentSchema)
  studentProfile(): Promise<object> {
    return this.academics.myStudentProfile(this.context());
  }

  @Get('student-context/course-subjects')
  @ContractResponse(courseSubjectSchema.array())
  studentCourseSubjects(): Promise<object[]> {
    return this.academics.myEffectiveCourseSubjects(this.context());
  }

  @Get('teacher-context/course-subjects')
  @ContractResponse(courseSubjectSchema.array())
  teacherCourseSubjects(): Promise<object[]> {
    return this.academics.myAssignedCourseSubjects(this.context());
  }

  @Get('course-subjects/:id/roster')
  @ContractResponse(courseSubjectRosterItemSchema.array())
  roster(@Param('id', uuid) id: string): Promise<object[]> {
    return this.academics.courseSubjectRoster(this.context(), id);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}
