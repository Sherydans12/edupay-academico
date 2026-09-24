'use client';

import { Alert, Badge, Button, EmptyState, Skeleton } from '@edupay/ui';
import type {
  DieAction,
  DieJournalEntry,
  DieMember,
  DieStudentSummary,
  TenantOperationalProfile,
} from '@edupay/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

type View = 'students' | 'journal' | 'actions' | 'members' | 'profile';
const categories = [
  ['OBSERVATION', 'Observación'],
  ['BEHAVIOR_SITUATION', 'Situación de conducta'],
  ['INTERVENTION_OR_ATTENTION', 'Intervención o atención'],
  ['INTERVIEW_OR_MEETING', 'Entrevista o reunión'],
  ['AGREEMENT', 'Acuerdo'],
  ['PROGRESS_OR_RECOGNITION', 'Avance o reconocimiento'],
  ['OTHER', 'Otro'],
] as const;

function today(timeZone: string | null) {
  if (!timeZone) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function message(error: unknown) {
  if (error instanceof AcademicApiError && error.status === 403)
    return 'Tu cuenta no tiene acceso vigente al módulo DIE.';
  if (error instanceof AcademicApiError) return error.message;
  return 'No pudimos completar la operación. Revisa tu conexión e inténtalo nuevamente.';
}

export function DieWorkspace({
  api,
  session: suppliedSession = demoSessions.admin,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const { session } = useTrustedCurrentSession(suppliedSession);
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const contextKey = `${session.tenantId}:${session.membershipId}`;
  const loadRequest = useRef(0);
  const journalRequest = useRef(0);
  const loadedContextKeyRef = useRef('');
  const [view, setView] = useState<View>('students');
  const [members, setMembers] = useState<DieMember[]>([]);
  const [students, setStudents] = useState<DieStudentSummary[]>([]);
  const [actions, setActions] = useState<DieAction[]>([]);
  const [journal, setJournal] = useState<DieJournalEntry[]>([]);
  const [profile, setProfile] = useState<TenantOperationalProfile | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [journalLoading, setJournalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedContextKey, setLoadedContextKey] = useState('');
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const contextChanged = loadedContextKeyRef.current !== contextKey;
    setLoading(true);
    setError(null);
    if (contextChanged) {
      setLoadedContextKey('');
      setJournal([]);
      setProfile(null);
      setSelectedStudentId('');
      setJournalLoading(false);
      journalRequest.current += 1;
    }
    try {
      await client.getDieAccess();
      const [nextMembers, nextStudents, nextActions, nextProfile] =
        await Promise.all([
          client.listDieMembers(),
          client.listDieStudents(),
          client.listDieActions(),
          client.getTenantOperationalProfile(),
        ]);
      if (loadRequest.current !== requestId) return;
      setMembers(nextMembers);
      setStudents(nextStudents);
      setActions(nextActions);
      setProfile(nextProfile);
      if (!contextChanged)
        setSelectedStudentId((current) =>
          nextStudents.some((student) => student.studentId === current)
            ? current
            : '',
        );
      setLoadedContextKey(contextKey);
      loadedContextKeyRef.current = contextKey;
    } catch (nextError) {
      if (loadRequest.current === requestId) setError(nextError);
    } finally {
      if (loadRequest.current === requestId) setLoading(false);
    }
  }, [client, contextKey]);

  const loadJournal = useCallback(async () => {
    const requestId = ++journalRequest.current;
    if (!selectedStudentId) {
      setJournal([]);
      setJournalLoading(false);
      return;
    }
    setJournal([]);
    setJournalLoading(true);
    try {
      const nextJournal = await client.listDieJournal(selectedStudentId, {
        includeVoided: true,
      });
      if (journalRequest.current !== requestId) return;
      setJournal(nextJournal);
    } catch (nextError) {
      if (journalRequest.current === requestId) setError(nextError);
    } finally {
      if (journalRequest.current === requestId) setJournalLoading(false);
    }
  }, [client, selectedStudentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadJournal(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJournal]);

  const contextIsCurrent = loadedContextKey === contextKey;
  const selectedStudent = contextIsCurrent
    ? students.find((student) => student.studentId === selectedStudentId)
    : undefined;
  return (
    <AppShell
      dataMode={api ? 'demo' : 'real'}
      dieAccessGranted
      session={session}
    >
      <PageHeading
        title="Inclusión educativa"
        description="Acompañamientos, hoja de vida y acciones del equipo DIE."
        action={
          selectedStudent && view !== 'journal' ? (
            <Button
              aria-label={`${selectedStudent.activeEpisode ? 'Registrar situación para' : 'Abrir hoja de vida de'} ${selectedStudent.displayName}`}
              onClick={() => setView('journal')}
            >
              <Icon name={selectedStudent.activeEpisode ? 'plus' : 'history'} />
              {selectedStudent.activeEpisode
                ? `Registrar para ${selectedStudent.displayName}`
                : `Hoja de vida · ${selectedStudent.displayName}`}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <Alert
          title="No pudimos abrir Inclusión Educativa"
          tone="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {message(error)}
        </Alert>
      ) : null}
      {!error && profile && !profile.complete ? (
        <Alert
          title="Falta configurar el perfil institucional"
          tone="warning"
          action={
            session.roles.includes('TENANT_ADMIN') ? (
              <Button variant="secondary" onClick={() => setView('profile')}>
                Configurar perfil
              </Button>
            ) : undefined
          }
        >
          {profile.timeZone
            ? 'Completa el nombre institucional para habilitar la exportación PDF.'
            : 'Configura la zona horaria institucional para registrar horas y calcular vencimientos. Las fechas sin hora siguen disponibles.'}
        </Alert>
      ) : null}
      {loading || !contextIsCurrent ? (
        <div className="die-loading">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : !error ? (
        <div className="die-workspace">
          <nav
            aria-label="Secciones de Inclusión Educativa"
            className="die-tabs"
          >
            {(
              [
                ['students', 'Alumnos', 'people'],
                ['journal', 'Hoja de vida', 'history'],
                ['actions', 'Pendientes', 'clipboard'],
                ['members', 'Equipo', 'review'],
                ...(session.roles.includes('TENANT_ADMIN')
                  ? ([['profile', 'Perfil', 'settings']] as const)
                  : []),
              ] as const
            ).map(([id, label, icon]) => (
              <button
                aria-current={view === id ? 'page' : undefined}
                className={view === id ? 'die-tab die-tab--active' : 'die-tab'}
                key={id}
                onClick={() => setView(id)}
                type="button"
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </nav>
          {view === 'students' ? (
            <StudentsPanel
              api={client}
              members={members}
              timeZone={profile?.timeZone ?? null}
              onChanged={load}
              onSelect={(id) => {
                setJournal([]);
                setJournalLoading(true);
                setSelectedStudentId(id);
                setView('journal');
              }}
              students={students}
            />
          ) : null}
          {view === 'journal' ? (
            <JournalPanel
              api={client}
              entries={journal}
              journalLoading={journalLoading}
              onChanged={async () => {
                await loadJournal();
                await load();
              }}
              selectedStudent={selectedStudent}
              sessionUserId={session.identityUserId}
              profile={profile}
              onChangeStudent={() => setView('students')}
            />
          ) : null}
          {view === 'actions' ? (
            <ActionsPanel
              actions={actions}
              api={client}
              members={members}
              onChanged={load}
              selectedStudentId={selectedStudentId}
              students={students}
            />
          ) : null}
          {view === 'members' ? (
            <MembersPanel
              api={client}
              currentIdentityUserId={session.identityUserId}
              members={members}
              onChanged={load}
              tenantAdmin={session.roles.includes('TENANT_ADMIN')}
            />
          ) : null}
          {view === 'profile' && profile ? (
            <ProfilePanel api={client} onChanged={load} profile={profile} />
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function StudentsPanel({
  api,
  members,
  onChanged,
  onSelect,
  students,
  timeZone,
}: {
  api: AcademicApiClient;
  members: DieMember[];
  onChanged: () => Promise<void>;
  onSelect: (id: string) => void;
  students: DieStudentSummary[];
  timeZone: string | null;
}) {
  const [candidates, setCandidates] = useState<
    Awaited<ReturnType<AcademicApiClient['listDieStudentCandidates']>>
  >([]);
  const [search, setSearch] = useState('');
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterStatus, setRosterStatus] = useState<
    'ALL' | 'ACTIVE' | 'FINISHED'
  >('ALL');
  const [studentId, setStudentId] = useState('');
  const [startDate, setStartDate] = useState(today(timeZone));
  const [reason, setReason] = useState('');
  const [responsible, setResponsible] = useState('');
  const [finishing, setFinishing] = useState<DieStudentSummary | null>(null);
  const [finishDate, setFinishDate] = useState(today(timeZone));
  const [finishReason, setFinishReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visibleStudents = students.filter((student) => {
    const matchesQuery = student.displayName
      .toLocaleLowerCase('es-CL')
      .includes(rosterQuery.trim().toLocaleLowerCase('es-CL'));
    const matchesStatus =
      rosterStatus === 'ALL' ||
      (rosterStatus === 'ACTIVE'
        ? Boolean(student.activeEpisode)
        : !student.activeEpisode);
    return matchesQuery && matchesStatus;
  });
  async function find() {
    try {
      const rows = await api.listDieStudentCandidates(search);
      setCandidates(rows);
      setStudentId(rows[0]?.studentId ?? '');
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.startDieSupport({
        studentId,
        startDate,
        reason,
        ...(responsible ? { responsibleMemberAssignmentId: responsible } : {}),
      });
      setReason('');
      setCandidates([]);
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function finish(student: DieStudentSummary) {
    if (!student.activeEpisode) return;
    setBusy(true);
    setError('');
    try {
      await api.finishDieSupport(student.activeEpisode.id, {
        endDate: finishDate,
        reason: finishReason,
      });
      setFinishing(null);
      setFinishReason('');
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="die-section">
      <div className="die-split-heading">
        <div>
          <h2>Alumnos acompañados</h2>
          <p>
            Un único episodio activo por alumno; cada reanudación conserva los
            períodos anteriores.
          </p>
        </div>
      </div>
      {error ? (
        <Alert title="Revisa la operación" tone="error">
          {error}
        </Alert>
      ) : null}
      {finishing ? (
        <div className="die-inline-decision">
          <strong>Finalizar acompañamiento de {finishing.displayName}</strong>
          <label>
            Fecha de finalización
            <input
              type="date"
              value={finishDate}
              onChange={(event) => setFinishDate(event.target.value)}
            />
          </label>
          <label>
            Motivo
            <textarea
              autoFocus
              required
              rows={2}
              value={finishReason}
              onChange={(event) => setFinishReason(event.target.value)}
            />
          </label>
          <div className="die-row-actions">
            <Button variant="secondary" onClick={() => setFinishing(null)}>
              Volver
            </Button>
            <Button
              disabled={!finishReason.trim()}
              onClick={() => void finish(finishing)}
            >
              Confirmar finalización
            </Button>
          </div>
        </div>
      ) : null}
      <div className="die-two-column die-students-layout">
        <div className="die-roster">
          {students.length ? (
            <div className="die-roster-tools">
              <label>
                Buscar alumno
                <input
                  type="search"
                  placeholder="Nombre o apellido"
                  value={rosterQuery}
                  onChange={(event) => setRosterQuery(event.target.value)}
                />
              </label>
              <label>
                Acompañamiento
                <select
                  value={rosterStatus}
                  onChange={(event) =>
                    setRosterStatus(event.target.value as typeof rosterStatus)
                  }
                >
                  <option value="ALL">Todos</option>
                  <option value="ACTIVE">Activo</option>
                  <option value="FINISHED">Finalizado</option>
                </select>
              </label>
            </div>
          ) : null}
          {visibleStudents.length ? (
            visibleStudents.map((student) => (
              <article className="die-student-row" key={student.studentId}>
                <button
                  aria-label={`Abrir hoja de vida de ${student.displayName}`}
                  className="die-student-open"
                  onClick={() => onSelect(student.studentId)}
                  type="button"
                >
                  <span className="die-avatar">
                    {student.displayName
                      .split(' ')
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <span>
                    <strong>{student.displayName}</strong>
                    <small>
                      {student.activeEpisode
                        ? `${student.activeEpisode.academicContext.courseLabel ?? 'Curso no informado'} · desde ${student.activeEpisode.startDate}`
                        : `${student.latestEpisode.academicContext.courseLabel ?? 'Curso no informado'} · finalizado ${student.latestEpisode.endDate ?? ''}`}
                    </small>
                  </span>
                </button>
                <div className="die-row-actions">
                  <Badge tone={student.activeEpisode ? 'success' : 'neutral'}>
                    {student.activeEpisode ? 'Activo' : 'Finalizado'}
                  </Badge>
                  {student.activeEpisode ? (
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() => {
                        setFinishing(student);
                        setFinishDate(today(timeZone));
                        setFinishReason('');
                      }}
                    >
                      Finalizar
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          ) : students.length ? (
            <EmptyState
              icon={<Icon name="search" />}
              title="No hay coincidencias"
              description="Prueba otro nombre o cambia el estado del acompañamiento."
            />
          ) : (
            <EmptyState
              icon={<Icon name="people" />}
              title="Aún no hay alumnos acompañados"
              description="Busca un alumno del tenant e inicia su primer período de acompañamiento."
            />
          )}
        </div>
        <details className="die-form-disclosure">
          <summary className="die-disclosure-trigger">
            <Icon name="plus" />
            Incorporar alumno
            <Icon className="die-disclosure-chevron" name="chevron-down" />
          </summary>
          <form
            className="die-form-panel"
            onSubmit={(event) => void start(event)}
          >
            <div>
              <h3>Iniciar o retomar acompañamiento</h3>
              <p>La selección reutiliza la ficha académica del alumno.</p>
            </div>
            <label>
              Buscar alumno o curso
              <span className="die-search-row">
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nombre, apellido o curso"
                  value={search}
                />
                <Button
                  disabled={!search.trim()}
                  type="button"
                  variant="secondary"
                  onClick={() => void find()}
                >
                  <Icon name="search" />
                  Buscar
                </Button>
              </span>
            </label>
            <label>
              Alumno
              <select
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                <option value="">Selecciona</option>
                {candidates.map((candidate) => (
                  <option key={candidate.studentId} value={candidate.studentId}>
                    {candidate.displayName}
                    {candidate.courseLabel ? ` · ${candidate.courseLabel}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de inicio
              <input
                required
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Motivo
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe la barrera o necesidad de acompañamiento con lenguaje objetivo."
              />
            </label>
            <label>
              Profesional responsable <span>(opcional)</span>
              <select
                value={responsible}
                onChange={(event) => setResponsible(event.target.value)}
              >
                <option value="">Sin asignar</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy || !studentId || !reason.trim()}
              type="submit"
            >
              {busy ? 'Guardando…' : 'Iniciar acompañamiento'}
            </Button>
          </form>
        </details>
      </div>
    </section>
  );
}

function JournalPanel({
  api,
  entries,
  journalLoading,
  onChangeStudent,
  onChanged,
  selectedStudent,
  sessionUserId,
  profile,
}: {
  api: AcademicApiClient;
  entries: DieJournalEntry[];
  journalLoading: boolean;
  onChangeStudent: () => void;
  onChanged: () => Promise<void>;
  selectedStudent: DieStudentSummary | undefined;
  sessionUserId: string;
  profile: TenantOperationalProfile | null;
}) {
  const [editing, setEditing] = useState<DieJournalEntry | null>(null);
  const [category, setCategory] =
    useState<(typeof categories)[number][0]>('OBSERVATION');
  const [eventDate, setEventDate] = useState(today(profile?.timeZone ?? null));
  const [eventTime, setEventTime] = useState('');
  const [approximate, setApproximate] = useState(false);
  const [source, setSource] = useState<'WITNESSED' | 'REPORTED_BY_THIRD_PARTY'>(
    'WITNESSED',
  );
  const [thirdParty, setThirdParty] = useState('');
  const [place, setPlace] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [reason, setReason] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [voidingId, setVoidingId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const authors = useMemo(
    () =>
      Array.from(
        new Map(
          entries.map((entry) => [
            entry.originalAuthorIdentityUserId,
            entry.originalAuthorDisplayLabel,
          ]),
        ).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1], 'es-CL')),
    [entries],
  );
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const current = entry.current;
        return (
          (!filterFrom || current.eventDate >= filterFrom) &&
          (!filterTo || current.eventDate <= filterTo) &&
          (!filterCategory || current.category === filterCategory) &&
          (!filterAuthor ||
            entry.originalAuthorIdentityUserId === filterAuthor) &&
          (includeVoided || entry.status !== 'VOIDED')
        );
      }),
    [
      entries,
      filterAuthor,
      filterCategory,
      filterFrom,
      filterTo,
      includeVoided,
    ],
  );
  const reset = () => {
    setEditing(null);
    setCategory('OBSERVATION');
    setEventDate(today(profile?.timeZone ?? null));
    setTitle('');
    setDescription('');
    setImmediateAction('');
    setPlace('');
    setEventTime('');
    setApproximate(false);
    setSource('WITNESSED');
    setThirdParty('');
    setReason('');
    setDetailsOpen(false);
  };
  function edit(entry: DieJournalEntry) {
    const row = entry.current;
    setEditing(entry);
    setCategory(row.category);
    setEventDate(row.eventDate);
    setEventTime(row.eventTime ?? '');
    setApproximate(row.eventTimeApproximate);
    setSource(row.informationSource);
    setThirdParty(row.thirdPartySource ?? '');
    setPlace(row.place ?? '');
    setTitle(row.title);
    setDescription(row.description);
    setImmediateAction(row.immediateAction ?? '');
    setReason('');
    setDetailsOpen(
      Boolean(
        row.eventTime ||
        row.place ||
        row.immediateAction ||
        row.informationSource === 'REPORTED_BY_THIRD_PARTY',
      ),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedStudent?.activeEpisode) return;
    setBusy(true);
    setError('');
    const content = {
      category,
      eventDate,
      eventTime: eventTime || null,
      eventTimeApproximate: approximate,
      place: place || null,
      title,
      description,
      immediateAction: immediateAction || null,
      informationSource: source,
      thirdPartySource:
        source === 'REPORTED_BY_THIRD_PARTY' ? thirdParty : null,
    };
    try {
      if (editing)
        await api.correctDieJournalEntry(editing.id, {
          ...content,
          reason:
            editing.originalAuthorIdentityUserId === sessionUserId
              ? reason || null
              : reason,
        });
      else
        await api.createDieJournalEntry({
          ...content,
          studentId: selectedStudent.studentId,
          supportEpisodeId: selectedStudent.activeEpisode.id,
        });
      reset();
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function attach(entry: DieJournalEntry, file: File | null) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const intent = await api.createDieUploadIntent(entry.id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      await api.completeUploadIntent(intent, file);
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function voidEntry(entry: DieJournalEntry) {
    if (!voidReason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.voidDieJournalEntry(entry.id, voidReason);
      setVoidingId('');
      setVoidReason('');
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function exportPdf() {
    if (!selectedStudent) return;
    try {
      const blob = await api.exportDiePdf(selectedStudent.studentId, {
        ...(filterFrom ? { from: filterFrom } : {}),
        ...(filterTo ? { to: filterTo } : {}),
        ...(filterCategory ? { category: filterCategory } : {}),
        ...(filterAuthor ? { authorIdentityUserId: filterAuthor } : {}),
        includeVoided,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `hoja-vida-${selectedStudent.displayName.toLowerCase().replaceAll(' ', '-')}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function downloadAttachment(fileObjectId: string, fallback: string) {
    setError('');
    try {
      const { blob, filename } = await api.downloadFile(fileObjectId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? fallback;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(message(cause));
    }
  }
  if (!selectedStudent)
    return (
      <EmptyState
        icon={<Icon name="history" />}
        title="Selecciona un alumno"
        description="Abre un alumno acompañado para consultar o registrar su hoja de vida."
      />
    );
  return (
    <section className="die-section">
      <div className="die-student-context">
        <div>
          <span>Alumno en contexto</span>
          <h2>{selectedStudent.displayName}</h2>
          <p>
            {selectedStudent.activeEpisode?.academicContext.courseLabel ??
              selectedStudent.latestEpisode.academicContext.courseLabel ??
              'Curso no informado'}
            {' · '}
            {selectedStudent.activeEpisode
              ? 'Acompañamiento activo'
              : 'Acompañamiento finalizado; historial disponible'}
          </p>
        </div>
        <div className="die-student-context-actions">
          <Button variant="ghost" onClick={onChangeStudent}>
            Cambiar alumno
          </Button>
          <Button
            disabled={!profile?.institutionDisplayName}
            title={
              profile?.institutionDisplayName
                ? undefined
                : 'Completa Perfil institucional para habilitar el PDF.'
            }
            variant="secondary"
            onClick={() => void exportPdf()}
          >
            <Icon name="download" />
            Exportar PDF
          </Button>
        </div>
      </div>
      {!profile?.institutionDisplayName ? (
        <p className="die-help">
          Completa Perfil institucional para habilitar la exportación PDF.
        </p>
      ) : null}
      {error ? (
        <Alert title="Revisa el registro" tone="error">
          {error}
        </Alert>
      ) : null}
      <div className="die-history-toolbar">
        <p aria-live="polite">
          {visibleEntries.length}{' '}
          {visibleEntries.length === 1 ? 'registro' : 'registros'}
          {includeVoided ? ' · incluye anulados' : ''}
        </p>
        <details
          className="die-filter-disclosure"
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          open={filtersOpen}
        >
          <summary className="die-disclosure-trigger">
            <Icon name="search" />
            Filtrar historial
            <Icon className="die-disclosure-chevron" name="chevron-down" />
          </summary>
          <div className="die-filter-bar" aria-label="Filtros de hoja de vida">
            <label>
              Desde
              <input
                type="date"
                value={filterFrom}
                onChange={(event) => setFilterFrom(event.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={filterTo}
                onChange={(event) => setFilterTo(event.target.value)}
              />
            </label>
            <label>
              Categoría
              <select
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
              >
                <option value="">Todas</option>
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Autor
              <select
                value={filterAuthor}
                onChange={(event) => setFilterAuthor(event.target.value)}
              >
                <option value="">Todos</option>
                {authors.map(([authorId, authorLabel]) => (
                  <option key={authorId} value={authorId}>
                    {authorLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="die-checkbox">
              <input
                checked={includeVoided}
                type="checkbox"
                onChange={(event) => setIncludeVoided(event.target.checked)}
              />
              Incluir anulados
            </label>
          </div>
        </details>
      </div>
      <div className="die-case-layout">
        <form
          className="die-form-panel die-entry-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="die-form-title">
            <div>
              <h3>{editing ? 'Corregir registro' : 'Registrar situación'}</h3>
              <p>
                Fecha, categoría, título y descripción son los datos
                principales.
              </p>
            </div>
            {editing ? (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            ) : null}
          </div>
          <div className="die-form-grid">
            <label>
              Categoría
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as typeof category)
                }
              >
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha del hecho
              <input
                required
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
              />
            </label>
          </div>
          <label>
            Título
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Descripción objetiva
            <textarea
              required
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Registra hechos observables, contexto y participantes; evita interpretaciones clínicas no confirmadas."
            />
          </label>
          <fieldset>
            <legend>Origen de la información</legend>
            <label className="die-radio">
              <input
                checked={source === 'WITNESSED'}
                name="source"
                type="radio"
                onChange={() => setSource('WITNESSED')}
              />
              Hecho presenciado
            </label>
            <label className="die-radio">
              <input
                checked={source === 'REPORTED_BY_THIRD_PARTY'}
                name="source"
                type="radio"
                onChange={() => setSource('REPORTED_BY_THIRD_PARTY')}
              />
              Informado por terceros
            </label>
            {source === 'REPORTED_BY_THIRD_PARTY' ? (
              <label>
                Fuente del antecedente
                <input
                  required
                  value={thirdParty}
                  onChange={(event) => setThirdParty(event.target.value)}
                  placeholder="Ej.: docente de asignatura"
                />
              </label>
            ) : null}
          </fieldset>
          <details
            className="die-optional-disclosure"
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            open={detailsOpen}
          >
            <summary>
              Más detalles <span>· hora, lugar e intervención</span>
              <Icon className="die-disclosure-chevron" name="chevron-down" />
            </summary>
            <div className="die-optional-fields">
              <div className="die-form-grid">
                <label>
                  Hora <span>(opcional)</span>
                  <input
                    disabled={!profile?.timeZone && !editing?.current.eventTime}
                    type="time"
                    value={eventTime}
                    onChange={(event) => setEventTime(event.target.value)}
                  />
                </label>
                {eventTime ? (
                  <p className="die-field-note">
                    Zona institucional:{' '}
                    {editing?.current.eventTime === eventTime
                      ? editing.current.eventTimeZone
                      : profile?.timeZone}
                  </p>
                ) : !profile?.timeZone ? (
                  <p className="die-field-note">
                    Configura la zona institucional para registrar una hora.
                  </p>
                ) : null}
                <label className="die-checkbox">
                  <input
                    checked={approximate}
                    disabled={!eventTime}
                    type="checkbox"
                    onChange={(event) => setApproximate(event.target.checked)}
                  />
                  Hora aproximada
                </label>
              </div>
              <label>
                Lugar <span>(opcional)</span>
                <input
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                />
              </label>
              <label>
                Acción inmediata realizada <span>(opcional)</span>
                <textarea
                  rows={2}
                  value={immediateAction}
                  onChange={(event) => setImmediateAction(event.target.value)}
                />
              </label>
            </div>
          </details>
          {editing ? (
            <label>
              Motivo de la corrección{' '}
              {editing.originalAuthorIdentityUserId === sessionUserId ? (
                <span>(opcional para autor original)</span>
              ) : null}
              <textarea
                required={
                  editing.originalAuthorIdentityUserId !== sessionUserId
                }
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          ) : null}
          <Button
            disabled={busy || !selectedStudent.activeEpisode}
            type="submit"
          >
            {busy
              ? 'Guardando…'
              : editing
                ? 'Guardar nueva versión'
                : 'Registrar situación'}
          </Button>
          {!selectedStudent.activeEpisode ? (
            <p className="die-help">
              Retoma el acompañamiento para crear nuevos registros. El historial
              sigue disponible.
            </p>
          ) : null}
        </form>
        <div className="die-timeline" aria-live="polite">
          {journalLoading ? (
            <div aria-label="Cargando hoja de vida" className="die-loading">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ) : visibleEntries.length ? (
            visibleEntries.map((entry) => (
              <article
                className={
                  entry.status === 'VOIDED'
                    ? 'die-entry die-entry--voided'
                    : 'die-entry'
                }
                key={entry.id}
              >
                <div className="die-entry-marker" aria-hidden="true" />
                <div className="die-entry-body">
                  <div className="die-entry-heading">
                    <div>
                      <time>
                        {entry.current.eventDate}
                        {entry.current.eventTime
                          ? ` · ${entry.current.eventTime}${entry.current.eventTimeApproximate ? ' aprox.' : ''} (${entry.current.eventTimeZone ?? 'zona no informada'})`
                          : ''}
                      </time>
                      <h3>{entry.current.title}</h3>
                    </div>
                    <Badge
                      tone={entry.status === 'VOIDED' ? 'error' : 'neutral'}
                    >
                      {entry.status === 'VOIDED'
                        ? 'Anulado'
                        : categories.find(
                            ([value]) => value === entry.current.category,
                          )?.[1]}
                    </Badge>
                  </div>
                  <p>{entry.current.description}</p>
                  {entry.current.immediateAction ? (
                    <div className="die-immediate">
                      <strong>Actuación inmediata</strong>
                      <span>{entry.current.immediateAction}</span>
                    </div>
                  ) : null}
                  <dl>
                    <div>
                      <dt>Autor original</dt>
                      <dd>{entry.originalAuthorDisplayLabel}</dd>
                    </div>
                    <div>
                      <dt>Creado</dt>
                      <dd>
                        {new Date(entry.createdAt).toLocaleString('es-CL')}
                      </dd>
                    </div>
                    <div>
                      <dt>Curso del hecho</dt>
                      <dd>
                        {entry.current.academicContext.courseLabel ??
                          'Sin matrícula activa'}
                      </dd>
                    </div>
                    <div>
                      <dt>Origen</dt>
                      <dd>
                        {entry.current.informationSource === 'WITNESSED'
                          ? 'Hecho presenciado'
                          : `Informado por terceros${entry.current.thirdPartySource ? ` · ${entry.current.thirdPartySource}` : ''}`}
                      </dd>
                    </div>
                    {entry.current.place ? (
                      <div>
                        <dt>Lugar</dt>
                        <dd>{entry.current.place}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Correcciones</dt>
                      <dd>{entry.revisions.length}</dd>
                    </div>
                  </dl>
                  {entry.current.revisionNumber > 1 ? (
                    <div className="die-correction-note">
                      <p>
                        Última corrección por{' '}
                        <strong>{entry.current.correctedByDisplayLabel}</strong>
                      </p>
                      {entry.current.correctionReason ? (
                        <p>
                          <strong>Motivo:</strong>{' '}
                          {entry.current.correctionReason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.revisions.length ? (
                    <details className="die-revision-history">
                      <summary>
                        Leer historial de cambios
                        <span>{entry.revisions.length}</span>
                      </summary>
                      <ol>
                        {[...entry.revisions]
                          .sort(
                            (left, right) =>
                              right.revisionNumber - left.revisionNumber,
                          )
                          .map((revision) => (
                            <li key={revision.revisionNumber}>
                              <div className="die-revision-heading">
                                <strong>
                                  Versión {revision.revisionNumber} ·{' '}
                                  {revision.title}
                                </strong>
                                <time>
                                  {new Date(revision.createdAt).toLocaleString(
                                    'es-CL',
                                  )}
                                </time>
                              </div>
                              <p>{revision.description}</p>
                              {revision.correctionReason ? (
                                <p>
                                  <strong>Motivo:</strong>{' '}
                                  {revision.correctionReason}
                                </p>
                              ) : null}
                              <small>
                                Corregido por {revision.correctedByDisplayLabel}
                              </small>
                            </li>
                          ))}
                      </ol>
                    </details>
                  ) : null}
                  {entry.status === 'VOIDED' ? (
                    <Alert title="Registro anulado" tone="warning">
                      El registro se conserva en el historial. Motivo:{' '}
                      {entry.voidReason}
                      {entry.voidedAt ? (
                        <p>
                          Anulado el{' '}
                          {new Date(entry.voidedAt).toLocaleString('es-CL')}
                        </p>
                      ) : null}
                    </Alert>
                  ) : null}
                  <div className="die-entry-actions">
                    <Button variant="ghost" onClick={() => edit(entry)}>
                      <Icon name="edit" />
                      Corregir
                    </Button>
                    <label className="die-file-button">
                      <Icon name="paperclip" />
                      Adjuntar
                      <input
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp"
                        type="file"
                        onChange={(event) =>
                          void attach(entry, event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    {entry.status !== 'VOIDED' ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setVoidingId(entry.id);
                          setVoidReason('');
                        }}
                      >
                        Anular
                      </Button>
                    ) : null}
                  </div>
                  {voidingId === entry.id ? (
                    <div className="die-inline-decision">
                      <label>
                        Motivo de anulación
                        <input
                          autoFocus
                          value={voidReason}
                          onChange={(event) =>
                            setVoidReason(event.target.value)
                          }
                        />
                      </label>
                      <div className="die-row-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setVoidingId('')}
                        >
                          Volver
                        </Button>
                        <Button
                          disabled={busy || !voidReason.trim()}
                          onClick={() => void voidEntry(entry)}
                        >
                          {busy ? 'Anulando…' : 'Confirmar anulación'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {entry.attachments.length ? (
                    <ul className="die-attachments">
                      {entry.attachments.map((file) => (
                        <li key={file.id}>
                          <Icon name="document" />
                          <button
                            onClick={() =>
                              void downloadAttachment(
                                file.fileObjectId,
                                file.filename,
                              )
                            }
                            type="button"
                          >
                            {file.filename}
                          </button>
                          <small>{Math.ceil(file.sizeBytes / 1024)} KB</small>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              icon={<Icon name="history" />}
              title="Sin registros para estos filtros"
              description="Ajusta el período, la categoría o el autor; si la hoja está vacía, registra la primera situación."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ActionsPanel({
  actions,
  api,
  members,
  onChanged,
  selectedStudentId,
  students,
}: {
  actions: DieAction[];
  api: AcademicApiClient;
  members: DieMember[];
  onChanged: () => Promise<void>;
  selectedStudentId: string;
  students: DieStudentSummary[];
}) {
  const [mine, setMine] = useState(false);
  const [ownActions, setOwnActions] = useState<DieAction[]>([]);
  const [studentId, setStudentId] = useState(selectedStudentId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState(members[0]?.id ?? '');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [transition, setTransition] = useState<{
    action: DieAction;
    status: 'COMPLETED' | 'CANCELLED';
  } | null>(null);
  const [transitionDetail, setTransitionDetail] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reassignment, setReassignment] = useState<{
    action: DieAction;
    memberId: string;
  } | null>(null);
  const [reassignmentReason, setReassignmentReason] = useState('');
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createDieAction({
        studentId,
        title,
        assigneeMemberAssignmentId: assignee,
        ...(description ? { description } : {}),
        ...(dueDate ? { dueDate } : {}),
      });
      setTitle('');
      setDescription('');
      setCreateOpen(false);
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function update(
    action: DieAction,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    detail = '',
  ) {
    if ((status === 'COMPLETED' || status === 'CANCELLED') && !detail.trim())
      return;
    try {
      setBusy(true);
      setError('');
      await api.updateDieAction(action.id, {
        status,
        ...(status === 'COMPLETED' ? { result: detail } : {}),
        ...(status === 'CANCELLED' ? { cancellationReason: detail } : {}),
      });
      setTransition(null);
      setTransitionDetail('');
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function reassign() {
    if (!reassignment || !reassignmentReason.trim()) return;
    try {
      setBusy(true);
      setError('');
      await api.reassignDieAction(reassignment.action.id, {
        assigneeMemberAssignmentId: reassignment.memberId,
        reason: reassignmentReason,
      });
      setReassignment(null);
      setReassignmentReason('');
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!mine) return;
    let mounted = true;
    void api
      .listDieActions({ mine: true })
      .then((rows) => {
        if (mounted) setOwnActions(rows);
      })
      .catch((cause) => {
        if (mounted) setError(message(cause));
      });
    return () => {
      mounted = false;
    };
  }, [api, mine, actions]);
  const visible = (mine ? ownActions : actions).filter(
    (action) =>
      (!filterStudent || action.studentId === filterStudent) &&
      (!filterAssignee ||
        action.assigneeMemberAssignmentId === filterAssignee) &&
      (!filterStatus || action.status === filterStatus) &&
      (!filterOverdue || action.overdue),
  );
  return (
    <section className="die-section">
      <div className="die-split-heading">
        <div>
          <h2>Acciones pendientes</h2>
          <p>Seguimiento y responsabilidades del equipo.</p>
        </div>
        <label className="die-toggle">
          <input
            checked={mine}
            type="checkbox"
            onChange={(event) => setMine(event.target.checked)}
          />
          Mis pendientes
        </label>
      </div>
      {error ? (
        <Alert title="Revisa la acción" tone="error">
          {error}
        </Alert>
      ) : null}
      <div className="die-history-toolbar">
        <p aria-live="polite">
          {visible.length} {visible.length === 1 ? 'acción' : 'acciones'}
        </p>
        <details
          className="die-filter-disclosure"
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          open={filtersOpen}
        >
          <summary className="die-disclosure-trigger">
            <Icon name="search" />
            Filtrar acciones
            <Icon className="die-disclosure-chevron" name="chevron-down" />
          </summary>
          <div className="die-filter-bar" aria-label="Filtros de acciones">
            <label>
              Alumno
              <select
                value={filterStudent}
                onChange={(event) => setFilterStudent(event.target.value)}
              >
                <option value="">Todos</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable
              <select
                value={filterAssignee}
                onChange={(event) => setFilterAssignee(event.target.value)}
              >
                <option value="">Todos</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="IN_PROGRESS">En curso</option>
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </label>
            <label className="die-checkbox">
              <input
                checked={filterOverdue}
                type="checkbox"
                onChange={(event) => setFilterOverdue(event.target.checked)}
              />
              Sólo vencidas
            </label>
          </div>
        </details>
      </div>
      {transition ? (
        <div className="die-inline-decision">
          <label>
            {transition.status === 'COMPLETED'
              ? 'Resultado de la acción'
              : 'Motivo de cancelación'}
            <textarea
              autoFocus
              rows={2}
              value={transitionDetail}
              onChange={(event) => setTransitionDetail(event.target.value)}
            />
          </label>
          <div className="die-row-actions">
            <Button variant="secondary" onClick={() => setTransition(null)}>
              Volver
            </Button>
            <Button
              disabled={!transitionDetail.trim()}
              onClick={() =>
                void update(
                  transition.action,
                  transition.status,
                  transitionDetail,
                )
              }
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}
      <div className="die-action-content">
        <div className="die-action-list">
          {visible.length ? (
            visible.map((action) => (
              <article className="die-action-row" key={action.id}>
                <div>
                  <span className="die-action-state">
                    <Badge
                      tone={
                        action.overdue
                          ? 'error'
                          : action.status === 'COMPLETED'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {action.overdue
                        ? 'Vencida'
                        : {
                            PENDING: 'Pendiente',
                            IN_PROGRESS: 'En curso',
                            COMPLETED: 'Completada',
                            CANCELLED: 'Cancelada',
                          }[action.status]}
                    </Badge>
                    {action.dueDate ? <time>{action.dueDate}</time> : null}
                  </span>
                  <h3>{action.title}</h3>
                  <p>{action.description || 'Sin descripción adicional.'}</p>
                  <small>
                    Alumno:{' '}
                    {students.find(
                      (student) => student.studentId === action.studentId,
                    )?.displayName ?? 'Alumno histórico'}
                  </small>
                  <small>
                    Responsable:{' '}
                    {members.find(
                      (member) =>
                        member.id === action.assigneeMemberAssignmentId,
                    )?.displayName ?? 'Miembro histórico'}
                  </small>
                </div>
                {action.status === 'PENDING' ||
                action.status === 'IN_PROGRESS' ? (
                  <div className="die-action-controls">
                    <div className="die-row-actions">
                      <select
                        aria-label={`Reasignar ${action.title}`}
                        value={
                          reassignment?.action.id === action.id
                            ? reassignment.memberId
                            : ''
                        }
                        onChange={(event) => {
                          const nextMemberId = event.target.value;
                          if (!nextMemberId) return;
                          setReassignment({ action, memberId: nextMemberId });
                          setReassignmentReason('');
                        }}
                      >
                        <option value="">Reasignar…</option>
                        {members
                          .filter(
                            (member) =>
                              member.id !== action.assigneeMemberAssignmentId,
                          )
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                            </option>
                          ))}
                      </select>
                      {action.status === 'PENDING' ? (
                        <Button
                          disabled={busy}
                          variant="ghost"
                          onClick={() => void update(action, 'IN_PROGRESS')}
                        >
                          Iniciar
                        </Button>
                      ) : null}
                      <Button
                        disabled={busy}
                        variant="ghost"
                        onClick={() => {
                          setTransition({ action, status: 'COMPLETED' });
                          setTransitionDetail('');
                        }}
                      >
                        Completar
                      </Button>
                      <Button
                        disabled={busy}
                        variant="ghost"
                        onClick={() => {
                          setTransition({ action, status: 'CANCELLED' });
                          setTransitionDetail('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                    {reassignment?.action.id === action.id ? (
                      <div className="die-inline-decision die-reassignment-decision">
                        <p>
                          Reasignar a{' '}
                          {members.find(
                            (member) => member.id === reassignment.memberId,
                          )?.displayName ?? 'otro integrante'}
                        </p>
                        <label>
                          Motivo de la reasignación
                          <textarea
                            autoFocus
                            required
                            rows={2}
                            value={reassignmentReason}
                            onChange={(event) =>
                              setReassignmentReason(event.target.value)
                            }
                          />
                        </label>
                        <div className="die-row-actions">
                          <Button
                            disabled={busy}
                            variant="secondary"
                            onClick={() => {
                              setReassignment(null);
                              setReassignmentReason('');
                            }}
                          >
                            Volver
                          </Button>
                          <Button
                            disabled={busy || !reassignmentReason.trim()}
                            onClick={() => void reassign()}
                          >
                            {busy ? 'Guardando…' : 'Confirmar reasignación'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <EmptyState
              icon={<Icon name="clipboard" />}
              title="Sin acciones para este filtro"
              description="Las nuevas acciones del equipo aparecerán aquí."
            />
          )}
        </div>
        <details
          className="die-form-disclosure"
          onToggle={(event) => setCreateOpen(event.currentTarget.open)}
          open={createOpen}
        >
          <summary className="die-disclosure-trigger">
            <Icon name="plus" />
            Nueva acción
            <Icon className="die-disclosure-chevron" name="chevron-down" />
          </summary>
          <form
            className="die-form-panel"
            onSubmit={(event) => void create(event)}
          >
            <div>
              <h3>Asignar acción</h3>
              <p>Indica a quién corresponde el siguiente paso del equipo.</p>
            </div>
            <label>
              Alumno
              <select
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                <option value="">Selecciona</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Responsable
              <select
                required
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
              >
                <option value="">Selecciona</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <details className="die-optional-disclosure">
              <summary>
                Añadir vencimiento o descripción
                <Icon className="die-disclosure-chevron" name="chevron-down" />
              </summary>
              <div className="die-optional-fields">
                <label>
                  Vencimiento <span>(opcional)</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label>
                  Descripción <span>(opcional)</span>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
            </details>
            <Button
              disabled={busy || !studentId || !assignee || !title.trim()}
              type="submit"
            >
              {busy ? 'Creando…' : 'Crear acción'}
            </Button>
          </form>
        </details>
      </div>
    </section>
  );
}

function MembersPanel({
  api,
  currentIdentityUserId,
  members,
  onChanged,
  tenantAdmin,
}: {
  api: AcademicApiClient;
  currentIdentityUserId: string;
  members: DieMember[];
  onChanged: () => Promise<void>;
  tenantAdmin: boolean;
}) {
  const [institutionalUsername, setInstitutionalUsername] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<DieMember | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const actorIsCoordinator =
    tenantAdmin ||
    members.some(
      (member) =>
        member.identityUserId === currentIdentityUserId &&
        member.role === 'COORDINATOR',
    );
  async function add() {
    try {
      await api.addDieMember({ institutionalUsername });
      setInstitutionalUsername('');
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function role(member: DieMember) {
    try {
      await api.updateDieMemberRole(
        member.id,
        member.role === 'COORDINATOR' ? 'MEMBER' : 'COORDINATOR',
      );
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function remove(member: DieMember) {
    if (!removalReason.trim()) return;
    try {
      await api.removeDieMember(member.id, {
        reason: removalReason,
        ...(replacement ? { reassignToMemberAssignmentId: replacement } : {}),
      });
      setRemoving(null);
      setRemovalReason('');
      setReplacement('');
      await onChanged();
    } catch (cause) {
      setError(
        `${message(cause)} Si tiene acciones abiertas, selecciona a quién reasignarlas.`,
      );
    }
  }
  return (
    <section className="die-section">
      <div className="die-split-heading">
        <div>
          <h2>Equipo DIE</h2>
          <p>
            Incorporar aquí no cambia roles, permisos administrativos ni
            membresías en Identity.
          </p>
        </div>
      </div>
      {error ? (
        <Alert title="Revisa la gestión del equipo" tone="error">
          {error}
        </Alert>
      ) : null}
      {removing ? (
        <div className="die-inline-decision">
          <label>
            Motivo del retiro
            <textarea
              autoFocus
              rows={2}
              value={removalReason}
              onChange={(event) => setRemovalReason(event.target.value)}
            />
          </label>
          <label>
            Reasignar acciones abiertas a <span>(si existen)</span>
            <select
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              <option value="">Sin reasignación</option>
              {members
                .filter((member) => member.id !== removing.id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
            </select>
          </label>
          <div className="die-row-actions">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Volver
            </Button>
            <Button
              disabled={!removalReason.trim()}
              onClick={() => void remove(removing)}
            >
              Confirmar retiro
            </Button>
          </div>
        </div>
      ) : null}
      <div className="die-two-column die-team-layout">
        <div className="die-member-list">
          {members.map((member) => (
            <article className="die-member-row" key={member.id}>
              <span className="die-avatar">
                {member.displayName
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <h3>{member.displayName}</h3>
                <p>
                  Incorporado{' '}
                  {new Date(member.addedAt).toLocaleDateString('es-CL')}
                </p>
              </div>
              <Badge tone={member.role === 'COORDINATOR' ? 'info' : 'neutral'}>
                {member.role === 'COORDINATOR'
                  ? 'Coordinación'
                  : 'Especialista'}
              </Badge>
              <div className="die-row-actions">
                {tenantAdmin ? (
                  <Button variant="ghost" onClick={() => void role(member)}>
                    {member.role === 'COORDINATOR'
                      ? 'Quitar coordinación'
                      : 'Hacer coordinador'}
                  </Button>
                ) : null}
                {actorIsCoordinator &&
                member.identityUserId !== currentIdentityUserId &&
                (tenantAdmin || member.role === 'MEMBER') ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRemoving(member);
                      setRemovalReason('');
                      setReplacement('');
                    }}
                  >
                    Retirar
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <details className="die-form-disclosure">
          <summary className="die-disclosure-trigger">
            <Icon name="plus" />
            Incorporar miembro
            <Icon className="die-disclosure-chevron" name="chevron-down" />
          </summary>
          <div className="die-form-panel">
            <h3>Incorporar miembro ordinario</h3>
            <p>
              Escribe el username institucional exacto. No se muestran listados
              ni coincidencias parciales.
            </p>
            <label>
              Username institucional
              <input
                autoComplete="off"
                value={institutionalUsername}
                onChange={(event) =>
                  setInstitutionalUsername(event.target.value)
                }
              />
            </label>
            <Button
              disabled={!institutionalUsername.trim()}
              onClick={() => void add()}
            >
              Incorporar como especialista
            </Button>
            <p className="die-help">
              Sólo un administrador puede conceder coordinación.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

function ProfilePanel({
  api,
  onChanged,
  profile,
}: {
  api: AcademicApiClient;
  onChanged: () => Promise<void>;
  profile: TenantOperationalProfile;
}) {
  const [institutionDisplayName, setInstitutionDisplayName] = useState(
    profile.institutionDisplayName ?? '',
  );
  const [timeZone, setTimeZone] = useState(profile.timeZone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.updateTenantOperationalProfile({
        institutionDisplayName: institutionDisplayName.trim() || null,
        timeZone: timeZone.trim() || null,
        expectedVersion: profile.version,
      });
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="die-section">
      <div className="die-split-heading">
        <div>
          <h2>Perfil institucional operativo</h2>
          <p>
            Estos datos se usan sólo en documentos y fechas de Académico. No
            cambian la identidad ni el identificador del tenant en Identity.
          </p>
        </div>
      </div>
      {error ? (
        <Alert title="No pudimos guardar el perfil" tone="error">
          {error}
        </Alert>
      ) : null}
      <form className="die-form-panel" onSubmit={(event) => void save(event)}>
        <label>
          Nombre institucional para documentos
          <input
            value={institutionDisplayName}
            onChange={(event) => setInstitutionDisplayName(event.target.value)}
            placeholder="Ej.: Colegio Ejemplo"
          />
        </label>
        <label>
          Zona horaria IANA
          <input
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            placeholder="Ej.: America/Santiago"
          />
        </label>
        <p className="die-field-note">
          Sin nombre no se habilita una exportación completa. Sin zona se
          admiten hechos sólo con fecha y no se calcula vencimiento.
        </p>
        <Button disabled={busy} type="submit">
          {busy ? 'Guardando…' : 'Guardar perfil'}
        </Button>
      </form>
    </section>
  );
}
