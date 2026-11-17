'use client';

import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
} from '@edupay/ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { AcademicApiClient } from '@/api/academic-client';
import {
  AccountProvisioning,
  type AccountProvisioningActions,
} from '@/components/account-provisioning';
import Link from 'next/link';

import {
  errorMessage,
  knownTotalCount,
  personCountLabel,
  studentPageSize,
  personSearchDebounceMs,
  statusLabel,
  AdminTabList,
  type AdminData,
} from './shared';

export function PersonForm({
  api,
  kind,
  onSaved,
}: {
  api: AcademicApiClient;
  kind: 'student' | 'teacher';
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (kind === 'student') {
        await api.createStudent({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
        });
      } else {
        await api.createTeacher({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
        });
      }
      setFirstName('');
      setLastName('');
      setEmail('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>{kind === 'student' ? 'Nuevo alumno manual' : 'Nuevo profesor'}</h3>
      <div className="academic-form__fields">
        <Input
          id={`${kind}-first-name`}
          label="Nombres"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Input
          id={`${kind}-last-name`}
          label="Apellidos"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <Input
          id={`${kind}-email`}
          label="Correo electrónico (opcional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        disabled={!firstName.trim() || !lastName.trim()}
        loading={saving}
        type="submit"
      >
        {kind === 'student' ? 'Crear alumno manual' : 'Crear profesor'}
      </Button>
    </form>
  );
}

export type StudentStatusFilter = '' | 'ACTIVE' | 'INACTIVE';

export interface StudentListPage {
  items: AdminData['students'];
  nextCursor: string | null;
  totalCount?: number | undefined;
}

export function studentListRequestKey(
  query: string,
  status: StudentStatusFilter,
  cursor: string | undefined,
  refreshToken: number,
  academicYearId = '',
): string {
  return JSON.stringify([
    query,
    status,
    cursor ?? null,
    refreshToken,
    academicYearId,
  ]);
}

export function StudentsView({
  api,
  academicYear,
  initialStudents,
  initialCursor,
  initialTotalCount,
  identityActions,
  onSaved,
}: {
  api: AcademicApiClient;
  /** Year whose enrollment is shown in the course column. */
  academicYear?: { id: string; label: string } | undefined;
  initialStudents: AdminData['students'];
  initialCursor?: string | null | undefined;
  initialTotalCount?: number | undefined;
  identityActions?: AccountProvisioningActions | undefined;
  onSaved: () => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StudentStatusFilter>('');
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [page, setPage] = useState<StudentListPage>({
    items: initialStudents,
    nextCursor: initialCursor ?? null,
    totalCount: initialTotalCount,
  });
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestSequence = useRef(0);
  // The parent already loaded the first unfiltered page; only request again
  // when the query, filter, page or refresh token changes.
  const lastRequestKey = useRef(studentListRequestKey('', '', undefined, 0));
  const [editStudent, setEditStudent] = useState<
    AdminData['students'][number] | null
  >(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const cursor = pageCursors[pageIndex];
  const filtered = Boolean(query) || Boolean(status);
  const searchPending = searchInput.trim() !== query;
  const totalCount = page.totalCount;
  const totalPages =
    totalCount === undefined
      ? undefined
      : Math.max(1, Math.ceil(totalCount / studentPageSize));

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === query) return;
    const timer = window.setTimeout(() => {
      setQuery(normalized);
      setPageCursors([undefined]);
      setPageIndex(0);
    }, personSearchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [query, searchInput]);

  useEffect(() => {
    const requestKey = studentListRequestKey(
      query,
      status,
      cursor,
      refreshToken,
      academicYear?.id,
    );
    if (requestKey === lastRequestKey.current) return;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      // Mark the key only once the request starts: a cancelled timer (for
      // example a remounted effect) must not suppress the request.
      lastRequestKey.current = requestKey;
      setLoadingPage(true);
      setLoadError('');
      void api
        .listStudents(
          query || undefined,
          cursor,
          status || undefined,
          academicYear?.id,
        )
        .then((result) => {
          if (sequence !== requestSequence.current) return;
          setPage({
            items: result.items,
            nextCursor: result.nextCursor,
            totalCount: knownTotalCount(result),
          });
        })
        .catch((error: unknown) => {
          if (sequence === requestSequence.current)
            setLoadError(errorMessage(error).message);
        })
        .finally(() => {
          if (sequence === requestSequence.current) setLoadingPage(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [api, academicYear?.id, cursor, query, refreshToken, status]);

  function changeStatus(nextStatus: StudentStatusFilter) {
    setStatus(nextStatus);
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  function goToNextPage() {
    if (!page.nextCursor || loadingPage) return;
    const nextCursor = page.nextCursor;
    setPageCursors((current) => [
      ...current.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((current) => current + 1);
  }

  function goToPreviousPage() {
    if (pageIndex === 0 || loadingPage) return;
    setPageIndex((current) => current - 1);
  }

  function retryPage() {
    setRefreshToken((current) => current + 1);
  }

  /** Reloads the visible page and summary counts while keeping filters. */
  function refreshAfterSave() {
    setRefreshToken((current) => current + 1);
    onSaved();
  }

  async function handleUpdateStudent(e: FormEvent) {
    e.preventDefault();
    if (!editStudent) return;
    setSavingEdit(true);
    setEditError('');
    try {
      if (editStudent.source === 'EDUPAY') {
        // Name is managed by EduPay; only email can be modified
        await api.updateStudent(editStudent.id, {
          email: editEmail.trim() || null,
        });
      } else {
        await api.updateStudent(editStudent.id, {
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          email: editEmail.trim() || null,
        });
      }
      setEditStudent(null);
      refreshAfterSave();
    } catch (err) {
      setEditError(errorMessage(err).message);
    } finally {
      setSavingEdit(false);
    }
  }

  const resultNoun = filtered ? 'resultados' : 'alumnos';
  const pageLabel =
    totalPages !== undefined && pageIndex + 1 <= totalPages
      ? `Página ${pageIndex + 1} de ${totalPages}`
      : `Página ${pageIndex + 1}`;
  const paginationSummary =
    totalCount !== undefined
      ? `${totalCount.toLocaleString('es-CL')} ${resultNoun} · ${pageLabel}`
      : pageLabel;

  return (
    <div className="people-subview">
      <div className="section-heading">
        <div>
          <h2>Alumnos</h2>
          <p>
            Fichas de alumnos y su acceso a la plataforma. Para incorporar o
            matricular alumnos, usa Matrículas.
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary ui-button--md"
          href="/administracion/matriculas"
        >
          Incorporar alumno
        </Link>
      </div>

      <div className="search-filter-toolbar">
        <div className="search-input-wrapper">
          <Input
            id="student-search-input"
            label="Buscar alumno"
            placeholder="Buscar por nombre, apellido, correo o identificador..."
            aria-busy={searchPending || loadingPage}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          id="student-status-filter"
          label="Estado"
          value={status}
          onChange={(e) => changeStatus(e.target.value as StudentStatusFilter)}
        >
          <option value="">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
        </Select>
        {searchPending || loadingPage ? (
          <span
            aria-live="polite"
            className="searching-indicator"
            role="status"
          >
            {searchPending ? 'Buscando alumnos…' : 'Cargando alumnos…'}
          </span>
        ) : null}
      </div>
      {loadError ? (
        <Alert
          action={
            <Button onClick={retryPage} variant="secondary">
              Reintentar
            </Button>
          }
          title="No pudimos cargar alumnos"
          tone="error"
        >
          {loadError} La lista de abajo corresponde a la última consulta
          completada.
        </Alert>
      ) : null}

      <div aria-busy={loadingPage} className="responsive-table">
        <table>
          <caption className="sr-only">Listado de alumnos</caption>
          <thead>
            <tr>
              <th>Alumno</th>
              {academicYear ? <th>Curso {academicYear.label}</th> : null}
              <th>Estado</th>
              <th>Acceso a la plataforma</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((student) => (
              <tr key={student.id}>
                <td data-label="Alumno">
                  <span className="person-cell">
                    <strong>
                      {student.firstName} {student.lastName}
                    </strong>
                    <small>
                      {student.source === 'EDUPAY'
                        ? 'Sincronizado desde EduPay'
                        : 'Registro manual'}
                      {student.email ? ` · ${student.email}` : ''}
                    </small>
                  </span>
                </td>
                {academicYear ? (
                  <td data-label={`Curso ${academicYear.label}`}>
                    {student.yearEnrollment ? (
                      student.yearEnrollment.courseLabel
                    ) : student.yearEnrollment === null ? (
                      <span className="table-muted">Sin matrícula</span>
                    ) : (
                      <span className="table-muted">Cargando…</span>
                    )}
                  </td>
                ) : null}
                <td data-label="Estado">
                  <Badge
                    tone={student.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(student.status)}
                  </Badge>
                </td>
                <td data-label="Acceso a la plataforma">
                  <AccountProvisioning
                    api={api}
                    identityActions={identityActions}
                    kind="student"
                    person={student}
                    onLinked={refreshAfterSave}
                  />
                </td>
                <td data-label="Acciones">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditStudent(student);
                      setEditFirstName(student.firstName);
                      setEditLastName(student.lastName);
                      setEditEmail(student.email ?? '');
                      setEditError('');
                    }}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.items.length === 0 && !loadingPage && !loadError ? (
          <EmptyState
            description={
              filtered
                ? 'No se encontraron alumnos con esta búsqueda o filtro.'
                : 'Aún no hay alumnos registrados.'
            }
            title="Sin alumnos"
          />
        ) : null}
      </div>

      {page.items.length > 0 || pageIndex > 0 ? (
        <div className="pagination-bar">
          <span aria-live="polite" className="pagination-info">
            {loadError ? 'Última consulta completada' : paginationSummary}
          </span>
          <div className="provisioning-actions">
            <Button
              disabled={pageIndex === 0 || loadingPage}
              variant="secondary"
              onClick={goToPreviousPage}
            >
              Anterior
            </Button>
            <Button
              disabled={!page.nextCursor || loadingPage}
              variant="secondary"
              onClick={goToNextPage}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      {editStudent ? (
        <Dialog
          description={
            editStudent.source === 'EDUPAY'
              ? 'Los nombres son autoritativos desde EduPay y no se pueden modificar. Puedes actualizar el correo de contacto.'
              : 'Edita los datos del alumno registrado manualmente.'
          }
          onOpenChange={(open) => !open && setEditStudent(null)}
          open={Boolean(editStudent)}
          title="Editar alumno"
        >
          <form className="academic-form" onSubmit={handleUpdateStudent}>
            {editStudent.source === 'EDUPAY' ? (
              <Alert title="Registro gestionado por EduPay" tone="info">
                El nombre y apellido provienen de la sincronización con EduPay y
                se mantienen protegidos contra sobreescritura accidental.
              </Alert>
            ) : null}
            {editStudent.identityUserId ? (
              <Alert title="Cuenta vinculada con Identity" tone="info">
                Esta cuenta ya tiene acceso de Identity vinculado. El correo de
                inicio de sesión es gestionado autoritativamente por Identity y
                no puede modificarse de forma desacoplada desde Académico.
              </Alert>
            ) : null}
            <Input
              disabled={editStudent.source === 'EDUPAY'}
              id="edit-student-firstname"
              label="Nombres"
              required
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
            />
            <Input
              disabled={editStudent.source === 'EDUPAY'}
              id="edit-student-lastname"
              label="Apellidos"
              required
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
            />
            <Input
              disabled={Boolean(editStudent.identityUserId)}
              id="edit-student-email"
              label="Correo electrónico"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditStudent(null)}>
                Cancelar
              </Button>
              <Button loading={savingEdit} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

export function TeachersView({
  api,
  initialTeachers,
  initialCursor,
  initialTotalCount,
  identityActions,
  onSaved,
}: {
  api: AcademicApiClient;
  initialTeachers: AdminData['teachers'];
  initialCursor?: string | null | undefined;
  initialTotalCount?: number | undefined;
  identityActions?: AccountProvisioningActions | undefined;
  onSaved: () => void;
}) {
  const [queriedTeachers, setQueriedTeachers] = useState<
    AdminData['teachers'] | null
  >(null);
  const [queriedCursor, setQueriedCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [queriedTotalCount, setQueriedTotalCount] = useState<
    number | undefined
  >(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [paginationError, setPaginationError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const searchSequence = useRef(0);
  const [editTeacher, setEditTeacher] = useState<
    AdminData['teachers'][number] | null
  >(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const displayedTeachers = queriedTeachers ?? initialTeachers;
  const currentCursor =
    queriedTeachers !== null ? queriedCursor : initialCursor;
  const currentTotalCount =
    queriedTeachers !== null ? queriedTotalCount : initialTotalCount;

  const handleSearch = useCallback(
    async (query: string) => {
      const sequence = ++searchSequence.current;
      const normalizedQuery = query.trim();
      setSearchError('');
      setPaginationError('');
      setLoadingMore(false);
      if (!normalizedQuery) {
        setQueriedTeachers(null);
        setQueriedCursor(undefined);
        setQueriedTotalCount(undefined);
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const res = await api.listTeachers(normalizedQuery);
        if (sequence === searchSequence.current) {
          setQueriedTeachers(res.items);
          setQueriedCursor(res.nextCursor);
          setQueriedTotalCount(res.totalCount);
        }
      } catch (error) {
        if (sequence === searchSequence.current)
          setSearchError(errorMessage(error).message);
      } finally {
        if (sequence === searchSequence.current) setSearching(false);
      }
    },
    [api],
  );

  async function handleLoadMore() {
    if (!currentCursor) return;
    const sequence = searchSequence.current;
    const query = searchTerm.trim();
    const cursor = currentCursor;
    setLoadingMore(true);
    setPaginationError('');
    try {
      const res = await api.listTeachers(query || undefined, cursor);
      if (sequence === searchSequence.current) {
        setQueriedTeachers((prev) => [
          ...(prev ?? initialTeachers),
          ...res.items,
        ]);
        setQueriedCursor(res.nextCursor);
        setQueriedTotalCount(res.totalCount);
      }
    } catch (error) {
      if (sequence === searchSequence.current)
        setPaginationError(errorMessage(error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(
      () => void handleSearch(searchTerm),
      personSearchDebounceMs,
    );
    return () => window.clearTimeout(timer);
  }, [handleSearch, searchTerm]);

  /** Refreshes counts and, when searching, the visible search results. */
  function refreshAfterSave() {
    onSaved();
    if (searchTerm.trim()) void handleSearch(searchTerm);
  }

  async function handleUpdateTeacher(e: FormEvent) {
    e.preventDefault();
    if (!editTeacher) return;
    setSavingEdit(true);
    setEditError('');
    try {
      await api.updateTeacher(editTeacher.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        email: editEmail.trim() || null,
      });
      setEditTeacher(null);
      refreshAfterSave();
    } catch (err) {
      setEditError(errorMessage(err).message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="people-subview">
      <div className="section-heading">
        <div>
          <h2>Profesores</h2>
          <p>
            Docentes del establecimiento. Gestiona sus datos, invitaciones de
            acceso y asignaciones a cursos.
          </p>
        </div>
      </div>

      <details className="admin-create-disclosure">
        <summary>
          <span>
            <strong>Incorporar profesor</strong>
            <small>Crear una ficha académica; el correo es opcional.</small>
          </span>
          <span className="admin-create-disclosure__action">
            Nuevo profesor
          </span>
        </summary>
        <PersonForm api={api} kind="teacher" onSaved={refreshAfterSave} />
      </details>

      <div className="search-filter-toolbar">
        <div className="search-input-wrapper">
          <Input
            id="teacher-search-input"
            label="Buscar profesor"
            placeholder="Buscar por nombre, apellido o correo..."
            aria-busy={searching}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {searching ? (
          <span
            aria-live="polite"
            className="searching-indicator"
            role="status"
          >
            Buscando profesores…
          </span>
        ) : null}
      </div>
      {searchError ? (
        <Alert title="No pudimos buscar profesores" tone="error">
          {searchError}
        </Alert>
      ) : null}
      {paginationError ? (
        <Alert title="No pudimos cargar más profesores" tone="error">
          {paginationError}
        </Alert>
      ) : null}

      <div className="responsive-table">
        <table>
          <caption className="sr-only">Listado de profesores</caption>
          <thead>
            <tr>
              <th>Profesor</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Acceso a la plataforma</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayedTeachers.map((teacher) => (
              <tr key={teacher.id}>
                <td data-label="Profesor">
                  <strong>
                    {teacher.firstName} {teacher.lastName}
                  </strong>
                </td>
                <td data-label="Correo">{teacher.email ?? 'Sin correo'}</td>
                <td data-label="Estado">
                  <Badge
                    tone={teacher.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(teacher.status)}
                  </Badge>
                </td>
                <td data-label="Acceso a la plataforma">
                  <AccountProvisioning
                    api={api}
                    identityActions={identityActions}
                    kind="teacher"
                    person={teacher}
                    onLinked={refreshAfterSave}
                  />
                </td>
                <td data-label="Acciones">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditTeacher(teacher);
                      setEditFirstName(teacher.firstName);
                      setEditLastName(teacher.lastName);
                      setEditEmail(teacher.email ?? '');
                      setEditError('');
                    }}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayedTeachers.length === 0 ? (
          <EmptyState
            description={
              searchTerm
                ? 'No se encontraron profesores que coincidan con la búsqueda.'
                : 'Aún no hay profesores registrados.'
            }
            title="Sin profesores"
          />
        ) : null}
      </div>

      {displayedTeachers.length > 0 ? (
        <div className="pagination-bar">
          <span className="pagination-info">
            Mostrando {displayedTeachers.length.toLocaleString('es-CL')} de{' '}
            {personCountLabel(
              currentCursor
                ? currentTotalCount
                : (currentTotalCount ?? displayedTeachers.length),
              displayedTeachers.length,
            )}{' '}
            profesores
          </span>
          {currentCursor ? (
            <Button
              loading={loadingMore}
              disabled={searching}
              variant="secondary"
              onClick={() => void handleLoadMore()}
            >
              Cargar más profesores
            </Button>
          ) : null}
        </div>
      ) : null}

      {editTeacher ? (
        <Dialog
          description="Actualiza los datos del profesor."
          onOpenChange={(open) => !open && setEditTeacher(null)}
          open={Boolean(editTeacher)}
          title="Editar profesor"
        >
          <form className="academic-form" onSubmit={handleUpdateTeacher}>
            {editTeacher.identityUserId ? (
              <Alert title="Cuenta vinculada con Identity" tone="info">
                Esta cuenta ya tiene acceso de Identity vinculado. El correo de
                inicio de sesión es gestionado autoritativamente por Identity y
                no puede modificarse de forma desacoplada desde Académico.
              </Alert>
            ) : null}
            <Input
              id="edit-teacher-firstname"
              label="Nombres"
              required
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
            />
            <Input
              id="edit-teacher-lastname"
              label="Apellidos"
              required
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
            />
            <Input
              disabled={Boolean(editTeacher.identityUserId)}
              id="edit-teacher-email"
              label="Correo electrónico"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="provisioning-actions">
              <Button variant="secondary" onClick={() => setEditTeacher(null)}>
                Cancelar
              </Button>
              <Button loading={savingEdit} type="submit">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

export function PeopleView({
  api,
  academicYear,
  data,
  identityActions,
  onPeopleSaved,
}: {
  api: AcademicApiClient;
  academicYear?: { id: string; label: string } | undefined;
  data: AdminData;
  identityActions?: AccountProvisioningActions | undefined;
  /** Refreshes summary counts without remounting the people subviews. */
  onPeopleSaved: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>(
    'students',
  );

  return (
    <div className="academic-stack">
      <AdminTabList<'students' | 'teachers'>
        idPrefix="admin-people"
        label="Directorio de personas"
        onSelect={setActiveTab}
        options={[
          {
            value: 'students',
            label: `Alumnos (${personCountLabel(data.studentsTotalCount, data.students.length)})`,
          },
          {
            value: 'teachers',
            label: `Profesores (${personCountLabel(data.teachersTotalCount, data.teachers.length)})`,
          },
        ]}
        selected={activeTab}
      />

      {activeTab === 'students' ? (
        <div
          aria-labelledby="admin-people-tab-students"
          className="admin-tab-panel"
          id="admin-people-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <StudentsView
            academicYear={academicYear}
            api={api}
            identityActions={identityActions}
            initialCursor={data.studentsNextCursor}
            initialStudents={data.students}
            initialTotalCount={data.studentsTotalCount}
            onSaved={onPeopleSaved}
          />
        </div>
      ) : null}

      {activeTab === 'teachers' ? (
        <div
          aria-labelledby="admin-people-tab-teachers"
          className="admin-tab-panel"
          id="admin-people-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <TeachersView
            api={api}
            identityActions={identityActions}
            initialCursor={data.teachersNextCursor}
            initialTeachers={data.teachers}
            initialTotalCount={data.teachersTotalCount}
            onSaved={onPeopleSaved}
          />
        </div>
      ) : null}
    </div>
  );
}
