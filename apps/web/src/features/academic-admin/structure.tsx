'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@edupay/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicApiClient } from '@/api/academic-client';

import {
  preferredAcademicYearId,
  errorMessage,
  statusLabel,
  type AdminData,
} from './shared';

export function CourseForm({
  api,
  data,
  fixedYearId,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  /** When set, the course is created in this year and no year is offered. */
  fixedYearId?: string;
  onSaved: () => void;
}) {
  const [chosenYearId, setAcademicYearId] = useState(
    preferredAcademicYearId(data),
  );
  const academicYearId = fixedYearId ?? chosenYearId;
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedYear = data.academicYears.find(
    (year) => year.id === academicYearId,
  );
  const canCreateCourse =
    selectedYear?.status === 'ACTIVE' || selectedYear?.status === 'DRAFT';
  const canCreateActive = selectedYear?.status === 'ACTIVE';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!academicYearId || !label.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createCourse({ academicYearId, label: label.trim(), status });
      setLabel('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      {fixedYearId ? null : <h3>Nuevo curso</h3>}
      <div className="academic-form__fields">
        {fixedYearId ? null : (
          <Select
            id="new-course-year"
            hint={
              canCreateCourse
                ? 'Los años cerrados o archivados se conservan en solo lectura.'
                : 'Selecciona un año activo o en borrador para crear un curso.'
            }
            label="Año del nuevo curso"
            required
            value={academicYearId}
            onChange={(e) => {
              const nextYearId = e.target.value;
              setAcademicYearId(nextYearId);
              if (
                data.academicYears.find((year) => year.id === nextYearId)
                  ?.status !== 'ACTIVE'
              ) {
                setStatus('DRAFT');
              }
            }}
          >
            <option value="">Selecciona un año</option>
            {data.academicYears.map((year) => (
              <option
                disabled={
                  year.status === 'CLOSED' || year.status === 'ARCHIVED'
                }
                key={year.id}
                value={year.id}
              >
                {year.label} · {statusLabel(year.status)}
              </option>
            ))}
          </Select>
        )}
        <Input
          id="new-course-label"
          label="Nombre del curso"
          placeholder="8º Básico B"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Select
          id="new-course-status"
          label="Estado"
          hint={
            canCreateActive
              ? 'Puedes activar el curso ahora o dejarlo en borrador.'
              : 'Los cursos se activan después de activar su año académico.'
          }
          value={status}
          onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'ACTIVE')}
        >
          <option disabled={!canCreateActive} value="ACTIVE">
            Activo
          </option>
          <option value="DRAFT">Borrador</option>
        </Select>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        disabled={!canCreateCourse || !academicYearId || !label.trim()}
        loading={saving}
        type="submit"
      >
        Crear curso
      </Button>
    </form>
  );
}

export function ActivateAcademicRecord({
  label,
  onActivate,
  onSaved,
}: {
  label: string;
  onActivate: () => Promise<unknown>;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function activate() {
    setSaving(true);
    setError(null);
    try {
      await onActivate();
      onSaved();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="academic-lifecycle-action">
      <Button
        loading={saving}
        onClick={() => void activate()}
        size="sm"
        variant="secondary"
      >
        {label}
      </Button>
      {error ? (
        <span className="form-error" role="alert">
          {errorMessage(error).message}
        </span>
      ) : null}
    </div>
  );
}

export function SubjectCatalog({
  api,
  data,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editSubject, setEditSubject] = useState<
    AdminData['subjects'][number] | null
  >(null);
  const [editName, setEditName] = useState('');
  const [actionError, setActionError] = useState('');

  async function createSubjectSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createSubject({ name: name.trim() });
      setName('');
      setSuccess('La asignatura quedó disponible en el catálogo del tenant.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateSubjectSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editSubject || !editName.trim()) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.updateSubject(editSubject.id, { name: editName.trim() });
      setEditSubject(null);
      setSuccess('El nombre de la asignatura se actualizó.');
      onSaved();
    } catch (nextError) {
      setActionError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveSubject(id: string) {
    setActionError('');
    setSuccess('');
    try {
      await api.updateSubject(id, { status: 'ARCHIVED' });
      setSuccess('La asignatura se archivó y su historia quedó conservada.');
      onSaved();
    } catch (nextError) {
      setActionError(errorMessage(nextError).message);
    }
  }

  return (
    <section className="academic-panel">
      <div className="section-heading">
        <div>
          <h2>Catálogo de asignaturas</h2>
          <p>
            Catálogo base reutilizable en todos los cursos del establecimiento.
          </p>
        </div>
      </div>
      {actionError ? (
        <Alert title="Error al actualizar asignatura" tone="error">
          {actionError}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Catálogo actualizado" tone="success">
          {success}
        </Alert>
      ) : null}
      <form className="academic-form" onSubmit={createSubjectSubmit}>
        <h3>Nueva asignatura</h3>
        <div className="academic-form__fields">
          <Input
            id="subject-name"
            label="Nombre de la asignatura"
            placeholder="Ciencias Naturales"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={!name.trim()} loading={saving} type="submit">
          Crear asignatura
        </Button>
      </form>

      <div className="responsive-table">
        <table>
          <caption className="sr-only">Catálogo de asignaturas</caption>
          <thead>
            <tr>
              <th>Asignatura</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((subject) => (
              <tr key={subject.id}>
                <td data-label="Asignatura">
                  <strong>{subject.name}</strong>
                </td>
                <td data-label="Estado">
                  <Badge
                    tone={subject.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(subject.status)}
                  </Badge>
                </td>
                <td data-label="Acciones">
                  <div className="table-actions">
                    {subject.status === 'ACTIVE' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditSubject(subject);
                            setEditName(subject.name);
                          }}
                        >
                          Renombrar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void archiveSubject(subject.id)}
                        >
                          Archivar
                        </Button>
                      </>
                    ) : (
                      <small className="archived-hint">Solo lectura</small>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.subjects.length === 0 ? (
          <EmptyState
            description="Crea la primera asignatura para comenzar a armar el catálogo."
            title="Aún no hay asignaturas"
          />
        ) : null}
      </div>

      {editSubject ? (
        <Dialog
          description="Actualiza el nombre oficial de la asignatura en el catálogo."
          onOpenChange={(open) => !open && setEditSubject(null)}
          open={Boolean(editSubject)}
          title="Renombrar asignatura"
        >
          <form className="academic-form" onSubmit={updateSubjectSubmit}>
            <Input
              id="edit-subject-name"
              label="Nombre de la asignatura"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            {actionError ? (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditSubject(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!editName.trim()}
                loading={saving}
                type="submit"
              >
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

export function CourseSubjectTeacherManager({
  api,
  courseSubjectId,
  teachers,
  readOnly = false,
  onUpdated,
}: {
  api: AcademicApiClient;
  courseSubjectId: string;
  teachers: AdminData['teachers'];
  readOnly?: boolean;
  onUpdated: () => void;
}) {
  const [assigned, setAssigned] = useState<
    Awaited<ReturnType<AcademicApiClient['getAssignedTeachers']>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const reloadAssigned = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await api.getAssignedTeachers(courseSubjectId);
      setAssigned(list);
    } catch (nextError) {
      setLoadError(errorMessage(nextError).message);
    } finally {
      setLoading(false);
    }
  }, [api, courseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reloadAssigned(), 0);
    return () => window.clearTimeout(timer);
  }, [reloadAssigned]);

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!selectedTeacherId || readOnly) return;
    setBusy(true);
    setError('');
    try {
      await api.assignCourseSubjectTeachers({
        courseSubjectId,
        teacherIds: [selectedTeacherId],
      });
      setSelectedTeacherId('');
      await reloadAssigned();
      onUpdated();
    } catch (err) {
      setError(errorMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (readOnly) return;
    setBusy(true);
    setError('');
    try {
      await api.deactivateTeacherAssignment(assignmentId);
      await reloadAssigned();
      onUpdated();
    } catch (err) {
      setError(errorMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  const assignedTeacherIds = new Set(assigned.map((a) => a.teacherId));
  const availableTeachers = teachers.filter(
    (t) => t.status === 'ACTIVE' && !assignedTeacherIds.has(t.id),
  );

  return (
    <div className="course-subject-teachers">
      <h4>Profesores asignados</h4>
      {loadError ? (
        <Alert
          action={
            <Button onClick={() => void reloadAssigned()} variant="secondary">
              Reintentar
            </Button>
          }
          title="No pudimos cargar las responsabilidades"
          tone="error"
        >
          {loadError}
        </Alert>
      ) : null}
      {loading ? (
        <Skeleton />
      ) : assigned.length ? (
        <ul className="teacher-badge-list">
          {assigned.map((item) => (
            <li key={item.id} className="teacher-assignment-chip">
              <span>
                {item.teacher
                  ? `${item.teacher.firstName} ${item.teacher.lastName}`
                  : item.teacherId}
              </span>
              <button
                aria-label={`Desasignar a ${item.teacher?.firstName ?? 'profesor'}`}
                className="chip-remove-button"
                disabled={busy || readOnly}
                type="button"
                onClick={() => void handleUnassign(item.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : loadError ? null : (
        <p className="empty-subtext">Sin profesores asignados actualmente.</p>
      )}

      {availableTeachers.length > 0 && !readOnly ? (
        <form className="assign-teacher-inline" onSubmit={handleAssign}>
          <Select
            id={`assign-teacher-${courseSubjectId}`}
            label="Asignar profesor"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
          >
            <option value="">Selecciona un profesor</option>
            {availableTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </Select>
          <Button
            disabled={!selectedTeacherId || busy}
            loading={busy}
            size="sm"
            type="submit"
          >
            Asignar
          </Button>
        </form>
      ) : null}
      {readOnly ? (
        <p className="empty-subtext">
          El año o curso está cerrado; las asignaciones existentes se conservan
          y no se pueden modificar.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CourseSubjectManagement({
  api,
  data,
  selectedCourse,
  onSaved,
}: {
  api: AcademicApiClient;
  data: AdminData;
  selectedCourse: AdminData['courses'][number];
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState('');
  const [defaultForCourse, setDefaultForCourse] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editItem, setEditItem] = useState<
    AdminData['courseSubjects'][number] | null
  >(null);
  const [editDefault, setEditDefault] = useState(true);
  const [editSortOrder, setEditSortOrder] = useState('0');

  const courseSubjects = data.courseSubjects.filter(
    (cs) => cs.courseId === selectedCourse.id,
  );
  const courseYear = data.academicYears.find(
    (year) => year.id === selectedCourse.academicYearId,
  );
  const canMutate = Boolean(
    courseYear &&
    !['CLOSED', 'ARCHIVED'].includes(courseYear.status) &&
    selectedCourse.status !== 'ARCHIVED',
  );
  const readOnlyMessage =
    courseYear?.status === 'CLOSED' || courseYear?.status === 'ARCHIVED'
      ? 'El año académico está cerrado o archivado. Puedes consultar la configuración, pero no modificarla.'
      : 'El curso está archivado. Puedes consultar la historia, pero no modificarla.';
  const existingSubjectIds = new Set(
    courseSubjects
      .filter((cs) => cs.status === 'ACTIVE')
      .map((cs) => cs.subjectId),
  );
  const availableSubjects = data.subjects.filter(
    (s) => s.status === 'ACTIVE' && !existingSubjectIds.has(s.id),
  );

  async function handleAddCourseSubject(event: FormEvent) {
    event.preventDefault();
    if (!subjectId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createCourseSubject({
        courseId: selectedCourse.id,
        subjectId,
        defaultForCourse,
        sortOrder: parseInt(sortOrder, 10) || 0,
      });
      setSubjectId('');
      setSortOrder('0');
      setSuccess('La asignatura quedó asociada a este curso.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCourseSubject(event: FormEvent) {
    event.preventDefault();
    if (!editItem) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateCourseSubject(editItem.id, {
        defaultForCourse: editDefault,
        sortOrder: parseInt(editSortOrder, 10) || 0,
      });
      setEditItem(null);
      setSuccess('La configuración de la asignatura se actualizó.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveCourseSubject(id: string) {
    setError('');
    setSuccess('');
    try {
      await api.updateCourseSubject(id, { status: 'ARCHIVED' });
      setSuccess('La asociación se archivó y su historia quedó conservada.');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    }
  }

  return (
    <div className="course-subjects-container">
      <div className="section-subheading">
        <h3>Asignaturas de {selectedCourse.label}</h3>
        <p>
          Configura las asignaturas impartidas en este curso, su orden y
          profesores a cargo.
        </p>
      </div>

      {!canMutate ? (
        <Alert title="Configuración en solo lectura" tone="warning">
          {readOnlyMessage}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Asociación actualizada" tone="success">
          {success}
        </Alert>
      ) : null}

      <form className="academic-form" onSubmit={handleAddCourseSubject}>
        <h3>Agregar asignatura al curso</h3>
        <div className="academic-form__fields">
          <Select
            id="add-subject-select"
            label="Asignatura del catálogo"
            required
            disabled={!canMutate}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Selecciona una asignatura</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            id="course-subject-sort-order"
            label="Orden de presentación"
            min="0"
            disabled={!canMutate}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <Checkbox
          checked={defaultForCourse}
          description="Todos los alumnos inscritos en este curso cursarán esta asignatura por defecto."
          disabled={!canMutate}
          id="course-subject-default"
          label="Asignación general para todos los alumnos del curso"
          onChange={(e) => setDefaultForCourse(e.target.checked)}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          disabled={!subjectId || saving || !canMutate}
          loading={saving}
          type="submit"
        >
          Agregar asignatura al curso
        </Button>
      </form>

      <div className="course-subjects-list">
        {courseSubjects.map((cs) => {
          const subjectName =
            cs.subject?.name ??
            data.subjects.find((s) => s.id === cs.subjectId)?.name ??
            'Asignatura';
          return (
            <Card key={cs.id} className="course-subject-card">
              <div className="course-subject-card__header">
                <div>
                  <h4>{subjectName}</h4>
                  <div className="course-subject-meta">
                    <Badge tone={cs.defaultForCourse ? 'info' : 'neutral'}>
                      {cs.defaultForCourse
                        ? 'General del curso'
                        : 'Asignación directa'}
                    </Badge>
                    <Badge
                      tone={cs.status === 'ACTIVE' ? 'success' : 'neutral'}
                    >
                      {statusLabel(cs.status)}
                    </Badge>
                    <span className="sort-order-tag">
                      Orden: {cs.sortOrder}
                    </span>
                  </div>
                </div>
                <div className="card-header-actions">
                  {cs.status === 'ACTIVE' ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canMutate}
                        onClick={() => {
                          setEditItem(cs);
                          setEditDefault(cs.defaultForCourse);
                          setEditSortOrder(String(cs.sortOrder));
                        }}
                      >
                        Configurar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canMutate}
                        onClick={() => void handleArchiveCourseSubject(cs.id)}
                      >
                        Archivar
                      </Button>
                    </>
                  ) : (
                    <small className="archived-hint">Archivado</small>
                  )}
                </div>
              </div>

              {cs.status === 'ACTIVE' ? (
                <CourseSubjectTeacherManager
                  api={api}
                  courseSubjectId={cs.id}
                  readOnly={!canMutate}
                  teachers={data.teachers}
                  onUpdated={onSaved}
                />
              ) : null}
            </Card>
          );
        })}
        {courseSubjects.length === 0 ? (
          <EmptyState
            description="Este curso aún no tiene asignaturas asignadas. Elige una del catálogo arriba."
            title="Sin asignaturas en este curso"
          />
        ) : null}
      </div>

      {editItem ? (
        <Dialog
          description="Modifica la configuración de la asignatura en este curso."
          onOpenChange={(open) => !open && setEditItem(null)}
          open={Boolean(editItem)}
          title="Configurar asignatura del curso"
        >
          <form className="academic-form" onSubmit={handleUpdateCourseSubject}>
            <Input
              id="edit-cs-sort"
              label="Orden de presentación"
              min="0"
              type="number"
              value={editSortOrder}
              onChange={(e) => setEditSortOrder(e.target.value)}
            />
            <Checkbox
              checked={editDefault}
              description="Habilita la asignatura para todos los alumnos del curso."
              id="edit-cs-default"
              label="Asignación general del curso"
              onChange={(e) => setEditDefault(e.target.checked)}
            />
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditItem(null)}>
                Cancelar
              </Button>
              <Button loading={saving} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
