import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { StudentAdmissionForm } from '@/features/student-admission-form';

afterEach(() => {
  cleanup();
});

const timestamp = '2026-11-15T12:00:00+00:00';
const yearId = '00000000-0000-4000-8000-000000000101';
const courseId = '00000000-0000-4000-8000-000000000201';
const studentId = '00000000-0000-4000-8000-000000000301';

const draftYear = {
  id: yearId,
  label: '2027',
  startDate: '2027-03-01',
  endDate: '2027-12-20',
  status: 'DRAFT' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const course = {
  id: courseId,
  academicYearId: yearId,
  source: 'MANUAL',
  externalReference: null,
  label: '1° Básico A',
  status: 'DRAFT' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const student = {
  id: studentId,
  identityUserId: null,
  source: 'MANUAL',
  externalReference: null,
  firstName: 'Alumna',
  lastName: 'Sintética',
  email: null,
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const enrollment = {
  id: '00000000-0000-4000-8000-000000000401',
  studentId,
  courseId,
  source: 'MANUAL',
  externalReference: null,
  status: 'ACTIVE' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function client(overrides: Partial<AcademicApiClient> = {}): AcademicApiClient {
  return {
    listAcademicYears: vi.fn(async () => ({
      items: [draftYear],
      nextCursor: null,
    })),
    listCourses: vi.fn(async () => ({ items: [course], nextCursor: null })),
    admitStudent: vi.fn(async () => ({
      student,
      enrollment,
      nationalIdType: 'RUN' as const,
    })),
    lookupStudentByNationalId: vi.fn(async () => ({ student: null })),
    enrollStudent: vi.fn(async () => enrollment),
    ...overrides,
  } as unknown as AcademicApiClient;
}

async function fillValidForm() {
  // Synthetic sequential RUN, never a real person.
  fireEvent.change(await screen.findByLabelText('RUN'), {
    target: { value: '11.111.111-1' },
  });
  fireEvent.change(screen.getByLabelText('Nombres'), {
    target: { value: 'Alumna' },
  });
  fireEvent.change(screen.getByLabelText('Apellidos'), {
    target: { value: 'Sintética' },
  });
  await screen.findByRole('option', { name: '1° Básico A (borrador)' });
  fireEvent.change(screen.getByLabelText('Curso'), {
    target: { value: courseId },
  });
}

describe('StudentAdmissionForm', () => {
  it('explains an invalid RUN and keeps the admission disabled', async () => {
    render(<StudentAdmissionForm api={client()} onSaved={vi.fn()} />);
    const run = await screen.findByLabelText('RUN');
    fireEvent.change(run, { target: { value: '11.111.111-2' } });
    fireEvent.blur(run);

    expect(await screen.findByText(/El RUN no es válido/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Incorporar y matricular',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('admits with the canonical RUN and reuses the key when retrying the same data', async () => {
    const admitStudent = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ student, enrollment, nationalIdType: 'RUN' });
    const onSaved = vi.fn();
    render(
      <StudentAdmissionForm api={client({ admitStudent })} onSaved={onSaved} />,
    );
    await fillValidForm();

    const submit = screen.getByRole('button', {
      name: 'Incorporar y matricular',
    });
    fireEvent.click(submit);
    expect(
      await screen.findByText('No se pudo incorporar al alumno'),
    ).toBeTruthy();
    fireEvent.click(submit);

    expect(await screen.findByText('Alumno incorporado')).toBeTruthy();
    expect(
      screen.getByText(/quedó incorporado y matriculado en 1° Básico A/),
    ).toBeTruthy();
    expect(admitStudent).toHaveBeenCalledTimes(2);
    const [firstInput, firstOptions] = admitStudent.mock.calls[0]!;
    const [, secondOptions] = admitStudent.mock.calls[1]!;
    expect(firstInput).toEqual({
      nationalIdType: 'RUN',
      nationalId: '111111111',
      firstName: 'Alumna',
      lastName: 'Sintética',
      courseId,
    });
    expect(secondOptions.idempotencyKey).toBe(firstOptions.idempotencyKey);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('RUN') as HTMLInputElement).value).toBe('');
  });

  it('never creates a second record for an existing identifier and offers an explicit enrollment', async () => {
    const admitStudent = vi.fn(async () => {
      throw new AcademicApiError({
        code: 'STUDENT_NATIONAL_ID_EXISTS',
        details: [],
        message: 'A student record with this identifier already exists.',
        requestId: 'req-duplicate',
        status: 409,
      });
    });
    const lookupStudentByNationalId = vi.fn(async () => ({
      student: { ...student, source: 'EDUPAY', externalReference: 'ext-1' },
    }));
    const enrollStudent = vi.fn(async () => enrollment);
    const onSaved = vi.fn();
    render(
      <StudentAdmissionForm
        api={client({ admitStudent, lookupStudentByNationalId, enrollStudent })}
        onSaved={onSaved}
      />,
    );
    await fillValidForm();
    fireEvent.click(
      screen.getByRole('button', { name: 'Incorporar y matricular' }),
    );

    expect(
      await screen.findByText('Ya existe una ficha con este identificador'),
    ).toBeTruthy();
    expect(screen.getByText(/gestionada por EduPay/)).toBeTruthy();
    expect(lookupStudentByNationalId).toHaveBeenCalledWith({
      nationalIdType: 'RUN',
      nationalId: '111111111',
    });
    expect(enrollStudent).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Matricular esta ficha en 1° Básico A',
      }),
    );
    await waitFor(() => {
      expect(enrollStudent).toHaveBeenCalledWith({ studentId, courseId });
    });
    expect(await screen.findByText(/No se creó otra ficha\./)).toBeTruthy();
    expect(admitStudent).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('asks for an open academic year before admitting', async () => {
    render(
      <StudentAdmissionForm
        api={client({
          listAcademicYears: vi.fn(async () => ({
            items: [{ ...draftYear, status: 'CLOSED' as const }],
            nextCursor: null,
          })),
        })}
        onSaved={vi.fn()}
      />,
    );
    expect(
      await screen.findByText('No hay un año académico abierto'),
    ).toBeTruthy();
  });

  it('offers a retry when academic years cannot load', async () => {
    const listAcademicYears = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [draftYear], nextCursor: null });
    render(
      <StudentAdmissionForm
        api={client({ listAcademicYears })}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('RUN')).toBeTruthy();
  });
});
