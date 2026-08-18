import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { AcademicAdminScreen } from '@/features/academic-admin';

vi.mock('next/navigation', () => ({
  usePathname: () => '/administracion/estructura',
  useRouter: () => ({ push: () => undefined }),
}));

afterEach(() => {
  cleanup();
});

const id = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-08-08T12:00:00+00:00';

const year = {
  id,
  label: '2026',
  startDate: '2026-03-01',
  endDate: '2026-12-31',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const course = {
  id,
  academicYearId: id,
  source: 'MANUAL',
  externalReference: null,
  label: '7º Básico A',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const subject1 = {
  id,
  name: 'Lenguaje y Comunicación',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const subject2 = {
  id: id2,
  name: 'Matemática',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const courseSubject1 = {
  id,
  courseId: id,
  subjectId: id,
  defaultForCourse: true,
  sortOrder: 0,
  status: 'ACTIVE' as const,
  course,
  subject: subject1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const teacher1 = {
  id,
  identityUserId: null,
  source: 'MANUAL',
  externalReference: null,
  firstName: 'Gabriela',
  lastName: 'Mistral',
  email: 'gabriela@colegio.cl',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const studentEduPay = {
  id,
  identityUserId: null,
  source: 'EDUPAY',
  externalReference: 'STU-001',
  firstName: 'Claudio',
  lastName: 'Arrau',
  email: null,
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const studentManual = {
  id: id2,
  identityUserId: 'usr-identity-123',
  source: 'MANUAL',
  externalReference: null,
  firstName: 'Violeta',
  lastName: 'Parra',
  email: 'violeta@musica.cl',
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function adminClient(overrides: Partial<AcademicApiClient> = {}): AcademicApiClient {
  return {
    listAcademicYears: vi.fn(async () => ({ items: [year], nextCursor: null })),
    listCourses: vi.fn(async () => ({ items: [course], nextCursor: null })),
    listStudents: vi.fn(async () => ({ items: [studentEduPay, studentManual], nextCursor: null })),
    listTeachers: vi.fn(async () => ({ items: [teacher1], nextCursor: null })),
    listSubjects: vi.fn(async () => ({ items: [subject1, subject2], nextCursor: null })),
    listCourseSubjects: vi.fn(async () => ({ items: [courseSubject1], nextCursor: null })),
    getCourseRoster: vi.fn(async () => []),
    getAssignedTeachers: vi.fn(async () => [
      { id: 'assign-1', courseSubjectId: id, teacherId: id, status: 'ACTIVE', teacher: teacher1, createdAt: timestamp, updatedAt: timestamp },
    ]),
    createSubject: vi.fn(async (input) => ({ id: 'new-sub', name: input.name, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    updateSubject: vi.fn(async (subId, input) => ({ id: subId, name: input.name ?? 'Subject', status: input.status ?? ('ACTIVE' as const), createdAt: timestamp, updatedAt: timestamp })),
    createCourseSubject: vi.fn(async (input) => ({ id: 'new-cs', courseId: input.courseId, subjectId: input.subjectId, defaultForCourse: input.defaultForCourse ?? true, sortOrder: input.sortOrder ?? 0, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    updateCourseSubject: vi.fn(async (csId, input) => ({ id: csId, courseId: id, subjectId: id, defaultForCourse: input.defaultForCourse ?? true, sortOrder: input.sortOrder ?? 0, status: input.status ?? ('ACTIVE' as const), createdAt: timestamp, updatedAt: timestamp })),
    assignCourseSubjectTeachers: vi.fn(async () => []),
    deactivateTeacherAssignment: vi.fn(async () => {}),
    createTeacher: vi.fn(async (input) => ({ id: 'new-teach', identityUserId: null, source: 'MANUAL', externalReference: null, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    updateTeacher: vi.fn(async (teachId, input) => ({ id: teachId, identityUserId: null, source: 'MANUAL', externalReference: null, firstName: input.firstName ?? 'Teach', lastName: input.lastName ?? 'Teach', email: input.email ?? null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    createStudent: vi.fn(async (input) => ({ id: 'new-stu', identityUserId: null, source: 'MANUAL', externalReference: null, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    updateStudent: vi.fn(async (stuId, input) => ({ id: stuId, identityUserId: null, source: 'MANUAL', externalReference: null, firstName: input.firstName ?? 'Student', lastName: input.lastName ?? 'Student', email: input.email ?? null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    enrollStudent: vi.fn(async () => ({ id: 'enr-1', courseId: id, studentId: id, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    directlyEnrollStudent: vi.fn(async () => ({ id: 'dir-1', courseSubjectId: id, studentId: id, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp })),
    getSyncStatus: vi.fn(async () => ({
      source: 'EDUPAY' as const,
      configured: true,
      configuration: { sourceTenantId: 'colegio-conquistadores', academicYearId: id, academicYearLabel: '2026', enabled: true },
      lastIncrementalSuccessAt: null,
      lastFullSuccessAt: null,
      lastRun: null,
      currentConflictCount: 0,
    })),
    getStorageUsage: vi.fn(async () => ({
      tenantId: 'colegio-conquistadores',
      allocationPercentage: 12,
      fileCount: 45,
      blobCount: 45,
      usedBytes: 120_000_000,
      reservedBytes: 0,
      availableBytes: 880_000_000,
      quotaBytes: 1_000_000_000,
      state: 'NORMAL' as const,
    })),
    getStoragePolicy: vi.fn(async () => ({
      maxFileSizeBytes: 10_000_000,
      allowedExtensions: ['.pdf', '.docx', '.png'],
      tenantQuotaBytes: 1_000_000_000,
    })),
    ...overrides,
  } as unknown as AcademicApiClient;
}

describe('Academic admin screens', () => {
  it('renders academic overview with sync and storage usage', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="overview" />);
    expect(await screen.findByRole('heading', { name: 'Administración académica' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Sincronización EduPay' })).toBeTruthy();
    expect(screen.getByText(/colegio-conquistadores/)).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Almacenamiento del tenant' })).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
  });

  it('renders structure view with years, courses and switches between tabs', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="structure" />);
    expect(await screen.findByRole('heading', { name: 'Años académicos' })).toBeTruthy();
    expect(screen.getAllByText('2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: '7º Básico A' })).toBeTruthy();

    // Switch to Subject Catalog tab
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo de Asignaturas' }));
    expect(await screen.findByRole('heading', { name: 'Catálogo de asignaturas' })).toBeTruthy();
    expect(screen.getAllByText('Lenguaje y Comunicación').length).toBeGreaterThan(0);
    expect(screen.getByText('Matemática')).toBeTruthy();

    // Switch to Course Subjects tab
    fireEvent.click(screen.getByRole('tab', { name: 'Asignaturas del Curso' }));
    expect(await screen.findByRole('heading', { name: 'Asignaturas por curso' })).toBeTruthy();
  });

  it('creates and archives a subject from the Subject Catalog tab', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="structure" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Catálogo de Asignaturas' }));

    const input = screen.getByLabelText(/nombre de la asignatura/i);
    fireEvent.change(input, { target: { value: 'Historia y Geografía' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear asignatura' }));

    await waitFor(() => {
      expect(client.createSubject).toHaveBeenCalledWith({ name: 'Historia y Geografía' });
    });

    const archiveButtons = screen.getAllByRole('button', { name: 'Archivar' });
    fireEvent.click(archiveButtons[0]!);

    await waitFor(() => {
      expect(client.updateSubject).toHaveBeenCalledWith(id, { status: 'ARCHIVED' });
    });
  });

  it('manages course subjects and teacher assignments in structure view', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="structure" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Asignaturas del Curso' }));

    expect(await screen.findByText('General del curso')).toBeTruthy();
    expect(await screen.findByText('Gabriela Mistral')).toBeTruthy();

    // Unassign teacher
    const removeBtn = screen.getByRole('button', { name: /desasignar a gabriela/i });
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(client.deactivateTeacherAssignment).toHaveBeenCalledWith('assign-1');
    });
  });

  it('renders student list with EduPay-managed distinction and search capability', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="people" />);
    expect(await screen.findByRole('heading', { name: 'Alumnos' })).toBeTruthy();
    expect(screen.getByText('Claudio Arrau')).toBeTruthy();
    expect(screen.getByText('Gestionado por EduPay')).toBeTruthy();
    expect(screen.getByText('Violeta Parra')).toBeTruthy();
    expect(screen.getByText('Registro manual')).toBeTruthy();

    // Test search
    const searchInput = screen.getByLabelText(/buscar alumno/i);
    fireEvent.change(searchInput, { target: { value: 'Claudio' } });

    await waitFor(() => {
      expect(client.listStudents).toHaveBeenCalledWith('Claudio');
    });
  });

  it('prevents modifying name fields on EduPay-sourced student records', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="people" />);
    const editButtons = await screen.findAllByRole('button', { name: 'Editar' });
    // First student is Claudio Arrau (source = EDUPAY)
    fireEvent.click(editButtons[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/el nombre y apellido provienen de la sincronización con edupay/i)).toBeTruthy();

    const firstNameInput = screen.getByDisplayValue('Claudio') as HTMLInputElement;
    expect(firstNameInput.disabled).toBe(true);

    const emailInput = screen.getByLabelText('Correo electrónico') as HTMLInputElement;
    expect(emailInput.disabled).toBe(false);
    fireEvent.change(emailInput, { target: { value: 'claudio.arrau@piano.cl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(client.updateStudent).toHaveBeenCalledWith(id, {
        email: 'claudio.arrau@piano.cl',
      });
    });
  });

  it('locks email editing for already linked accounts to prevent divergence from Identity', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="people" />);
    const editButtons = await screen.findAllByRole('button', { name: 'Editar' });
    // Second student is Violeta Parra (identityUserId = 'usr-identity-123')
    fireEvent.click(editButtons[1]!);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/esta cuenta ya tiene acceso de identity vinculado/i)).toBeTruthy();

    const emailInput = within(dialog).getByDisplayValue('violeta@musica.cl') as HTMLInputElement;
    expect(emailInput.disabled).toBe(true);
  });

  it('renders teacher management and allows searching and editing', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="people" />);
    fireEvent.click(await screen.findByRole('tab', { name: /profesores/i }));

    expect(await screen.findByRole('heading', { name: 'Profesores' })).toBeTruthy();
    expect(screen.getByText('Gabriela Mistral')).toBeTruthy();

    // Search teachers
    const searchInput = screen.getByLabelText(/buscar profesor/i);
    fireEvent.change(searchInput, { target: { value: 'Gabriela' } });
    await waitFor(() => {
      expect(client.listTeachers).toHaveBeenCalledWith('Gabriela');
    });
  });

  it('renders enrollments and assignments tab with direct assignment workflows', async () => {
    const client = adminClient();
    render(<AcademicAdminScreen api={client} view="people" />);
    fireEvent.click(await screen.findByRole('tab', { name: /inscripciones/i }));

    expect(await screen.findByRole('heading', { name: 'Inscripciones y asignaciones directas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inscribir alumno' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar asignación' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Asignar directamente' })).toBeTruthy();
  });

  it('renders a forbidden state without pretending data is available', async () => {
    const forbidden = new AcademicApiError({
      code: 'FORBIDDEN',
      details: [],
      message: 'forbidden',
      requestId: 'req-403',
      status: 403,
    });
    render(
      <AcademicAdminScreen
        api={adminClient({
          listAcademicYears: vi.fn(async () => {
            throw forbidden;
          }),
        })}
        view="overview"
      />,
    );
    expect(await screen.findByText('Sin permiso para este espacio')).toBeTruthy();
    expect(screen.getByText(/tu sesión está autenticada/i)).toBeTruthy();
  });

  it('renders total student count in overview stat card and students pagination bar', async () => {
    const client = adminClient({
      listStudents: vi.fn(async () => ({ items: [studentEduPay, studentManual], nextCursor: 'opaque-next', totalCount: 229 })),
    });
    render(<AcademicAdminScreen api={client} view="overview" />);
    expect(await screen.findByText('229')).toBeTruthy();
    expect(screen.getByText('alumnos registrados')).toBeTruthy();

    render(<AcademicAdminScreen api={client} view="people" />);
    expect(await screen.findByText('Mostrando 2 de 229 alumnos')).toBeTruthy();
  });
});

