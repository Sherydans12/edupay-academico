'use client';

import { Alert, Badge, Button, Card, Dialog, DropdownItem, DropdownMenu, EmptyState, Input, Select, Skeleton, Tabs, Textarea } from '@edupay/ui';
import type { CourseSubject, LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { AppShell } from '@/components/app-shell';
import { ContentHistoryDrawer } from '@/components/content-history-drawer';
import { Icon } from '@/components/icons';
import { CompactStat, PageHeading, SubjectCard } from '@/components/page-primitives';
import { TeacherAttachmentManager } from '@/components/teacher-attachment-manager';
import { TeacherContentEditor } from '@/components/teacher-content-editor';
import { TeacherSubmissionDetail, TeacherSubmissionQueue } from '@/components/teacher-submission-workflow';
import { useTrustedCurrentSession, type TrustedCurrentSession } from '@/auth/current-session';
import { demoSessions } from '@/demo/demo-data';
import { learningDateTimeLocalToInstant, learningInstantToDateTimeLocal } from '@/features/learning-datetime';
import {
  courseName,
  errorCopy,
  formatInstant,
  isSensitiveConfirmationError,
  subjectCard,
  subjectName,
} from '@/features/learning-screen-support';

type LearningRouteData = Awaited<ReturnType<AcademicApiClient['getLearningRoute']>>;

function apiFormError(error: unknown): string {
  if (error instanceof AcademicApiError) return error.message;
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    return error.issues.map((issue: { message: string }) => issue.message).join(' ');
  }
  return 'Revisa los campos e inténtalo nuevamente.';
}

function TeacherDataState({
  children,
  error,
  loading,
  onRetry,
}: {
  children: React.ReactNode;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div aria-label="Cargando contenido docente" className="academic-loading">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (error) {
    const copy = errorCopy(error);
    return (
      <Alert
        action={<Button onClick={onRetry} variant="secondary">Reintentar</Button>}
        title={copy.title}
        tone={copy.title === 'Acceso no autorizado' ? 'warning' : 'error'}
      >
        {copy.body}
        {error instanceof AcademicApiError && error.requestId !== 'unavailable' ? (
          <small className="request-id">Referencia: {error.requestId}</small>
        ) : null}
      </Alert>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// 1. TEACHER DASHBOARD SCREEN (/docente)
// ---------------------------------------------------------------------------

interface TeacherWorkspaceSummary {
  subjects: CourseSubject[];
  routes: Array<{ subject: CourseSubject; route: LearningRouteData }>;
  pendingSubmissionsCount: number;
  draftsCount: number;
  scheduledCount: number;
  upcomingDeadlines: Array<{
    item: LearningItem;
    subject: CourseSubject;
    kind: 'DUE' | 'PUBLISH';
    date: string;
  }>;
}

function useTeacherDashboardData(api: AcademicApiClient) {
  const [data, setData] = useState<TeacherWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const routes = typeof api.getLearningRoute === 'function'
        ? await Promise.all(
            subjects.map(async (subject) => {
              try {
                const route = await api.getLearningRoute(subject.id);
                return { route, subject };
              } catch {
                return { route: { courseSubjectId: subject.id, units: [] }, subject };
              }
            })
          )
        : [];

      let pendingCount = 0;
      let drafts = 0;
      let scheduled = 0;
      const deadlines: TeacherWorkspaceSummary['upcomingDeadlines'] = [];

      for (const { route, subject } of routes) {
        for (const unit of route.units) {
          for (const item of unit.items) {
            if (item.publicationStatus === 'DRAFT') {
              drafts++;
            } else if (item.publicationStatus === 'SCHEDULED') {
              scheduled++;
              if (item.publishAt) {
                deadlines.push({
                  date: item.publishAt,
                  item,
                  kind: 'PUBLISH',
                  subject,
                });
              }
            }

            if (item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT') {
              if (item.dueAt) {
                deadlines.push({
                  date: item.dueAt,
                  item,
                  kind: 'DUE',
                  subject,
                });
              }

              if (typeof api.listSubmissions === 'function') {
                try {
                  const subs = await api.listSubmissions(item.id);
                  pendingCount += subs.filter((s) => s.status === 'SUBMITTED').length;
                } catch {
                  // Ignore per-item submission error
                }
              }
            }
          }
        }
      }

      deadlines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setData({
        draftsCount: drafts,
        pendingSubmissionsCount: pendingCount,
        routes,
        scheduledCount: scheduled,
        subjects,
        upcomingDeadlines: deadlines.slice(0, 5),
      });
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { data, error, load, loading };
}

export function TeacherDashboardScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { data, error, load, loading } = useTeacherDashboardData(client);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        action={
          <Link className="button-link button-link--primary" href="/docente/asignaturas">
            <Icon name="book" />
            Ver contenido
          </Link>
        }
        description="Tus asignaturas asignadas y sus rutas de aprendizaje reales."
        title={`Buenos días, ${currentSession.displayName.split(' ')[0]}`}
      />

      <TeacherDataState error={error} loading={loading} onRetry={() => void load()}>
        {data ? (
          <>
            {/* Quick Action Attention Stats */}
            <div className="compact-stats">
              <Link className="compact-stat-link" href="/docente/asignaturas">
                <CompactStat
                  icon="book"
                  label="Asignaturas asignadas"
                  value={String(data.subjects.length)}
                />
              </Link>
              <Link className="compact-stat-link" href="/docente/revisiones">
                <CompactStat
                  icon="review"
                  label={data.pendingSubmissionsCount === 1 ? 'Entrega por revisar' : 'Entregas por revisar'}
                  value={String(data.pendingSubmissionsCount)}
                />
              </Link>
              <Link className="compact-stat-link" href="/docente/calendario">
                <CompactStat
                  icon="calendar"
                  label={data.scheduledCount === 1 ? 'Publicación programada' : 'Publicaciones programadas'}
                  value={String(data.scheduledCount)}
                />
              </Link>
            </div>

            <div className="teacher-dashboard-grid">
              {/* Left Column: Assigned Subjects Workspaces */}
              <section aria-labelledby="teacher-route-title" className="content-section teacher-review-queue">
                <div className="section-heading">
                  <div>
                    <h2 id="teacher-route-title">Contenido autorizado</h2>
                    <p>Abre un espacio para organizar sus unidades e ítems.</p>
                  </div>
                  <Link href="/docente/asignaturas">Ver todas <Icon name="chevron-right" /></Link>
                </div>

                {data.subjects.length ? (
                  <div className="subject-grid subject-grid--overview">
                    {data.subjects.map((subject, index) => (
                      <SubjectCard key={subject.id} subject={subjectCard(subject, index, 'teacher')} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description="Un administrador debe asignarte a un espacio activo para gestionar contenido."
                    icon={<Icon name="book" />}
                    title="No tienes asignaturas asignadas"
                  />
                )}
              </section>

              {/* Right Column: Reviews & Next Deadlines */}
              <aside className="week-plan">
                <h2>Entregas y revisiones</h2>
                <p>La información de archivos, entregas, historial y revisión está conectada al API autorizado.</p>
                <Link className="button-link button-link--accent" href="/docente/revisiones">
                  <Icon name="review" />
                  Abrir revisiones
                </Link>
                <Badge tone="success">Conectado</Badge>
              </aside>
            </div>
          </>
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 2. TEACHER SUBJECTS SCREEN (/docente/asignaturas)
// ---------------------------------------------------------------------------

function useTeacherContexts(api: AcademicApiClient) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubjects(await api.getTeacherContextSubjects());
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { error, load, loading, subjects };
}

export function TeacherSubjectsScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherContexts(client);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Solo aparecen las asignaturas donde el servidor reconoce una asignación docente activa."
        title="Asignaturas"
      />

      <TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>
        {data.subjects.length ? (
          <div className="subject-grid subject-grid--overview">
            {data.subjects.map((subject, index) => (
              <SubjectCard key={subject.id} subject={subjectCard(subject, index, 'teacher')} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Un administrador debe asignarte a una asignatura activa para gestionar contenido."
            icon={<Icon name="book" />}
            title="No tienes asignaturas asignadas"
          />
        )}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 3. TEACHER SUBJECT / COURSE WORKSPACE (/docente/asignaturas/[id])
// ---------------------------------------------------------------------------

type UnitFormDraft = {
  id?: string | undefined;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
};

type ItemFormDraft = {
  id?: string | undefined;
  type: LearningItem['type'];
  title: string;
  description: string;
  content: string;
  instructions: string;
  body: string;
  dueAt: string;
};

function initialUnitDraft(unit?: LearningUnitWithItems): UnitFormDraft {
  return {
    description: unit?.description ?? '',
    endAt: learningInstantToDateTimeLocal(unit?.endAt ?? null),
    id: unit?.id,
    startAt: learningInstantToDateTimeLocal(unit?.startAt ?? null),
    title: unit?.title ?? '',
  };
}

function initialItemDraft(item?: LearningItem | null): ItemFormDraft {
  return {
    body: item?.body ?? '',
    content: item?.content ?? '',
    description: item?.description ?? '',
    dueAt: learningInstantToDateTimeLocal(item?.dueAt ?? null),
    id: item?.id,
    instructions: item?.instructions ?? '',
    title: item?.title ?? '',
    type: item?.type ?? 'MATERIAL',
  };
}

function useTeacherRoute(api: AcademicApiClient, requestedCourseSubjectId?: string) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>>([]);
  const [route, setRoute] = useState<LearningRouteData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const selected = subjects.find((subject) => subject.id === requestedCourseSubjectId) ??
    (requestedCourseSubjectId ? undefined : subjects[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSubjects = await api.getTeacherContextSubjects();
      setSubjects(nextSubjects);
      const nextSubject = nextSubjects.find((subject) => subject.id === requestedCourseSubjectId) ??
        (requestedCourseSubjectId ? undefined : nextSubjects[0]);
      if (!nextSubject) {
        setRoute(null);
        return;
      }
      setRoute(await api.getLearningRoute(nextSubject.id));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, requestedCourseSubjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { error, load, loading, route, selected, subjects };
}

export function TeacherSubjectScreen({
  api,
  courseSubjectId,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  courseSubjectId?: string;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);

  // Editor states
  const [unitFormDraft, setUnitFormDraft] = useState<UnitFormDraft | null>(null);
  const [itemFormDraft, setItemFormDraft] = useState<{ unitId: string; values: ItemFormDraft } | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [fullscreenEditorItem, setFullscreenEditorItem] = useState<{ item: LearningItem | null; unit: LearningUnitWithItems } | null>(null);
  const [attachmentItem, setAttachmentItem] = useState<LearningItem | null>(null);
  const [historyEntity, setHistoryEntity] = useState<{ type: 'LEARNING_UNIT' | 'LEARNING_ITEM'; id: string; title: string; version: number } | null>(null);
  const [moveItemData, setMoveItemData] = useState<{ item: LearningItem; currentUnitId: string } | null>(null);
  const [targetUnitId, setTargetUnitId] = useState('');
  const [moving, setMoving] = useState(false);

  // Confirmation & status states
  const [confirmation, setConfirmation] = useState<{ body: string; run: () => Promise<void> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await data.load();
  }

  async function runAction(action: () => Promise<void>, confirmedAction = action) {
    setSaving(true);
    setFormError('');
    try {
      await action();
      await refresh();
    } catch (err) {
      if (isSensitiveConfirmationError(err)) {
        setConfirmation({
          body: err instanceof Error ? err.message : 'Este cambio puede afectar contenido publicado o evidencia histórica.',
          run: confirmedAction,
        });
      } else {
        setFormError(apiFormError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  // Unit operations
  async function saveUnit() {
    if (!unitFormDraft || !data.selected) return;
    const currentSubjectId = data.selected.id;

    await runAction(async () => {
      if (unitFormDraft.id) {
        await client.updateLearningUnit(unitFormDraft.id, {
          description: unitFormDraft.description || null,
          endAt: learningDateTimeLocalToInstant(unitFormDraft.endAt) ?? null,
          startAt: learningDateTimeLocalToInstant(unitFormDraft.startAt) ?? null,
          title: unitFormDraft.title.trim(),
        });
      } else {
        await client.createLearningUnit({
          courseSubjectId: currentSubjectId,
          description: unitFormDraft.description || undefined,
          endAt: learningDateTimeLocalToInstant(unitFormDraft.endAt),
          sortOrder: 0,
          startAt: learningDateTimeLocalToInstant(unitFormDraft.startAt),
          title: unitFormDraft.title.trim(),
        });
      }
      setUnitFormDraft(null);
    });
  }

  async function duplicateUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.duplicateLearningUnit(unit.id, {
        duplicateItems: true,
        title: `${unit.title} (Copia)`,
      });
    });
  }

  async function archiveUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.archiveLearningUnit(unit.id);
    });
  }

  async function activateUnit(unit: LearningUnitWithItems) {
    await runAction(async () => {
      await client.updateLearningUnit(unit.id, { status: 'ACTIVE' });
    });
  }

  async function moveUnit(index: number, direction: -1 | 1) {
    const route = data.route;
    const subject = data.selected;
    if (!route || !subject) return;
    const next = index + direction;
    if (next < 0 || next >= route.units.length) return;

    const orderedIds = route.units.map((u) => u.id);
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    await runAction(async () => {
      await client.reorderLearningUnits(subject.id, { orderedIds });
    });
  }

  // Item inline save operations
  function itemInput(values: ItemFormDraft, confirmSensitiveChange = false) {
    const deliverable = values.type === 'ASSIGNMENT' || values.type === 'ASSESSMENT';
    return {
      body: values.type === 'ANNOUNCEMENT' ? values.body || undefined : undefined,
      confirmSensitiveChange,
      content: values.type === 'MATERIAL' ? values.content || undefined : undefined,
      description: values.description || undefined,
      dueAt: deliverable ? learningDateTimeLocalToInstant(values.dueAt) : undefined,
      instructions: deliverable ? values.instructions || undefined : undefined,
      title: values.title.trim(),
      type: values.type,
    };
  }

  async function saveItem() {
    if (!itemFormDraft) return;
    const draft = itemFormDraft;
    const execute = async (confirmSensitiveChange: boolean) => {
      const input = itemInput(draft.values, confirmSensitiveChange);
      if (draft.values.id) {
        await client.updateLearningItem(draft.values.id, input);
      } else {
        const { confirmSensitiveChange: _, ...createInput } = input;
        void _;
        await client.createLearningItem(draft.unitId, {
          ...createInput,
          dueAt: input.dueAt ?? undefined,
          sortOrder: 0,
        });
      }
      setItemFormDraft(null);
    };
    await runAction(() => execute(false), () => execute(true));
  }

  async function publish(item: LearningItem) {
    await runAction(async () => {
      await client.publishLearningItem(item.id);
    });
  }

  async function schedule(item: LearningItem) {
    if (!scheduleDraft) return;
    const value = learningDateTimeLocalToInstant(scheduleDraft.value);
    if (!value) {
      setFormError('Selecciona una fecha futura para programar.');
      return;
    }
    await runAction(
      () => client.scheduleLearningItem(item.id, { confirmSensitiveChange: false, publishAt: value }).then(() => { setScheduleDraft(null); }),
      () => client.scheduleLearningItem(item.id, { confirmSensitiveChange: true, publishAt: value }).then(() => { setScheduleDraft(null); })
    );
  }

  async function moveItem(unit: LearningUnitWithItems, index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= unit.items.length) return;

    const orderedIds = unit.items.map((i) => i.id);
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    await runAction(async () => {
      await client.reorderLearningItems(unit.id, { orderedIds });
    });
  }

  async function executeMoveItemToUnit() {
    if (!moveItemData || !targetUnitId) return;
    setMoving(true);
    try {
      await client.moveLearningItem(moveItemData.item.id, { targetLearningUnitId: targetUnitId });
      setMoveItemData(null);
      await refresh();
    } catch (err) {
      setFormError(apiFormError(err));
    } finally {
      setMoving(false);
    }
  }

  async function duplicateItem(item: LearningItem) {
    await runAction(async () => {
      await client.duplicateLearningItem(item.id, {
        title: `${item.title} (Copia)`,
      });
    });
  }

  async function archiveItem(item: LearningItem) {
    await runAction(async () => {
      await client.archiveLearningItem(item.id);
    });
  }

  async function confirmSensitive() {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.run();
      setConfirmation(null);
      await refresh();
    } catch (err) {
      setFormError(apiFormError(err));
    } finally {
      setConfirming(false);
    }
  }

  // Count items by state
  const counts = useMemo(() => {
    let drafts = 0;
    let scheduled = 0;
    let published = 0;
    if (data.route) {
      for (const u of data.route.units) {
        for (const it of u.items) {
          if (it.publicationStatus === 'DRAFT') drafts++;
          else if (it.publicationStatus === 'SCHEDULED') scheduled++;
          else if (it.publicationStatus === 'PUBLISHED') published++;
        }
      }
    }
    return { drafts, published, scheduled };
  }, [data.route]);

  const missingSubject = !data.loading && !data.error && (!data.selected || !data.route);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>
        {missingSubject ? (
          <EmptyState
            description="No tienes autorización para gestionar este espacio o ya no se encuentra activo."
            icon={<Icon name="book" />}
            title="Asignatura no disponible"
          />
        ) : data.selected && data.route ? (
          <>
            {/* Breadcrumb Navigation */}
            <nav aria-label="Ruta de navegación" className="breadcrumbs">
              <Link href="/docente/asignaturas">Asignaturas</Link>
              <Icon name="chevron-right" />
              <span>{subjectName(data.selected)} · {courseName(data.selected)}</span>
            </nav>

            {/* Authoring Workspace Header */}
            <section className="teacher-subject-header">
              <div className="teacher-subject-header__title-area">
                <div className="subject-hero__mark">
                  {subjectName(data.selected).slice(0, 3).toUpperCase()}
                </div>
                <div>
                  <h1>{subjectName(data.selected)}</h1>
                  <p>{courseName(data.selected)} · Espacio de autoría docente</p>
                </div>
              </div>

              <div className="header-actions">
                <div className="header-status-pills">
                  <Badge tone="neutral">Borradores: {counts.drafts}</Badge>
                  <Badge tone="info">Programados: {counts.scheduled}</Badge>
                  <Badge tone="success">Publicados: {counts.published}</Badge>
                </div>

                <Button onClick={() => setUnitFormDraft(initialUnitDraft())} variant="secondary">
                  <Icon name="plus" />
                  Nueva unidad
                </Button>

                <Link
                  className="button-link button-link--primary"
                  href={`/docente/asignaturas/${data.selected.id}/estudiantes`}
                >
                  <Icon name="people" />
                  Ver estudiantes
                </Link>
              </div>
            </section>

            {formError ? <Alert title="No se pudo completar la acción" tone="error">{formError}</Alert> : null}

            {/* Inline Unit Form */}
            {unitFormDraft ? (
              <form
                className="learning-editor-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveUnit();
                }}
              >
                <div className="section-heading">
                  <div>
                    <h3>{unitFormDraft.id ? 'Editar unidad' : 'Nueva unidad'}</h3>
                    <p>Las unidades nuevas quedan en borrador hasta que las actives.</p>
                  </div>
                </div>
                <div className="learning-editor-grid">
                  <Input
                    id="unit-title"
                    label="Título"
                    maxLength={160}
                    onChange={(event) => setUnitFormDraft({ ...unitFormDraft, title: event.target.value })}
                    required
                    value={unitFormDraft.title}
                  />
                  <Textarea
                    id="unit-description"
                    label="Descripción (opcional)"
                    onChange={(event) => setUnitFormDraft({ ...unitFormDraft, description: event.target.value })}
                    value={unitFormDraft.description}
                  />
                  <Input
                    id="unit-start"
                    label="Disponible desde (opcional)"
                    onChange={(event) => setUnitFormDraft({ ...unitFormDraft, startAt: event.target.value })}
                    type="datetime-local"
                    value={unitFormDraft.startAt}
                  />
                  <Input
                    id="unit-end"
                    label="Disponible hasta (opcional)"
                    onChange={(event) => setUnitFormDraft({ ...unitFormDraft, endAt: event.target.value })}
                    type="datetime-local"
                    value={unitFormDraft.endAt}
                  />
                </div>
                <div className="learning-editor-actions">
                  <Button onClick={() => setUnitFormDraft(null)} type="button" variant="secondary">
                    Cancelar
                  </Button>
                  <Button loading={saving} type="submit">
                    {unitFormDraft.id ? 'Guardar unidad' : 'Crear unidad'}
                  </Button>
                </div>
              </form>
            ) : null}

            {/* Inline Item Form */}
            {itemFormDraft ? (
              <form
                className="learning-editor-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveItem();
                }}
              >
                <div className="section-heading">
                  <div>
                    <h3>{itemFormDraft.values.id ? 'Editar contenido' : 'Nuevo contenido'}</h3>
                    <p>Elige el tipo primero para mostrar los campos que el API requiere.</p>
                  </div>
                </div>
                <div className="learning-editor-grid">
                  <Select
                    id="item-type"
                    label="Tipo"
                    onChange={(event) =>
                      setItemFormDraft({
                        ...itemFormDraft,
                        values: {
                          ...itemFormDraft.values,
                          dueAt: event.target.value === 'MATERIAL' || event.target.value === 'ANNOUNCEMENT' ? '' : itemFormDraft.values.dueAt,
                          type: event.target.value as LearningItem['type'],
                        },
                      })
                    }
                    value={itemFormDraft.values.type}
                  >
                    <option value="MATERIAL">Material</option>
                    <option value="ASSIGNMENT">Actividad</option>
                    <option value="ASSESSMENT">Evaluación en documento</option>
                    <option value="ANNOUNCEMENT">Anuncio</option>
                  </Select>

                  <Input
                    id="item-title"
                    label="Título"
                    maxLength={160}
                    onChange={(event) =>
                      setItemFormDraft({
                        ...itemFormDraft,
                        values: { ...itemFormDraft.values, title: event.target.value },
                      })
                    }
                    required
                    value={itemFormDraft.values.title}
                  />

                  <Textarea
                    id="item-description"
                    label="Descripción (opcional)"
                    onChange={(event) =>
                      setItemFormDraft({
                        ...itemFormDraft,
                        values: { ...itemFormDraft.values, description: event.target.value },
                      })
                    }
                    value={itemFormDraft.values.description}
                  />

                  {itemFormDraft.values.type === 'MATERIAL' ? (
                    <Textarea
                      id="item-content"
                      label="Contenido"
                      onChange={(event) =>
                        setItemFormDraft({
                          ...itemFormDraft,
                          values: { ...itemFormDraft.values, content: event.target.value },
                        })
                      }
                      value={itemFormDraft.values.content}
                    />
                  ) : null}

                  {itemFormDraft.values.type === 'ANNOUNCEMENT' ? (
                    <Textarea
                      id="item-body"
                      label="Mensaje"
                      onChange={(event) =>
                        setItemFormDraft({
                          ...itemFormDraft,
                          values: { ...itemFormDraft.values, body: event.target.value },
                        })
                      }
                      required
                      value={itemFormDraft.values.body}
                    />
                  ) : null}

                  {itemFormDraft.values.type === 'ASSIGNMENT' || itemFormDraft.values.type === 'ASSESSMENT' ? (
                    <>
                      <Textarea
                        id="item-instructions"
                        label="Instrucciones"
                        onChange={(event) =>
                          setItemFormDraft({
                            ...itemFormDraft,
                            values: { ...itemFormDraft.values, instructions: event.target.value },
                          })
                        }
                        required
                        value={itemFormDraft.values.instructions}
                      />
                      <Input
                        id="item-due"
                        label="Fecha de entrega"
                        onChange={(event) =>
                          setItemFormDraft({
                            ...itemFormDraft,
                            values: { ...itemFormDraft.values, dueAt: event.target.value },
                          })
                        }
                        required
                        type="datetime-local"
                        value={itemFormDraft.values.dueAt}
                      />
                    </>
                  ) : null}
                </div>

                <div className="learning-editor-actions">
                  <Button onClick={() => setItemFormDraft(null)} type="button" variant="secondary">
                    Cancelar
                  </Button>
                  <Button loading={saving} type="submit">
                    {itemFormDraft.values.id ? 'Guardar contenido' : 'Crear contenido'}
                  </Button>
                </div>
              </form>
            ) : null}

            {/* Tabs: Workspace / Submissions / Collaboration */}
            <Tabs
              items={[
                {
                  content: (
                    <div className="authoring-workspace-body">
                      <div className="authoring-toolbar">
                        <div>
                          <h2>Ruta de aprendizaje</h2>
                          <p>Organiza unidades e ítems con acciones de teclado y botones de orden accesibles.</p>
                        </div>
                        <Badge tone="info">Vista docente</Badge>
                      </div>

                      {/* Units Outline */}
                      {data.route.units.length ? (
                        <div className="teacher-units-list">
                          {data.route.units.map((unit, unitIndex) => (
                            <section className="teacher-unit-panel" key={unit.id}>
                              {/* Unit Header */}
                              <header className="teacher-unit-header">
                                <div className="teacher-unit-marker">
                                  <span>{unitIndex + 1}</span>
                                </div>

                                <div className="teacher-unit-title-group">
                                  <div className="teacher-unit-title-row">
                                    <h3>{unit.title}</h3>
                                    <Badge tone={unit.status === 'ACTIVE' ? 'info' : 'neutral'}>
                                      {unit.status === 'ACTIVE' ? `${unit.items.length} contenido${unit.items.length === 1 ? '' : 's'}` : unit.status === 'DRAFT' ? 'Borrador' : 'Archivada'}
                                    </Badge>
                                    {unit.startAt || unit.endAt ? (
                                      <small className="unit-availability-badge">
                                        <Icon name="calendar" />
                                        {unit.startAt ? `Desde ${formatInstant(unit.startAt)}` : ''}
                                        {unit.endAt ? ` hasta ${formatInstant(unit.endAt)}` : ''}
                                      </small>
                                    ) : null}
                                  </div>
                                  <p>{unit.description || 'Sin descripción para esta unidad.'}</p>
                                </div>

                                <div className="teacher-unit-actions">
                                  <Button
                                    aria-label={`Subir unidad ${unit.title}`}
                                    disabled={unitIndex === 0 || saving}
                                    onClick={() => void moveUnit(unitIndex, -1)}
                                    size="icon"
                                    title="Subir"
                                    variant="ghost"
                                  >
                                    <Icon name="chevron-down" className="rotate-180" />
                                  </Button>
                                  <Button
                                    aria-label={`Bajar unidad ${unit.title}`}
                                    disabled={unitIndex === data.route!.units.length - 1 || saving}
                                    onClick={() => void moveUnit(unitIndex, 1)}
                                    size="icon"
                                    title="Bajar"
                                    variant="ghost"
                                  >
                                    <Icon name="chevron-down" />
                                  </Button>

                                  <Button
                                    disabled={unit.status === 'ARCHIVED'}
                                    onClick={() => setUnitFormDraft(initialUnitDraft(unit))}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    Editar unidad
                                  </Button>

                                  {unit.status === 'DRAFT' ? (
                                    <Button onClick={() => void activateUnit(unit)} size="sm">
                                      Activar
                                    </Button>
                                  ) : null}

                                  <DropdownMenu
                                    label="Acciones de la unidad"
                                    trigger={
                                      <span aria-label="Opciones de unidad" className="dropdown-trigger-icon">
                                        <Icon name="more" />
                                      </span>
                                    }
                                  >
                                    <DropdownItem onSelect={() => void duplicateUnit(unit)}>
                                      <Icon name="copy" />
                                      Duplicar unidad
                                    </DropdownItem>
                                    <DropdownItem
                                      onSelect={() =>
                                        setHistoryEntity({
                                          id: unit.id,
                                          title: unit.title,
                                          type: 'LEARNING_UNIT',
                                          version: unit.version,
                                        })
                                      }
                                    >
                                      <Icon name="history" />
                                      Historial de versiones
                                    </DropdownItem>
                                    {unit.status !== 'ARCHIVED' ? (
                                      <DropdownItem onSelect={() => void archiveUnit(unit)}>
                                        <Icon name="archive" />
                                        Archivar unidad
                                      </DropdownItem>
                                    ) : null}
                                  </DropdownMenu>
                                </div>
                              </header>

                              {/* Unit Items List */}
                              {unit.items.length ? (
                                <div className="learning-items">
                                  {unit.items.map((item, itemIndex) => {
                                    const deliverable = item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT';
                                    const attachmentSupported = item.type !== 'ANNOUNCEMENT';

                                    return (
                                      <div className="learning-item teacher-learning-item" key={item.id}>
                                        <span className={`learning-item__icon learning-item__icon--${item.type.toLowerCase()}`}>
                                          <Icon
                                            name={
                                              item.type === 'ASSESSMENT'
                                                ? 'document'
                                                : item.type === 'ASSIGNMENT'
                                                ? 'clipboard'
                                                : item.type === 'MATERIAL'
                                                ? 'book'
                                                : 'message'
                                            }
                                          />
                                        </span>

                                        <div className="learning-item__copy">
                                          <small>
                                            {item.type === 'ASSESSMENT'
                                              ? 'Evaluación en documento'
                                              : item.type === 'ASSIGNMENT'
                                              ? 'Actividad'
                                              : item.type === 'MATERIAL'
                                              ? 'Material'
                                              : 'Anuncio'}
                                          </small>
                                          <strong>{item.title}</strong>
                                          <span>{item.description || item.instructions || item.content || item.body || 'Sin descripción'}</span>
                                        </div>

                                        <div className="learning-item__meta">
                                          <Badge
                                            tone={
                                              item.publicationStatus === 'PUBLISHED'
                                                ? 'success'
                                                : item.publicationStatus === 'SCHEDULED'
                                                ? 'info'
                                                : 'neutral'
                                            }
                                          >
                                            {item.publicationStatus === 'PUBLISHED'
                                              ? 'Publicado'
                                              : item.publicationStatus === 'SCHEDULED'
                                              ? 'Programado'
                                              : 'Borrador'}
                                          </Badge>

                                          {deliverable && item.dueAt ? (
                                            <small><Icon name="clock" />Vence {formatInstant(item.dueAt)}</small>
                                          ) : null}

                                          {item.publicationStatus === 'SCHEDULED' && item.publishAt ? (
                                            <small><Icon name="calendar" />Publica el {formatInstant(item.publishAt)}</small>
                                          ) : null}
                                        </div>

                                        <div className="learning-item__actions">
                                          <Button
                                            aria-label={`Subir ${item.title}`}
                                            disabled={itemIndex === 0 || saving}
                                            onClick={() => void moveItem(unit, itemIndex, -1)}
                                            size="icon"
                                            title="Subir"
                                            variant="ghost"
                                          >
                                            <Icon name="chevron-down" className="rotate-180" />
                                          </Button>
                                          <Button
                                            aria-label={`Bajar ${item.title}`}
                                            disabled={itemIndex === unit.items.length - 1 || saving}
                                            onClick={() => void moveItem(unit, itemIndex, 1)}
                                            size="icon"
                                            title="Bajar"
                                            variant="ghost"
                                          >
                                            <Icon name="chevron-down" />
                                          </Button>

                                          <Button
                                            aria-label={`Editar ${item.title}`}
                                            onClick={() => {
                                              setItemFormDraft({ unitId: unit.id, values: initialItemDraft(item) });
                                            }}
                                            size="sm"
                                            variant="secondary"
                                          >
                                            <Icon name="settings" />
                                            Editar
                                          </Button>

                                          {attachmentSupported ? (
                                            <Button
                                              aria-label={`Gestionar archivos de ${item.title}`}
                                              onClick={() => setAttachmentItem(item)}
                                              size="sm"
                                              variant="secondary"
                                            >
                                              <Icon name="paperclip" />
                                              Archivos
                                            </Button>
                                          ) : null}

                                          {item.publicationStatus === 'DRAFT' ? (
                                            <>
                                              <Button onClick={() => void publish(item)} size="sm">
                                                Publicar
                                              </Button>
                                              <Button
                                                onClick={() =>
                                                  setScheduleDraft({
                                                    itemId: item.id,
                                                    value: learningInstantToDateTimeLocal(item.publishAt),
                                                  })
                                                }
                                                size="sm"
                                                variant="accent"
                                              >
                                                <Icon name="calendar" />
                                                Programar
                                              </Button>
                                            </>
                                          ) : null}

                                          {item.publicationStatus === 'SCHEDULED' ? (
                                            <Button onClick={() => void publish(item)} size="sm">
                                              Publicar ahora
                                            </Button>
                                          ) : null}

                                          {item.publicationStatus !== 'ARCHIVED' ? (
                                            <Button
                                              aria-label={`Archivar ${item.title}`}
                                              onClick={() => void archiveItem(item)}
                                              size="icon"
                                              title="Archivar"
                                              variant="ghost"
                                            >
                                              <Icon name="archive" />
                                            </Button>
                                          ) : null}

                                          <DropdownMenu
                                            label="Más opciones"
                                            trigger={
                                              <span aria-label="Más opciones" className="dropdown-trigger-icon">
                                                <Icon name="more" />
                                              </span>
                                            }
                                          >
                                            <DropdownItem
                                              onSelect={() =>
                                                setFullscreenEditorItem({ item, unit })
                                              }
                                            >
                                              <Icon name="edit" />
                                              Editor avanzado y borrador
                                            </DropdownItem>
                                            <DropdownItem
                                              onSelect={() => {
                                                setMoveItemData({ currentUnitId: unit.id, item });
                                                setTargetUnitId(
                                                  data.route!.units.find((u) => u.id !== unit.id)?.id ?? ''
                                                );
                                              }}
                                            >
                                              <Icon name="move" />
                                              Mover a otra unidad
                                            </DropdownItem>
                                            <DropdownItem onSelect={() => void duplicateItem(item)}>
                                              <Icon name="copy" />
                                              Duplicar contenido
                                            </DropdownItem>
                                            <DropdownItem
                                              onSelect={() =>
                                                setHistoryEntity({
                                                  id: item.id,
                                                  title: item.title,
                                                  type: 'LEARNING_ITEM',
                                                  version: item.version,
                                                })
                                              }
                                            >
                                              <Icon name="history" />
                                              Historial de versiones
                                            </DropdownItem>
                                          </DropdownMenu>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="learning-route__empty">
                                  Aún no hay contenido visible en esta unidad.
                                </p>
                              )}

                              {/* Unit Secondary Add / Schedule actions */}
                              <div className="learning-unit-secondary-actions">
                                <Button
                                  aria-label={`Nuevo contenido en ${unit.title}`}
                                  disabled={unit.status === 'ARCHIVED'}
                                  onClick={() =>
                                    setItemFormDraft({ unitId: unit.id, values: initialItemDraft(null) })
                                  }
                                  size="sm"
                                  variant="secondary"
                                >
                                  <Icon name="plus" />
                                  Nuevo contenido en {unit.title}
                                </Button>

                                {scheduleDraft?.itemId && unit.items.some((it) => it.id === scheduleDraft.itemId) ? (
                                  <form
                                    className="schedule-editor"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const candidate = unit.items.find((it) => it.id === scheduleDraft.itemId);
                                      if (candidate) void schedule(candidate);
                                    }}
                                  >
                                    <Input
                                      id={`schedule-${unit.id}`}
                                      label="Programar publicación"
                                      min={learningInstantToDateTimeLocal(new Date().toISOString())}
                                      onChange={(event) => setScheduleDraft({ ...scheduleDraft, value: event.target.value })}
                                      type="datetime-local"
                                      value={scheduleDraft.value}
                                    />
                                    <Button loading={saving} type="submit">
                                      Guardar programación
                                    </Button>
                                    <Button onClick={() => setScheduleDraft(null)} type="button" variant="secondary">
                                      Cancelar
                                    </Button>
                                  </form>
                                ) : null}
                              </div>
                            </section>
                          ))}
                        </div>
                      ) : (
                        <p className="learning-route__empty">Aún no hay contenido visible en esta ruta.</p>
                      )}

                      {/* Modal Attachment Manager when active */}
                      {attachmentItem ? (
                        <TeacherAttachmentManager api={client} item={attachmentItem} />
                      ) : null}
                    </div>
                  ),
                  id: 'content',
                  label: 'Ruta y contenido',
                },
                {
                  content: (
                    <TeacherSubmissionQueue
                      api={client}
                      courseSubjectId={data.selected.id}
                      items={data.route.units.flatMap((u) =>
                        u.items.filter((i) => i.type === 'ASSIGNMENT' || i.type === 'ASSESSMENT')
                      )}
                    />
                  ),
                  id: 'submissions',
                  label: 'Entregas',
                },
                {
                  content: (
                    <Card className="team-panel">
                      <Icon name="people" />
                      <div>
                        <strong>Equipo del CourseSubject</strong>
                        <small>Todos los docentes asignados comparten este espacio según la autorización del servidor.</small>
                      </div>
                    </Card>
                  ),
                  id: 'team',
                  label: 'Colaboración',
                },
              ]}
              label="Secciones de la asignatura"
            />

            {/* FULLSCREEN ADVANCED EDITOR OVERLAY */}
            {fullscreenEditorItem ? (
              <div className="teacher-editor-overlay">
                <TeacherContentEditor
                  api={client}
                  item={fullscreenEditorItem.item}
                  onClose={() => setFullscreenEditorItem(null)}
                  onSaved={async () => {
                    await refresh();
                  }}
                  subject={data.selected}
                  unit={fullscreenEditorItem.unit}
                />
              </div>
            ) : null}

            {/* MOVE ITEM DIALOG */}
            {moveItemData ? (
              <Dialog
                description="Selecciona la unidad de destino para este contenido."
                onOpenChange={(open) => {
                  if (!open && !moving) setMoveItemData(null);
                }}
                open
                title="Mover contenido a otra unidad"
              >
                <div className="move-item-form">
                  <p>Moviendo «<strong>{moveItemData.item.title}</strong>»</p>
                  <Select
                    id="target-unit-select"
                    label="Unidad de destino"
                    onChange={(event) => setTargetUnitId(event.target.value)}
                    value={targetUnitId}
                  >
                    {data.route.units
                      .filter((u) => u.id !== moveItemData.currentUnitId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.title}
                        </option>
                      ))}
                  </Select>

                  <div className="showcase-dialog-actions">
                    <Button disabled={moving} onClick={() => setMoveItemData(null)} type="button" variant="secondary">
                      Cancelar
                    </Button>
                    <Button
                      disabled={!targetUnitId || moving}
                      loading={moving}
                      onClick={() => void executeMoveItemToUnit()}
                      type="button"
                    >
                      Mover contenido
                    </Button>
                  </div>
                </div>
              </Dialog>
            ) : null}

            {/* HISTORY DRAWER */}
            {historyEntity ? (
              <ContentHistoryDrawer
                api={client}
                currentVersion={historyEntity.version}
                entityId={historyEntity.id}
                entityTitle={historyEntity.title}
                entityType={historyEntity.type}
                onClose={() => setHistoryEntity(null)}
                onRestored={async () => {
                  await refresh();
                }}
                open
              />
            ) : null}

            {/* SENSITIVE CHANGE CONFIRMATION */}
            {confirmation ? (
              <Dialog
                description="El servidor indicó que esta modificación necesita una confirmación explícita."
                onOpenChange={(open) => {
                  if (!open && !confirming) setConfirmation(null);
                }}
                open
                title="Confirmar cambio sensible"
              >
                <p>{confirmation.body}</p>
                <div className="showcase-dialog-actions">
                  <Button onClick={() => setConfirmation(null)} type="button" variant="secondary">
                    Cancelar
                  </Button>
                  <Button
                    loading={confirming}
                    onClick={() => void confirmSensitive()}
                    type="button"
                  >
                    Confirmar cambio
                  </Button>
                </div>
              </Dialog>
            ) : null}
          </>
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 4. TEACHER REVIEWS WORKSPACE (/docente/revisiones & [submissionId])
// ---------------------------------------------------------------------------

function useTeacherReviewWorkspace(api: AcademicApiClient) {
  const [contexts, setContexts] = useState<Array<{ subject: CourseSubject; items: LearningItem[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const nextContexts = await Promise.all(
        subjects.map(async (subject) => {
          const route = await api.getLearningRoute(subject.id);
          return {
            items: route.units.flatMap((unit) =>
              unit.items.filter((item) => item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT')
            ),
            subject,
          };
        })
      );
      setContexts(nextContexts);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { contexts, error, load, loading };
}

export function TeacherReviewsScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherReviewWorkspace(client);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Solo aparecen entregas de CourseSubjects donde el servidor reconoce tu asignación docente."
        title="Revisiones"
      />

      <TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>
        {data.contexts.some((context) => context.items.length) ? (
          <div className="review-contexts">
            {data.contexts
              .filter((context) => context.items.length)
              .map((context) => (
                <section className="review-context" key={context.subject.id}>
                  <div className="section-heading">
                    <div>
                      <h2>{subjectName(context.subject)} · {courseName(context.subject)}</h2>
                      <p>Entregas y evaluaciones autorizadas para este CourseSubject.</p>
                    </div>
                    <Badge tone="info">{context.items.length} contenido{context.items.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <TeacherSubmissionQueue api={client} courseSubjectId={context.subject.id} items={context.items} />
                </section>
              ))}
          </div>
        ) : (
          <EmptyState
            description="Cuando tus estudiantes envíen actividades o evaluaciones aparecerán aquí."
            icon={<Icon name="review" />}
            title="Sin entregas para revisar"
          />
        )}
      </TeacherDataState>
    </AppShell>
  );
}

export function SubmissionReviewScreen({
  api,
  session = demoSessions.teacher,
  submissionId,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
  submissionId?: string;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        action={
          <Link className="button-link button-link--secondary" href="/docente/revisiones">
            <Icon name="review" />
            Volver a revisiones
          </Link>
        }
        description="Revisa la historia inmutable de archivos, comentarios y decisiones del docente."
        title="Revisión de entrega"
      />
      <TeacherSubmissionDetail api={client} submissionId={submissionId} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 5. TEACHER CALENDAR SCREEN (/docente/calendario)
// ---------------------------------------------------------------------------

interface CalendarAgendaEntry {
  id: string;
  title: string;
  subject: CourseSubject;
  date: string;
  type: 'DUE' | 'PUBLISH' | 'UNIT_START' | 'UNIT_END';
  itemType?: LearningItem['type'];
}

function startOfLocalDay(value: string) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(value: string) {
  const diffDays = Math.round((startOfLocalDay(value) - startOfLocalDay(new Date().toISOString())) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  const formatted = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function useTeacherCalendarData(api: AcademicApiClient) {
  const [entries, setEntries] = useState<CalendarAgendaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const routes = await Promise.all(
        subjects.map(async (subject) => ({
          route: await api.getLearningRoute(subject.id),
          subject,
        }))
      );

      const agenda: CalendarAgendaEntry[] = [];

      for (const { route, subject } of routes) {
        for (const unit of route.units) {
          if (unit.startAt) {
            agenda.push({
              date: unit.startAt,
              id: `unit-start-${unit.id}`,
              subject,
              title: `Inicio: ${unit.title}`,
              type: 'UNIT_START',
            });
          }
          if (unit.endAt) {
            agenda.push({
              date: unit.endAt,
              id: `unit-end-${unit.id}`,
              subject,
              title: `Fin: ${unit.title}`,
              type: 'UNIT_END',
            });
          }

          for (const item of unit.items) {
            if (item.dueAt) {
              agenda.push({
                date: item.dueAt,
                id: `item-due-${item.id}`,
                itemType: item.type,
                subject,
                title: item.title,
                type: 'DUE',
              });
            }
            if (item.publicationStatus === 'SCHEDULED' && item.publishAt) {
              agenda.push({
                date: item.publishAt,
                id: `item-publish-${item.id}`,
                itemType: item.type,
                subject,
                title: item.title,
                type: 'PUBLISH',
              });
            }
          }
        }
      }

      agenda.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setEntries(agenda);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { entries, error, load, loading };
}

export function TeacherCalendarScreen({
  api,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const { entries, error, load, loading } = useTeacherCalendarData(client);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: CalendarAgendaEntry[] }>();
    for (const entry of entries) {
      const key = dayKey(entry.date);
      if (!map.has(key)) {
        map.set(key, { label: dayLabel(entry.date), rows: [] });
      }
      map.get(key)!.rows.push(entry);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [entries]);

  return (
    <AppShell dataMode="real" session={currentSession}>
      <PageHeading
        description="Cronograma de fechas de entrega, publicaciones programadas y disponibilidad de unidades."
        title="Calendario"
      />

      <TeacherDataState error={error} loading={loading} onRetry={() => void dataLoadFallback(load)}>
        {groups.length ? (
          <div className="calendar-agenda">
            {groups.map((group) => (
              <section aria-labelledby={`calendar-day-${group.key}`} className="calendar-day" key={group.key}>
                <h2 id={`calendar-day-${group.key}`}>{group.label}</h2>
                <div className="learning-items">
                  {group.rows.map((entry) => (
                    <Link
                      className="learning-item"
                      href={`/docente/asignaturas/${entry.subject.id}`}
                      key={entry.id}
                    >
                      <span className={`learning-item__icon ${entry.type === 'DUE' ? 'learning-item__icon--assignment' : ''}`}>
                        <Icon
                          name={
                            entry.type === 'DUE'
                              ? 'clock'
                              : entry.type === 'PUBLISH'
                              ? 'calendar'
                              : 'book'
                          }
                        />
                      </span>

                      <span className="learning-item__copy">
                        <small>{subjectName(entry.subject)} · {courseName(entry.subject)}</small>
                        <strong>{entry.title}</strong>
                        <span>
                          {entry.type === 'DUE'
                            ? 'Plazo límite para entrega de estudiantes'
                            : entry.type === 'PUBLISH'
                            ? 'Publicación automática para el curso'
                            : 'Ventana de disponibilidad de unidad'}
                        </span>
                      </span>

                      <span className="learning-item__meta">
                        <Badge
                          tone={
                            entry.type === 'DUE'
                              ? 'warning'
                              : entry.type === 'PUBLISH'
                              ? 'info'
                              : 'neutral'
                          }
                        >
                          {entry.type === 'DUE'
                            ? 'Entrega'
                            : entry.type === 'PUBLISH'
                            ? 'Publicación'
                            : 'Unidad'}
                        </Badge>
                        <small><Icon name="clock" />{formatInstant(entry.date)}</small>
                      </span>

                      <Icon className="learning-item__chevron" name="chevron-right" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Cuando programes publicaciones o asignes fechas de entrega en tus unidades, aparecerán aquí cronológicamente."
            icon={<Icon name="calendar" />}
            title="Sin fechas en el calendario"
          />
        )}
      </TeacherDataState>
    </AppShell>
  );
}

function dataLoadFallback(fn: () => Promise<void>) {
  void fn();
}

// ---------------------------------------------------------------------------
// 6. TEACHER ITEM DIRECT EDITOR SCREEN
// ---------------------------------------------------------------------------

export function TeacherItemEditorScreen({
  api,
  courseSubjectId,
  learningItemId,
  session = demoSessions.teacher,
}: {
  api?: AcademicApiClient;
  courseSubjectId: string;
  learningItemId: string;
  session?: TrustedCurrentSession;
}) {
  const router = useRouter();
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);

  let matchedUnitAndItem: { item: LearningItem; unit: LearningUnitWithItems } | null = null;
  if (data.route) {
    for (const unit of data.route.units) {
      const item = unit.items.find((i) => i.id === learningItemId);
      if (item) {
        matchedUnitAndItem = { item, unit };
        break;
      }
    }
  }

  return (
    <AppShell dataMode="real" session={currentSession}>
      <TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>
        {data.selected && matchedUnitAndItem ? (
          <TeacherContentEditor
            api={client}
            item={matchedUnitAndItem.item}
            onClose={() => {
              router.push(`/docente/asignaturas/${courseSubjectId}`);
            }}
            onSaved={async () => {
              await data.load();
            }}
            subject={data.selected}
            unit={matchedUnitAndItem.unit}
          />
        ) : !data.loading ? (
          <EmptyState
            action={
              <Link className="button-link button-link--primary" href={`/docente/asignaturas/${courseSubjectId}`}>
                Volver a la asignatura
              </Link>
            }
            description="El contenido solicitado no existe, fue archivado o no tienes autorización para editarlo."
            icon={<Icon name="document" />}
            title="Contenido no encontrado"
          />
        ) : null}
      </TeacherDataState>
    </AppShell>
  );
}
