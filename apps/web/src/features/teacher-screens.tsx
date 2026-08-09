'use client';

import { Alert, Badge, Button, Card, Dialog, EmptyState, Input, Select, Skeleton, Tabs, Textarea } from '@edupay/ui';
import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { LearningRoute, PageHeading, SubjectCard, CompactStat } from '@/components/page-primitives';
import { TeacherAttachmentManager } from '@/components/teacher-attachment-manager';
import { TeacherSubmissionDetail, TeacherSubmissionQueue } from '@/components/teacher-submission-workflow';
import { useTrustedCurrentSession, type TrustedCurrentSession } from '@/auth/current-session';
import { demoSessions } from '@/demo/demo-data';
import { courseName, errorCopy, subjectCard, subjectName, isSensitiveConfirmationError } from '@/features/learning-screen-support';

type UnitDraft = { id?: string; title: string; description: string; startAt: string; endAt: string };
type ItemDraft = { id?: string; type: LearningItem['type']; title: string; description: string; content: string; instructions: string; body: string; dueAt: string };
type LearningRouteData = Awaited<ReturnType<AcademicApiClient['getLearningRoute']>>;

function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

function toInstant(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function apiFormError(error: unknown) {
  if (error instanceof AcademicApiError) return error.message;
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) return error.issues.map((issue: { message: string }) => issue.message).join(' ');
  return 'Revisa los campos e inténtalo nuevamente.';
}

function useTeacherContexts(api: AcademicApiClient) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSubjects(await api.getTeacherContextSubjects()); } catch (nextError) { setError(nextError); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { error, load, loading, subjects };
}

function useTeacherRoute(api: AcademicApiClient, requestedCourseSubjectId?: string) {
  const [subjects, setSubjects] = useState<Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>>([]);
  const [route, setRoute] = useState<LearningRouteData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const selected = subjects.find((subject) => subject.id === requestedCourseSubjectId) ?? (requestedCourseSubjectId ? undefined : subjects[0]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const nextSubjects = await api.getTeacherContextSubjects();
      setSubjects(nextSubjects);
      const nextSubject = nextSubjects.find((subject) => subject.id === requestedCourseSubjectId) ?? (requestedCourseSubjectId ? undefined : nextSubjects[0]);
      if (!nextSubject) { setRoute(null); return; }
      setRoute(await api.getLearningRoute(nextSubject.id));
    } catch (nextError) { setError(nextError); }
    finally { setLoading(false); }
  }, [api, requestedCourseSubjectId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { error, load, loading, route, selected, subjects };
}

function TeacherDataState({ children, error, loading, onRetry }: { children: React.ReactNode; error: unknown; loading: boolean; onRetry: () => void }) {
  if (loading) return <div aria-label="Cargando contenido docente" className="academic-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (error) { const copy = errorCopy(error); return <Alert action={<Button onClick={onRetry} variant="secondary">Reintentar</Button>} title={copy.title} tone={copy.title === 'Acceso no autorizado' ? 'warning' : 'error'}>{copy.body}{error instanceof AcademicApiError && error.requestId !== 'unavailable' ? <small className="request-id">Referencia: {error.requestId}</small> : null}</Alert>; }
  return children;
}

function LearningUnitForm({ draft, error, onCancel, onChange, onSubmit, saving }: { draft: UnitDraft; error: string; onCancel: () => void; onChange: (draft: UnitDraft) => void; onSubmit: () => void; saving: boolean }) {
  return <form className="learning-editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="section-heading"><div><h3>{draft.id ? 'Editar unidad' : 'Nueva unidad'}</h3><p>Las unidades nuevas quedan en borrador hasta que las actives.</p></div></div><div className="learning-editor-grid"><Input id="unit-title" label="Título" maxLength={160} onChange={(event) => onChange({ ...draft, title: event.target.value })} required value={draft.title} /><Textarea id="unit-description" label="Descripción (opcional)" onChange={(event) => onChange({ ...draft, description: event.target.value })} value={draft.description} /><Input id="unit-start" label="Disponible desde (opcional)" onChange={(event) => onChange({ ...draft, startAt: event.target.value })} type="datetime-local" value={draft.startAt} /><Input id="unit-end" label="Disponible hasta (opcional)" onChange={(event) => onChange({ ...draft, endAt: event.target.value })} type="datetime-local" value={draft.endAt} /></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="learning-editor-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancelar</Button><Button loading={saving} type="submit">{draft.id ? 'Guardar unidad' : 'Crear unidad'}</Button></div></form>;
}

function LearningItemForm({ draft, error, onCancel, onChange, onSubmit, saving }: { draft: ItemDraft; error: string; onCancel: () => void; onChange: (draft: ItemDraft) => void; onSubmit: () => void; saving: boolean }) {
  const deliverable = draft.type === 'ASSIGNMENT' || draft.type === 'ASSESSMENT';
  return <form className="learning-editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="section-heading"><div><h3>{draft.id ? 'Editar contenido' : 'Nuevo contenido'}</h3><p>Elige el tipo primero para mostrar los campos que el API requiere.</p></div></div><div className="learning-editor-grid"><Select id="item-type" label="Tipo" onChange={(event) => onChange({ ...draft, type: event.target.value as LearningItem['type'], dueAt: event.target.value === 'MATERIAL' || event.target.value === 'ANNOUNCEMENT' ? '' : draft.dueAt })} value={draft.type}><option value="MATERIAL">Material</option><option value="ASSIGNMENT">Actividad</option><option value="ASSESSMENT">Evaluación en documento</option><option value="ANNOUNCEMENT">Anuncio</option></Select><Input id="item-title" label="Título" maxLength={160} onChange={(event) => onChange({ ...draft, title: event.target.value })} required value={draft.title} /><Textarea id="item-description" label="Descripción (opcional)" onChange={(event) => onChange({ ...draft, description: event.target.value })} value={draft.description} />{draft.type === 'MATERIAL' ? <Textarea id="item-content" label="Contenido" onChange={(event) => onChange({ ...draft, content: event.target.value })} value={draft.content} /> : null}{draft.type === 'ANNOUNCEMENT' ? <Textarea id="item-body" label="Mensaje" onChange={(event) => onChange({ ...draft, body: event.target.value })} required value={draft.body} /> : null}{deliverable ? <Textarea id="item-instructions" label="Instrucciones" onChange={(event) => onChange({ ...draft, instructions: event.target.value })} required value={draft.instructions} /> : null}{deliverable ? <Input id="item-due" label="Fecha de entrega" onChange={(event) => onChange({ ...draft, dueAt: event.target.value })} required type="datetime-local" value={draft.dueAt} /> : null}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="learning-editor-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancelar</Button><Button loading={saving} type="submit">{draft.id ? 'Guardar contenido' : 'Crear contenido'}</Button></div></form>;
}

function initialUnit(unit?: LearningUnitWithItems): UnitDraft {
  const draft = { description: unit?.description ?? '', endAt: toDateInput(unit?.endAt ?? null), startAt: toDateInput(unit?.startAt ?? null), title: unit?.title ?? '' };
  return unit ? { ...draft, id: unit.id } : draft;
}

function initialItem(item?: LearningItem): ItemDraft {
  const draft = { body: item?.body ?? '', content: item?.content ?? '', description: item?.description ?? '', dueAt: toDateInput(item?.dueAt ?? null), instructions: item?.instructions ?? '', title: item?.title ?? '', type: item?.type ?? 'MATERIAL' as const };
  return item ? { ...draft, id: item.id } : draft;
}

function LearningActions({ item, itemIndex, itemCount, onArchive, onAttachments, onEdit, onMove, onPublish, onSchedule }: { item: LearningItem; itemIndex: number; itemCount: number; onArchive: () => void; onAttachments: () => void; onEdit: () => void; onMove: (direction: -1 | 1) => void; onPublish: () => void; onSchedule: () => void }) {
  const attachmentSupported = item.type !== 'ANNOUNCEMENT';
  return <div className="learning-action-group"><Button aria-label={`Subir ${item.title}`} disabled={itemIndex === 0} onClick={() => onMove(-1)} size="icon" title="Subir" variant="ghost"><Icon name="chevron-down" className="rotate-180" /></Button><Button aria-label={`Bajar ${item.title}`} disabled={itemIndex === itemCount - 1} onClick={() => onMove(1)} size="icon" title="Bajar" variant="ghost"><Icon name="chevron-down" /></Button><Button aria-label={`Editar ${item.title}`} onClick={onEdit} size="sm" variant="secondary"><Icon name="settings" />Editar</Button>{attachmentSupported ? <Button aria-label={`Gestionar archivos de ${item.title}`} onClick={onAttachments} size="sm" variant="secondary"><Icon name="paperclip" />Archivos</Button> : null}{item.publicationStatus === 'DRAFT' ? <><Button onClick={onPublish} size="sm">Publicar</Button><Button onClick={onSchedule} size="sm" variant="accent"><Icon name="calendar" />Programar</Button></> : null}{item.publicationStatus === 'SCHEDULED' ? <Button onClick={onPublish} size="sm">Publicar ahora</Button> : null}{item.publicationStatus !== 'ARCHIVED' ? <Button aria-label={`Archivar ${item.title}`} onClick={onArchive} size="icon" title="Archivar" variant="ghost"><Icon name="archive" /></Button> : null}</div>;
}

export function TeacherDashboardScreen({ api, session = demoSessions.teacher }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherContexts(client);
  return <AppShell dataMode="real" session={currentSession}><PageHeading action={<Link className="button-link button-link--primary" href="/docente/asignaturas"><Icon name="book" />Ver contenido</Link>} description="Tus CourseSubjects autorizados y sus rutas de aprendizaje reales." title={`Buenos días, ${currentSession.displayName.split(' ')[0]}`} /><TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}><div className="compact-stats"><CompactStat icon="book" label="CourseSubjects asignados" value={String(data.subjects.length)} /><CompactStat icon="review" label="Entregas" value="Ver revisiones" /><CompactStat icon="calendar" label="Calendario" value="Próximamente" /></div><div className="teacher-dashboard-grid"><section aria-labelledby="teacher-route-title" className="content-section teacher-review-queue"><div className="section-heading"><div><h2 id="teacher-route-title">Contenido autorizado</h2><p>Abre un espacio para organizar sus unidades e ítems.</p></div></div>{data.subjects.length ? <div className="subject-grid subject-grid--overview">{data.subjects.map((subject, index) => <SubjectCard key={subject.id} subject={subjectCard(subject, index, 'teacher')} />)}</div> : <EmptyState icon={<Icon name="book" />} title="No tienes CourseSubjects asignados" description="Un administrador debe asignarte a un CourseSubject activo." />}</section><aside className="week-plan"><h2>Entregas y revisiones</h2><p>La información de archivos, entregas, historial y revisión está conectada al API autorizado.</p><Link className="button-link button-link--accent" href="/docente/revisiones"><Icon name="review" />Abrir revisiones</Link><Badge tone="success">Conectado</Badge></aside></div></TeacherDataState></AppShell>;
}

export function TeacherSubjectsScreen({ api, session = demoSessions.teacher }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherContexts(client);
  return <AppShell dataMode="real" session={currentSession}><PageHeading description="Solo aparecen los CourseSubjects donde el servidor reconoce una asignación docente activa." title="Asignaturas" /><TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>{data.subjects.length ? <div className="subject-grid subject-grid--overview">{data.subjects.map((subject, index) => <SubjectCard key={subject.id} subject={subjectCard(subject, index, 'teacher')} />)}</div> : <EmptyState icon={<Icon name="book" />} title="No tienes CourseSubjects asignados" description="Un administrador debe asignarte a un CourseSubject activo para gestionar contenido." />}</TeacherDataState></AppShell>;
}

export function TeacherSubjectScreen({ api, courseSubjectId, session = demoSessions.teacher }: { api?: AcademicApiClient; courseSubjectId?: string; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherRoute(client, courseSubjectId);
  const [unitDraft, setUnitDraft] = useState<UnitDraft | null>(null);
  const [itemDraft, setItemDraft] = useState<{ unitId: string; values: ItemDraft } | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachmentItem, setAttachmentItem] = useState<LearningItem | null>(null);
  const [confirmation, setConfirmation] = useState<{ body: string; run: () => Promise<void> } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function refresh() { await data.load(); }
  async function run(action: () => Promise<void>, confirmedAction = action) { setSaving(true); setFormError(''); try { await action(); await refresh(); } catch (error) { if (isSensitiveConfirmationError(error)) setConfirmation({ body: error instanceof Error ? error.message : 'Este cambio puede afectar contenido publicado o evidencia histórica.', run: confirmedAction }); else setFormError(apiFormError(error)); } finally { setSaving(false); } }

  function editUnit(unit?: LearningUnitWithItems) { setFormError(''); setUnitDraft(initialUnit(unit)); setItemDraft(null); }
  function editItem(unitId: string, item?: LearningItem) { setFormError(''); setItemDraft({ unitId, values: initialItem(item) }); setUnitDraft(null); setScheduleDraft(null); }
  function itemInput(values: ItemDraft, confirmSensitiveChange = false) {
    const deliverable = values.type === 'ASSIGNMENT' || values.type === 'ASSESSMENT';
    return { body: values.type === 'ANNOUNCEMENT' ? values.body || undefined : undefined, content: values.type === 'MATERIAL' ? values.content || undefined : undefined, confirmSensitiveChange, description: values.description || undefined, dueAt: deliverable ? toInstant(values.dueAt) : undefined, instructions: deliverable ? values.instructions || undefined : undefined, title: values.title, type: values.type };
  }
  async function saveUnit() {
    if (!unitDraft || !data.selected) return;
    const courseSubjectId = data.selected.id;
    await run(async () => { if (unitDraft.id) await client.updateLearningUnit(unitDraft.id, { description: unitDraft.description || null, endAt: toInstant(unitDraft.endAt) ?? null, startAt: toInstant(unitDraft.startAt) ?? null, title: unitDraft.title }); else await client.createLearningUnit({ courseSubjectId, description: unitDraft.description || undefined, endAt: toInstant(unitDraft.endAt), sortOrder: 0, startAt: toInstant(unitDraft.startAt), title: unitDraft.title }); setUnitDraft(null); });
  }
  async function saveItem() {
    if (!itemDraft) return;
    const draft = itemDraft;
    const execute = async (confirmSensitiveChange: boolean) => {
      const input = itemInput(draft.values, confirmSensitiveChange);
      if (draft.values.id) await client.updateLearningItem(draft.values.id, input);
      else {
        const { confirmSensitiveChange: _confirmSensitiveChange, ...createInput } = input;
        void _confirmSensitiveChange;
        await client.createLearningItem(draft.unitId, { ...createInput, sortOrder: 0, dueAt: input.dueAt ?? undefined });
      }
      setItemDraft(null);
    };
    await run(() => execute(false), () => execute(true));
  }
  async function publish(item: LearningItem) { await run(async () => { await client.publishLearningItem(item.id); }); }
  async function archiveUnit(unit: LearningUnitWithItems) { await run(async () => { await client.archiveLearningUnit(unit.id); }); }
  async function archiveItem(item: LearningItem) { await run(async () => { await client.archiveLearningItem(item.id); }); }
  async function activateUnit(unit: LearningUnitWithItems) { await run(async () => { await client.updateLearningUnit(unit.id, { status: 'ACTIVE' }); }); }
  async function schedule(item: LearningItem) {
    if (!scheduleDraft) return;
    const value = toInstant(scheduleDraft.value);
    if (!value) { setFormError('Selecciona una fecha futura para programar.'); return; }
    await run(() => client.scheduleLearningItem(item.id, { confirmSensitiveChange: false, publishAt: value }).then(() => { setScheduleDraft(null); }), () => client.scheduleLearningItem(item.id, { confirmSensitiveChange: true, publishAt: value }).then(() => { setScheduleDraft(null); }));
  }
  async function moveUnit(index: number, direction: -1 | 1) { const route = data.route; const subject = data.selected; if (!route || !subject) return; const next = index + direction; if (next < 0 || next >= route.units.length) return; const orderedIds = route.units.map((unit) => unit.id); const current = orderedIds[index]; orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? ''; orderedIds[next] = current ?? ''; await run(async () => { await client.reorderLearningUnits(subject.id, { orderedIds }); }); }
  async function moveItem(unit: LearningUnitWithItems, index: number, direction: -1 | 1) { const next = index + direction; if (next < 0 || next >= unit.items.length) return; const orderedIds = unit.items.map((item) => item.id); const current = orderedIds[index]; orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? ''; orderedIds[next] = current ?? ''; await run(async () => { await client.reorderLearningItems(unit.id, { orderedIds }); }); }
  async function confirmSensitive() { if (!confirmation) return; setConfirming(true); try { await confirmation.run(); setConfirmation(null); await refresh(); } catch (error) { setFormError(apiFormError(error)); } finally { setConfirming(false); } }

  const missingSubject = !data.loading && !data.error && (!data.selected || !data.route);
  return <AppShell dataMode="real" session={currentSession}><TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>{missingSubject ? <EmptyState icon={<Icon name="book" />} title="CourseSubject no disponible" description="No tienes autorización para gestionar este espacio o ya no está activo." /> : data.selected && data.route ? <>
    <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/docente/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><span>{subjectName(data.selected)} · {courseName(data.selected)}</span></nav>
    <section className="teacher-subject-header"><div><div className="subject-hero__mark">{subjectName(data.selected).slice(0, 3).toUpperCase()}</div><div><h1>{subjectName(data.selected)}</h1><p>{courseName(data.selected)} · contenido dentro del CourseSubject autorizado</p></div></div><div className="header-actions"><Button onClick={() => editUnit()} variant="secondary"><Icon name="plus" />Nueva unidad</Button><Link className="button-link button-link--primary" href={`/docente/asignaturas/${data.selected.id}/estudiantes`}><Icon name="people" />Ver estudiantes</Link></div></section>
    {formError ? <Alert title="No se pudo guardar" tone="error">{formError}</Alert> : null}
    {unitDraft ? <LearningUnitForm draft={unitDraft} error={formError} onCancel={() => setUnitDraft(null)} onChange={setUnitDraft} onSubmit={() => void saveUnit()} saving={saving} /> : null}
    {itemDraft ? <LearningItemForm draft={itemDraft.values} error={formError} onCancel={() => setItemDraft(null)} onChange={(values) => setItemDraft({ ...itemDraft, values })} onSubmit={() => void saveItem()} saving={saving} /> : null}
    <Tabs label="Secciones de la asignatura" items={[{ id: 'content', label: 'Ruta y contenido', content: <><div className="authoring-toolbar"><div><h2>Ruta de aprendizaje</h2><p>Organiza unidades e ítems con acciones de teclado y botones de orden accesibles.</p></div><Badge tone="info">Vista docente</Badge></div><LearningRoute audience="teacher" units={data.route!.units} onUnitSelect={(unit, index) => <div className="learning-action-group"><Button aria-label={`Subir unidad ${unit.title}`} disabled={index === 0} onClick={() => void moveUnit(index, -1)} size="icon" title="Subir" variant="ghost"><Icon name="chevron-down" className="rotate-180" /></Button><Button aria-label={`Bajar unidad ${unit.title}`} disabled={index === data.route!.units.length - 1} onClick={() => void moveUnit(index, 1)} size="icon" title="Bajar" variant="ghost"><Icon name="chevron-down" /></Button><Button disabled={unit.status === 'ARCHIVED'} onClick={() => editUnit(unit)} size="sm" variant="secondary">Editar unidad</Button>{unit.status === 'DRAFT' ? <Button onClick={() => void activateUnit(unit)} size="sm">Activar</Button> : null}{unit.status !== 'ARCHIVED' ? <Button aria-label={`Archivar unidad ${unit.title}`} onClick={() => void archiveUnit(unit)} size="icon" title="Archivar" variant="ghost"><Icon name="archive" /></Button> : null}</div>} onItemSelect={(item, unit) => <LearningActions item={item} itemIndex={unit.items.findIndex((candidate) => candidate.id === item.id)} itemCount={unit.items.length} onArchive={() => void archiveItem(item)} onAttachments={() => setAttachmentItem(item)} onEdit={() => editItem(unit.id, item)} onMove={(direction) => void moveItem(unit, unit.items.findIndex((candidate) => candidate.id === item.id), direction)} onPublish={() => void publish(item)} onSchedule={() => setScheduleDraft({ itemId: item.id, value: toDateInput(item.publishAt) })} />} courseSubjectId={data.selected!.id} />{attachmentItem ? <TeacherAttachmentManager api={client} item={attachmentItem} /> : null}{data.route!.units.map((unit) => <div className="learning-unit-secondary-actions" key={`add-${unit.id}`}><Button disabled={unit.status === 'ARCHIVED'} onClick={() => editItem(unit.id)} size="sm" variant="secondary"><Icon name="plus" />Nuevo contenido en {unit.title}</Button>{scheduleDraft?.itemId && unit.items.some((item) => item.id === scheduleDraft.itemId) ? <form className="schedule-editor" onSubmit={(event) => { event.preventDefault(); const item = unit.items.find((candidate) => candidate.id === scheduleDraft.itemId); if (item) void schedule(item); }}><Input id={`schedule-${unit.id}`} label="Programar publicación" min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduleDraft({ ...scheduleDraft, value: event.target.value })} type="datetime-local" value={scheduleDraft.value} /><Button loading={saving} type="submit">Guardar programación</Button><Button onClick={() => setScheduleDraft(null)} type="button" variant="secondary">Cancelar</Button></form> : null}</div>)}</> }, { id: 'submissions', label: 'Entregas', content: <TeacherSubmissionQueue api={client} courseSubjectId={data.selected!.id} items={data.route!.units.flatMap((unit) => unit.items.filter((item) => item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT'))} /> }, { id: 'team', label: 'Colaboración', content: <Card className="team-panel"><Icon name="people" /><div><strong>Equipo del CourseSubject</strong><small>Todos los docentes asignados comparten este espacio según la autorización del servidor.</small></div></Card> }]} />
    {confirmation ? <Dialog description="El servidor indicó que esta modificación necesita una confirmación explícita." onOpenChange={(open) => { if (!open && !confirming) setConfirmation(null); }} open title="Confirmar cambio sensible"><p>{confirmation.body}</p><div className="showcase-dialog-actions"><Button onClick={() => setConfirmation(null)} type="button" variant="secondary">Cancelar</Button><Button loading={confirming} onClick={() => void confirmSensitive()} type="button">Confirmar cambio</Button></div></Dialog> : null}
  </> : null}</TeacherDataState></AppShell>;
}

function useTeacherReviewWorkspace(api: AcademicApiClient) {
  const [contexts, setContexts] = useState<Array<{ subject: Awaited<ReturnType<AcademicApiClient['getTeacherContextSubjects']>>[number]; items: LearningItem[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const subjects = await api.getTeacherContextSubjects();
      const nextContexts = await Promise.all(subjects.map(async (subject) => {
        const route = await api.getLearningRoute(subject.id);
        return { subject, items: route.units.flatMap((unit) => unit.items.filter((item) => item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT')) };
      }));
      setContexts(nextContexts);
    } catch (nextError) { setError(nextError); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { contexts, error, load, loading };
}

export function SubmissionReviewScreen({ api, session = demoSessions.teacher, submissionId }: { api?: AcademicApiClient; session?: TrustedCurrentSession; submissionId?: string }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  return <AppShell dataMode="real" session={currentSession}><PageHeading action={<Link className="button-link button-link--secondary" href="/docente/revisiones"><Icon name="review" />Volver a revisiones</Link>} description="Revisa la historia inmutable de archivos, comentarios y decisiones del docente." title="Revisión de entrega" /><TeacherSubmissionDetail api={client} submissionId={submissionId} /></AppShell>;
}

export function TeacherReviewsScreen({ api, session = demoSessions.teacher }: { api?: AcademicApiClient; session?: TrustedCurrentSession }) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const data = useTeacherReviewWorkspace(client);
  return <AppShell dataMode="real" session={currentSession}><PageHeading description="Solo aparecen entregas de CourseSubjects donde el servidor reconoce tu asignación docente." title="Revisiones" /><TeacherDataState error={data.error} loading={data.loading} onRetry={() => void data.load()}>{data.contexts.some((context) => context.items.length) ? <div className="review-contexts">{data.contexts.filter((context) => context.items.length).map((context) => <section className="review-context" key={context.subject.id}><div className="section-heading"><div><h2>{subjectName(context.subject)} · {courseName(context.subject)}</h2><p>Entregas y evaluaciones autorizadas para este CourseSubject.</p></div><Badge tone="info">{context.items.length} contenido{context.items.length === 1 ? '' : 's'}</Badge></div><TeacherSubmissionQueue api={client} courseSubjectId={context.subject.id} items={context.items} /></section>)}</div> : <EmptyState icon={<Icon name="review" />} title="Sin entregas para revisar" description="Cuando tus estudiantes envíen actividades o evaluaciones aparecerán aquí." />}</TeacherDataState></AppShell>;
}
