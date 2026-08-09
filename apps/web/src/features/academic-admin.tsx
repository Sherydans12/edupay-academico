'use client';

import { Alert, Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@edupay/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { useTrustedCurrentSession, type TrustedCurrentSession } from '@/auth/current-session';
import { createAcademicApiClient } from '@/api/client-factory';
import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { AccountProvisioning, type AccountProvisioningActions } from '@/components/account-provisioning';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

type AdminView = 'overview' | 'structure' | 'people';

interface AdminData {
  academicYears: Awaited<ReturnType<AcademicApiClient['listAcademicYears']>>['items'];
  courses: Awaited<ReturnType<AcademicApiClient['listCourses']>>['items'];
  students: Awaited<ReturnType<AcademicApiClient['listStudents']>>['items'];
  teachers: Awaited<ReturnType<AcademicApiClient['listTeachers']>>['items'];
  subjects: Awaited<ReturnType<AcademicApiClient['listSubjects']>>['items'];
  courseSubjects: Awaited<ReturnType<AcademicApiClient['listCourseSubjects']>>['items'];
}

const emptyData: AdminData = { academicYears: [], courses: [], students: [], teachers: [], subjects: [], courseSubjects: [] };

function errorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof AcademicApiError) {
    if (error.status === 401) return { title: 'Sesión no disponible', message: error.message };
    if (error.status === 403) return { title: 'Sin permiso para este espacio', message: 'Tu sesión está autenticada, pero tu rol no puede administrar la estructura académica de este tenant.' };
    return { title: 'No pudimos cargar la información', message: `${error.message}${error.requestId !== 'unavailable' ? ` Código de solicitud: ${error.requestId}.` : ''}` };
  }
  return { title: 'No pudimos cargar la información', message: 'Inténtalo nuevamente. Si el problema continúa, informa el código de solicitud a soporte.' };
}

function useAdminData(api: AcademicApiClient) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [academicYears, courses, students, teachers, subjects, courseSubjects] = await Promise.all([
        api.listAcademicYears(), api.listCourses(), api.listStudents(), api.listTeachers(), api.listSubjects(), api.listCourseSubjects(),
      ]);
      setData({ academicYears: academicYears.items, courses: courses.items, students: students.items, teachers: teachers.items, subjects: subjects.items, courseSubjects: courseSubjects.items });
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void reload(), 0); return () => window.clearTimeout(timer); }, [reload]);
  return { data, error, loading, reload };
}

function DataState({ children, error, loading, onRetry }: { children: ReactNode; error: unknown; loading: boolean; onRetry: () => void }) {
  if (loading) return <div aria-label="Cargando información académica" className="academic-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (error) {
    const copy = errorMessage(error);
    return <Alert action={<Button onClick={onRetry} variant="secondary">Reintentar</Button>} title={copy.title} tone={copy.title === 'Sin permiso para este espacio' ? 'warning' : 'error'}>{copy.message}</Alert>;
  }
  return children;
}

function StorageUsageOverview({ api }: { api: AcademicApiClient }) {
  const [usage, setUsage] = useState<Awaited<ReturnType<AcademicApiClient['getStorageUsage']>> | null>(null);
  const [policy, setPolicy] = useState<Awaited<ReturnType<AcademicApiClient['getStoragePolicy']>> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (typeof api.getStorageUsage !== 'function') return;
    let mounted = true;
    void Promise.all([api.getStorageUsage(), api.getStoragePolicy()]).then(([nextUsage, nextPolicy]) => { if (mounted) { setUsage(nextUsage); setPolicy(nextPolicy); } }).catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, [api]);
  if (!usage && !error) return null;
  if (error) return <Alert title="No pudimos cargar el almacenamiento" tone="info">La información de archivos permanece protegida y no afecta las descargas autorizadas.</Alert>;
  if (!usage) return null;
  const tone = usage.state === 'FULL' || usage.state === 'CRITICAL' ? 'warning' : usage.state === 'NORMAL' ? 'success' : 'info';
  return <section aria-labelledby="storage-usage-title" className="academic-panel storage-usage-panel"><div className="section-heading"><div><h2 id="storage-usage-title">Almacenamiento del tenant</h2><p>Cuota agregada para operación académica. Esta vista no lista archivos ni sustituye la autorización de cada descarga.</p></div><Badge tone={tone}>{usage.state}</Badge></div><div className="storage-usage-grid"><div><strong>{usage.allocationPercentage}%</strong><span>asignación</span></div><div><strong>{usage.fileCount}</strong><span>archivos</span></div><div><strong>{usage.blobCount}</strong><span>blobs físicos</span></div></div><div aria-label={`Asignación de almacenamiento: ${usage.allocationPercentage}%`} className="storage-meter"><span style={{ width: `${usage.allocationPercentage}%` }} /></div><dl className="storage-usage-details"><div><dt>Usado</dt><dd>{formatBytes(usage.usedBytes)}</dd></div><div><dt>Reservado</dt><dd>{formatBytes(usage.reservedBytes)}</dd></div><div><dt>Disponible</dt><dd>{formatBytes(usage.availableBytes)}</dd></div><div><dt>Cuota del tenant</dt><dd>{formatBytes(usage.quotaBytes)}</dd></div></dl>{policy ? <p className="integration-note"><Icon name="layers" />Máximo por archivo: {formatBytes(policy.maxFileSizeBytes)} · {policy.allowedExtensions.join(', ')}</p> : null}</section>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function statusLabel(status: string) {
  return status === 'ACTIVE' ? 'Activo' : status === 'DRAFT' ? 'Borrador' : status === 'CLOSED' ? 'Cerrado' : 'Archivado';
}

function AdminOverview({ api, data }: { api: AcademicApiClient; data: AdminData }) {
  const currentYear = data.academicYears.find((year) => year.status === 'ACTIVE') ?? data.academicYears[0];
  return <>
    <Alert title="Datos académicos reales" tone="success">Esta vista usa registros del Academic Structure API. Credenciales, membresías y sesiones siguen perteneciendo a EduPay Identity.</Alert>
    <div className="compact-stats academic-stats">
      <Card className="compact-stat"><span><Icon name="people" /></span><div><strong>{data.students.length}</strong><small>estudiantes registrados</small></div></Card>
      <Card className="compact-stat"><span><Icon name="book" /></span><div><strong>{data.courseSubjects.length}</strong><small>espacios de asignatura</small></div></Card>
      <Card className="compact-stat"><span><Icon name="calendar" /></span><div><strong>{currentYear?.label ?? '—'}</strong><small>año académico activo</small></div></Card>
    </div>
    <div className="academic-admin__grid">
      <Card><div className="admin-card-heading"><div><span className="admin-icon"><Icon name="layers" /></span><div><h2>Estructura académica</h2><p>{data.academicYears.length} años · {data.courses.length} cursos · {data.subjects.length} materias catalogadas</p></div></div><Badge tone="info">API</Badge></div></Card>
      <Card><div className="admin-card-heading"><div><span className="admin-icon"><Icon name="people" /></span><div><h2>Personas y acceso académico</h2><p>{data.students.length} estudiantes · {data.teachers.length} docentes con registros separados de Identity</p></div></div><Badge tone="info">API</Badge></div></Card>
    </div>
    <StorageUsageOverview api={api} />
  </>;
}

function AcademicYearForm({ api, onSaved }: { api: AcademicApiClient; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.createAcademicYear({ label, startDate, endDate }); setLabel(''); setStartDate(''); setEndDate(''); onSaved(); }
    catch (nextError) { setError(errorMessage(nextError).message); } finally { setSaving(false); }
  }
  return <form className="academic-form" onSubmit={submit}><h3>Nuevo año académico</h3><div className="academic-form__fields"><Input id="academic-year-label" label="Nombre" placeholder="2027" value={label} onChange={(event) => setLabel(event.target.value)} required /><Input id="academic-year-start" label="Inicio" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /><Input id="academic-year-end" label="Término" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button loading={saving} type="submit">Crear año</Button></form>;
}

function StructureView({ api, data, onSaved }: { api: AcademicApiClient; data: AdminData; onSaved: () => void }) {
  const [selectedCourseId, setSelectedCourseId] = useState(data.courses[0]?.id ?? '');
  const selectedCourse = data.courses.find((course) => course.id === selectedCourseId);
  const courseSubjects = data.courseSubjects.filter((courseSubject) => courseSubject.courseId === selectedCourseId);
  return <div className="academic-stack">
    <section className="academic-panel"><div className="section-heading"><div><h2>Años académicos</h2><p>Los años cerrados y archivados se conservan; no se eliminan.</p></div></div><AcademicYearForm api={api} onSaved={onSaved} /><div className="responsive-table"><table><caption className="sr-only">Años académicos</caption><thead><tr><th>Nombre</th><th>Periodo</th><th>Estado</th></tr></thead><tbody>{data.academicYears.map((year) => <tr key={year.id}><td data-label="Nombre">{year.label}</td><td data-label="Periodo">{year.startDate} → {year.endDate}</td><td data-label="Estado"><Badge tone={year.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusLabel(year.status)}</Badge></td></tr>)}</tbody></table>{data.academicYears.length === 0 ? <EmptyState title="Aún no hay años" description="Crea el primer año académico para comenzar a configurar cursos." /> : null}</div></section>
    <section className="academic-panel"><div className="section-heading"><div><h2>Cursos y roster</h2><p>Un curso pertenece a un año académico y reúne a sus estudiantes.</p></div><Select id="structure-course" label="Curso" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}><option value="">Selecciona un curso</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}</Select></div>{selectedCourse ? <CourseRoster api={api} course={selectedCourse} /> : <EmptyState title="Selecciona un curso" description="Elige un curso para revisar su roster." />}</section>
    <section className="academic-panel"><div className="section-heading"><div><h2>Catálogo y configuración de CourseSubjects</h2><p>Subject es el catálogo reutilizable; CourseSubject es el espacio específico de cada curso.</p></div></div><div className="admin-inline-grid"><div><h3>Catálogo de subjects</h3><ul className="admin-list">{data.subjects.map((subject) => <li key={subject.id}><span>{subject.name}</span><Badge tone="neutral">{statusLabel(subject.status)}</Badge></li>)}</ul></div><div><h3>{selectedCourse ? `CourseSubjects · ${selectedCourse.label}` : 'CourseSubjects'}</h3>{courseSubjects.length ? <ul className="admin-list">{courseSubjects.map((courseSubject) => <li key={courseSubject.id}><span>{courseSubject.subject?.name ?? data.subjects.find((subject) => subject.id === courseSubject.subjectId)?.name ?? courseSubject.subjectId}<small>{courseSubject.defaultForCourse ? 'Por defecto para el curso' : 'Asignación directa'}</small></span><Badge tone={courseSubject.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusLabel(courseSubject.status)}</Badge></li>)}</ul> : <EmptyState title="Sin CourseSubjects" description="Este curso aún no tiene espacios de asignatura configurados." />}</div></div></section>
  </div>;
}

function CourseRoster({ api, course }: { api: AcademicApiClient; course: AdminData['courses'][number] }) {
  const [roster, setRoster] = useState<Awaited<ReturnType<AcademicApiClient['getCourseRoster']>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); void api.getCourseRoster(course.id).then(setRoster).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [api, course.id]);
  if (loading) return <div className="academic-loading"><Skeleton /><Skeleton /></div>;
  if (!roster.length) return <EmptyState title="Roster vacío" description={`Todavía no hay estudiantes inscritos en ${course.label}.`} />;
  return <div className="responsive-table"><table><caption className="sr-only">Roster de {course.label}</caption><thead><tr><th>Estudiante</th><th>Correo</th><th>Estado</th></tr></thead><tbody>{roster.map((item) => <tr key={item.enrollmentId}><td data-label="Estudiante">{item.student.firstName} {item.student.lastName}</td><td data-label="Correo">{item.student.email ?? 'Sin correo'}</td><td data-label="Estado"><Badge tone="success">Activo</Badge></td></tr>)}</tbody></table></div>;
}

function PersonForm({ api, kind, onSaved }: { api: AcademicApiClient; kind: 'student' | 'teacher'; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [email, setEmail] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(''); try { if (kind === 'student') await api.createStudent({ firstName, lastName, email: email || undefined }); else await api.createTeacher({ firstName, lastName, email: email || undefined }); setFirstName(''); setLastName(''); setEmail(''); onSaved(); } catch (nextError) { setError(errorMessage(nextError).message); } finally { setSaving(false); } }
  return <form className="academic-form" onSubmit={submit}><h3>Nuevo {kind === 'student' ? 'estudiante' : 'docente'}</h3><div className="academic-form__fields"><Input id={`${kind}-first-name`} label="Nombres" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /><Input id={`${kind}-last-name`} label="Apellidos" value={lastName} onChange={(event) => setLastName(event.target.value)} required /><Input id={`${kind}-email`} label="Correo (opcional)" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button loading={saving} type="submit">Guardar registro</Button></form>;
}

function PeopleView({ api, data, identityActions, onSaved }: { api: AcademicApiClient; data: AdminData; identityActions?: AccountProvisioningActions | undefined; onSaved: () => void }) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? ''); const [studentId, setStudentId] = useState(data.students[0]?.id ?? ''); const [courseSubjectId, setCourseSubjectId] = useState(data.courseSubjects[0]?.id ?? ''); const [teacherId, setTeacherId] = useState(data.teachers[0]?.id ?? ''); const availableCourseSubjects = data.courseSubjects.filter((item) => !courseId || item.courseId === courseId);
  const [actionError, setActionError] = useState('');
  async function run(action: () => Promise<unknown>) { try { setActionError(''); await action(); onSaved(); } catch (error) { setActionError(errorMessage(error).message); } }
  return <div className="academic-stack"><div className="admin-two-column"><section className="academic-panel"><h2>Estudiantes</h2><PersonForm api={api} kind="student" onSaved={onSaved} /><PersonList api={api} empty="Aún no hay estudiantes registrados." identityActions={identityActions} items={data.students} kind="student" onLinked={onSaved} /></section><section className="academic-panel"><h2>Docentes</h2><PersonForm api={api} kind="teacher" onSaved={onSaved} /><PersonList api={api} empty="Aún no hay docentes registrados." identityActions={identityActions} items={data.teachers} kind="teacher" onLinked={onSaved} /></section></div><section className="academic-panel"><div className="section-heading"><div><h2>Inscripciones y asignaciones</h2><p>Estas relaciones se guardan en Académico; Identity solo aporta la identidad confiable.</p></div></div>{actionError ? <Alert title="No se pudo guardar la relación" tone="error">{actionError}</Alert> : null}<div className="assignment-form-grid"><form className="academic-form" onSubmit={(event) => { event.preventDefault(); void run(() => api.enrollStudent({ studentId, courseId })); }}><h3>Inscribir en curso</h3><Select id="enroll-student" label="Estudiante" value={studentId} onChange={(event) => setStudentId(event.target.value)}>{data.students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</Select><Select id="enroll-course" label="Curso" value={courseId} onChange={(event) => setCourseId(event.target.value)}>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}</Select><Button type="submit" disabled={!studentId || !courseId}>Inscribir estudiante</Button></form><form className="academic-form" onSubmit={(event) => { event.preventDefault(); void run(() => api.assignCourseSubjectTeachers({ courseSubjectId, teacherIds: [teacherId] })); }}><h3>Asignar docente a CourseSubject</h3><Select id="assignment-course-subject" label="CourseSubject" value={courseSubjectId} onChange={(event) => setCourseSubjectId(event.target.value)}>{availableCourseSubjects.map((item) => <option key={item.id} value={item.id}>{item.subject?.name ?? item.subjectId}</option>)}</Select><Select id="assignment-teacher" label="Docente" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</Select><Button type="submit" disabled={!courseSubjectId || !teacherId}>Guardar asignación</Button></form><form className="academic-form" onSubmit={(event) => { event.preventDefault(); void run(() => api.directlyEnrollStudent({ studentId, courseSubjectId })); }}><h3>Asignar subject directamente</h3><Select id="direct-student" label="Estudiante" value={studentId} onChange={(event) => setStudentId(event.target.value)}>{data.students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</Select><Select id="direct-course-subject" label="CourseSubject" value={courseSubjectId} onChange={(event) => setCourseSubjectId(event.target.value)}>{availableCourseSubjects.map((item) => <option key={item.id} value={item.id}>{item.subject?.name ?? item.subjectId}</option>)}</Select><Button type="submit" disabled={!studentId || !courseSubjectId}>Asignar subject</Button></form></div></section></div>;
}

function PersonList({ api, empty, identityActions, items, kind, onLinked }: { api: AcademicApiClient; empty: string; identityActions?: AccountProvisioningActions | undefined; items: AdminData['students']; kind: 'student' | 'teacher'; onLinked: () => void }) { return items.length ? <ul className="admin-list person-access-list">{items.map((item) => <li key={item.id}><span><strong>{item.firstName} {item.lastName}</strong><small>{item.email ?? 'Sin correo'} · {item.identityUserId ? 'Identidad vinculada' : 'Sin acceso de Identity'}</small></span><div className="person-access-list__actions"><Badge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusLabel(item.status)}</Badge><AccountProvisioning api={api} identityActions={identityActions} kind={kind} onLinked={onLinked} person={item} /></div></li>)}</ul> : <EmptyState title="Sin registros" description={empty} />; }

export function AcademicAdminScreen({ api, identityActions, session = demoSessions.admin, view }: { api?: AcademicApiClient; identityActions?: AccountProvisioningActions | undefined; session?: TrustedCurrentSession; view: AdminView }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { data, error, loading, reload } = useAdminData(client);
  return <AppShell dataMode="real" session={currentSession}><PageHeading description={view === 'overview' ? 'Una vista práctica del estado académico del tenant.' : view === 'structure' ? 'Configura años, cursos, roster y CourseSubjects sin salir del espacio académico.' : 'Administra registros académicos y crea accesos de Identity desde cada persona.'} title={view === 'overview' ? 'Administración académica' : view === 'structure' ? 'Estructura académica' : 'Personas y asignaciones'} /><DataState error={error} loading={loading} onRetry={() => void reload()}>{view === 'overview' ? <AdminOverview api={client} data={data} /> : view === 'structure' ? <StructureView api={client} data={data} onSaved={() => void reload()} /> : <PeopleView api={client} data={data} identityActions={identityActions} onSaved={() => void reload()} />}</DataState></AppShell>;
}
