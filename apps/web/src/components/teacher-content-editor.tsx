'use client';

import { Alert, Badge, Button, Card, Dialog, Input, Select, Textarea } from '@edupay/ui';
import type { CourseSubject, LearningItem, LearningItemDraft, LearningUnitWithItems } from '@edupay/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { ContentHistoryDrawer } from '@/components/content-history-drawer';
import { Icon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { RichTextEditor } from '@/components/rich-text-editor';
import { TeacherAttachmentManager } from '@/components/teacher-attachment-manager';
import { learningDateTimeLocalToInstant, learningInstantToDateTimeLocal } from '@/features/learning-datetime';
import { courseName, formatInstant, isSensitiveConfirmationError, subjectName } from '@/features/learning-screen-support';

export interface ContentEditorFormState {
  type: LearningItem['type'];
  title: string;
  description: string;
  content: string;
  instructions: string;
  body: string;
  dueAt: string;
  publishAt: string;
}

interface TeacherContentEditorProps {
  api: AcademicApiClient;
  subject: CourseSubject;
  unit: LearningUnitWithItems;
  item?: LearningItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function initialFormState(item?: LearningItem | null, draft?: LearningItemDraft | null): ContentEditorFormState {
  if (draft) {
    return {
      type: item?.type ?? 'MATERIAL',
      title: draft.title ?? item?.title ?? '',
      description: draft.description ?? item?.description ?? '',
      content: draft.content ?? item?.content ?? '',
      instructions: draft.instructions ?? item?.instructions ?? '',
      body: draft.body ?? item?.body ?? '',
      dueAt: learningInstantToDateTimeLocal(draft.dueAt ?? item?.dueAt ?? null),
      publishAt: learningInstantToDateTimeLocal(item?.publishAt ?? null),
    };
  }

  return {
    type: item?.type ?? 'MATERIAL',
    title: item?.title ?? '',
    description: item?.description ?? '',
    content: item?.content ?? '',
    instructions: item?.instructions ?? '',
    body: item?.body ?? '',
    dueAt: learningInstantToDateTimeLocal(item?.dueAt ?? null),
    publishAt: learningInstantToDateTimeLocal(item?.publishAt ?? null),
  };
}

export function TeacherContentEditor({
  api,
  item,
  onClose,
  onSaved,
  subject,
  unit,
}: TeacherContentEditorProps) {
  const isEditing = Boolean(item);
  const isPublished = item?.publicationStatus === 'PUBLISHED';
  const isScheduled = item?.publicationStatus === 'SCHEDULED';

  const [activeTab, setActiveTab] = useState<'content' | 'files' | 'settings' | 'preview'>('content');
  const [serverDraft, setServerDraft] = useState<LearningItemDraft | null>(null);
  const [form, setForm] = useState<ContentEditorFormState>(() => initialFormState(item));
  const [savedFormSnapshot, setSavedFormSnapshot] = useState<ContentEditorFormState>(() => initialFormState(item));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState('');
  const [staleRevisionConflict, setStaleRevisionConflict] = useState(false);
  const [confirmation, setConfirmation] = useState<{ body: string; run: () => Promise<void> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [unpublishDialogOpen, setUnpublishDialogOpen] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  // Check if form is dirty compared to saved state
  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(savedFormSnapshot);
  }, [form, savedFormSnapshot]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Load server draft if editing published item
  const loadDraft = useCallback(async () => {
    if (!item || !isPublished) return;
    try {
      const response = await api.getLearningItemDraft(item.id);
      if (response.draft) {
        setServerDraft(response.draft);
        const nextState = initialFormState(item, response.draft);
        setForm(nextState);
        setSavedFormSnapshot(nextState);
      }
    } catch {
      // Draft not found or clean state
    }
  }, [api, isPublished, item]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDraft(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDraft]);

  const deliverable = form.type === 'ASSIGNMENT' || form.type === 'ASSESSMENT';

  const prepareInput = (confirmSensitiveChange = false) => {
    return {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      content: form.type === 'MATERIAL' ? form.content || undefined : undefined,
      instructions: deliverable ? form.instructions || undefined : undefined,
      body: form.type === 'ANNOUNCEMENT' ? form.body || undefined : undefined,
      dueAt: deliverable ? learningDateTimeLocalToInstant(form.dueAt) : undefined,
      confirmSensitiveChange,
    };
  };

  // Save changes locally/draft
  async function handleSaveDraft() {
    if (!form.title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    setStaleRevisionConflict(false);

    try {
      if (!item) {
        // Create as new item in unit
        const input = prepareInput(false);
        const { confirmSensitiveChange: _, ...createInput } = input;
        void _;
        await api.createLearningItem(unit.id, {
          ...createInput,
          sortOrder: 0,
          dueAt: createInput.dueAt ?? undefined,
        });
        setSavedFormSnapshot(form);
        setLastSavedAt(new Date());
        onSaved();
        onClose();
        return;
      }

      if (isPublished) {
        // Save as working draft
        const draftInput = {
          title: form.title.trim() || undefined,
          description: form.description.trim() || null,
          content: form.type === 'MATERIAL' ? form.content || null : null,
          instructions: deliverable ? form.instructions || null : null,
          body: form.type === 'ANNOUNCEMENT' ? form.body || null : null,
          dueAt: deliverable ? learningDateTimeLocalToInstant(form.dueAt) ?? null : null,
        };
        const savedDraft = await api.saveLearningItemDraft(item.id, draftInput);
        setServerDraft(savedDraft);
        setSavedFormSnapshot(form);
        setLastSavedAt(new Date());
        onSaved();
      } else {
        // Normal draft item update
        const input = prepareInput(false);
        await api.updateLearningItem(item.id, input);
        setSavedFormSnapshot(form);
        setLastSavedAt(new Date());
        onSaved();
      }
    } catch (err) {
      if (err instanceof AcademicApiError && err.code === 'STALE_REVISION') {
        setStaleRevisionConflict(true);
      } else if (isSensitiveConfirmationError(err)) {
        setConfirmation({
          body: err instanceof Error ? err.message : 'Este cambio requiere confirmación explícita.',
          run: async () => {
            const input = prepareInput(true);
            await api.updateLearningItem(item!.id, input);
            setSavedFormSnapshot(form);
            setLastSavedAt(new Date());
            onSaved();
          },
        });
      } else {
        setError(err instanceof AcademicApiError ? err.message : 'No pudimos guardar los cambios.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Publish / Publish Draft
  async function handlePublish(confirmSensitiveChange = false) {
    if (!form.title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setPublishing(true);
    setError('');
    setStaleRevisionConflict(false);

    try {
      if (isPublished && serverDraft) {
        // Publish existing working draft
        await api.publishLearningItemDraft(item!.id, { confirmSensitiveChange });
        setServerDraft(null);
        onSaved();
        onClose();
        return;
      }

      if (!item) {
        // Create and publish
        const input = prepareInput(false);
        const { confirmSensitiveChange: _, ...createInput } = input;
        void _;
        const created = await api.createLearningItem(unit.id, {
          ...createInput,
          sortOrder: 0,
          dueAt: createInput.dueAt ?? undefined,
        });
        await api.publishLearningItem(created.id);
        onSaved();
        onClose();
        return;
      }

      // If draft has unsaved edits, save them first
      if (isDirty) {
        const input = prepareInput(confirmSensitiveChange);
        await api.updateLearningItem(item.id, input);
      }

      // Publish item
      await api.publishLearningItem(item.id);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof AcademicApiError && err.code === 'STALE_REVISION') {
        setStaleRevisionConflict(true);
      } else if (isSensitiveConfirmationError(err)) {
        setConfirmation({
          body: err instanceof Error ? err.message : 'Publicar estos cambios puede alterar lo que ven los estudiantes o la evidencia registrada.',
          run: async () => handlePublish(true),
        });
      } else {
        setError(err instanceof AcademicApiError ? err.message : 'No pudimos publicar el contenido.');
      }
    } finally {
      setPublishing(false);
    }
  }

  // Discard working draft
  async function handleDiscardDraft() {
    if (!item) return;
    setDiscarding(true);
    setError('');
    try {
      await api.discardLearningItemDraft(item.id);
      setServerDraft(null);
      const cleanState = initialFormState(item, null);
      setForm(cleanState);
      setSavedFormSnapshot(cleanState);
      onSaved();
    } catch (err) {
      setError(err instanceof AcademicApiError ? err.message : 'No pudimos descartar el borrador.');
    } finally {
      setDiscarding(false);
    }
  }

  // Unpublish published item
  async function handleUnpublish() {
    if (!item) return;
    setUnpublishing(true);
    setError('');
    try {
      await api.unpublishLearningItem(item.id);
      setUnpublishDialogOpen(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof AcademicApiError ? err.message : 'No pudimos retirar la publicación.');
    } finally {
      setUnpublishing(false);
    }
  }

  // Refresh server version after 409 conflict
  async function handleRefreshAfterConflict() {
    setStaleRevisionConflict(false);
    setError('');
    if (item) {
      const refreshedItem = await api.getLearningItem(item.id);
      if (isPublished) {
        await loadDraft();
      } else {
        const nextState = initialFormState(refreshedItem);
        setSavedFormSnapshot(nextState);
      }
    }
  }

  return (
    <div className="teacher-editor-workspace">
      {/* Top Header */}
      <header className="teacher-editor-header">
        <div className="teacher-editor-header__left">
          <Button
            aria-label="Volver a la asignatura"
            onClick={() => {
              if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Deseas salir de todas formas?')) {
                return;
              }
              onClose();
            }}
            size="icon"
            variant="ghost"
          >
            <Icon name="chevron-right" className="rotate-180" />
          </Button>

          <div>
            <div className="teacher-editor-breadcrumbs">
              <span>{subjectName(subject)}</span>
              <Icon name="chevron-right" />
              <span>{unit.title}</span>
            </div>
            <h1>{isEditing ? (form.title || 'Contenido sin título') : 'Nuevo contenido'}</h1>
          </div>
        </div>

        <div className="teacher-editor-header__right">
          {/* Status Badge */}
          <div className="editor-status-indicators">
            {isPublished ? (
              <Badge tone="success"><Icon name="check" />Publicado</Badge>
            ) : isScheduled ? (
              <Badge tone="info"><Icon name="calendar" />Programado</Badge>
            ) : (
              <Badge tone="neutral">Borrador</Badge>
            )}

            {serverDraft ? (
              <Badge tone="warning"><Icon name="edit" />Borrador activo</Badge>
            ) : null}

            {/* Dirty State Indicator */}
            <span className="dirty-indicator">
              {saving ? (
                <small className="dirty-indicator--saving"><Icon name="clock" />Guardando…</small>
              ) : isDirty ? (
                <small className="dirty-indicator--dirty"><span className="dirty-dot" />Sin guardar</small>
              ) : lastSavedAt ? (
                <small className="dirty-indicator--saved"><Icon name="check" />Guardado {lastSavedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</small>
              ) : null}
            </span>
          </div>

          {isEditing ? (
            <Button onClick={() => setHistoryOpen(true)} size="sm" variant="secondary">
              <Icon name="history" />
              Historial
            </Button>
          ) : null}
        </div>
      </header>

      {/* Published Item Working Draft Banner */}
      {isPublished ? (
        <div className="working-draft-banner">
          <Icon name="layers" />
          <div>
            <strong>Estás editando un borrador de trabajo</strong>
            <p>
              Los estudiantes continúan viendo la versión publicada. Tus cambios solo serán visibles para el curso cuando pulses «Publicar cambios».
            </p>
          </div>
          {serverDraft ? (
            <Button
              disabled={discarding}
              loading={discarding}
              onClick={() => void handleDiscardDraft()}
              size="sm"
              variant="ghost"
            >
              Descartar borrador
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* 409 Stale Revision Conflict Banner */}
      {staleRevisionConflict ? (
        <Alert
          action={
            <Button onClick={() => void handleRefreshAfterConflict()} variant="secondary">
              Actualizar contenido
            </Button>
          }
          title="Este contenido cambió en otra sesión"
          tone="warning"
        >
          Otro docente o pestaña guardó cambios en este contenido. Tus modificaciones locales siguen en la pantalla para que puedas copiarlas antes de actualizar.
        </Alert>
      ) : null}

      {/* Error Alert */}
      {error ? <Alert title="No se pudo completar la acción" tone="error">{error}</Alert> : null}

      {/* Navigation Tabs */}
      <div className="editor-tabs-bar" role="tablist">
        <button
          aria-selected={activeTab === 'content'}
          className={`editor-nav-tab ${activeTab === 'content' ? 'editor-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('content')}
          role="tab"
          type="button"
        >
          <Icon name="document" />
          <span>Contenido</span>
        </button>

        {item && item.type !== 'ANNOUNCEMENT' ? (
          <button
            aria-selected={activeTab === 'files'}
            className={`editor-nav-tab ${activeTab === 'files' ? 'editor-nav-tab--active' : ''}`}
            onClick={() => setActiveTab('files')}
            role="tab"
            type="button"
          >
            <Icon name="paperclip" />
            <span>Archivos</span>
          </button>
        ) : null}

        <button
          aria-selected={activeTab === 'settings'}
          className={`editor-nav-tab ${activeTab === 'settings' ? 'editor-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
          role="tab"
          type="button"
        >
          <Icon name="settings" />
          <span>Publicación y plazos</span>
        </button>

        <button
          aria-selected={activeTab === 'preview'}
          className={`editor-nav-tab ${activeTab === 'preview' ? 'editor-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('preview')}
          role="tab"
          type="button"
        >
          <Icon name="eye" />
          <span>Vista previa alumno</span>
        </button>
      </div>

      {/* Tab Content Panels */}
      <main className="editor-main-panel">
        {/* 1. CONTENT TAB */}
        {activeTab === 'content' ? (
          <div className="editor-form-layout">
            <div className="editor-form-fields">
              <div className="editor-fields-group">
                <Select
                  disabled={isEditing}
                  id="editor-type"
                  label="Tipo de contenido"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      type: event.target.value as LearningItem['type'],
                    })
                  }
                  value={form.type}
                >
                  <option value="MATERIAL">Material (lecturas, guías y recursos)</option>
                  <option value="ASSIGNMENT">Actividad (tarea con entrega de estudiante)</option>
                  <option value="ASSESSMENT">Evaluación en documento (evaluación formal)</option>
                  <option value="ANNOUNCEMENT">Anuncio (comunicado para el curso)</option>
                </Select>

                <Input
                  id="editor-title"
                  label="Título del contenido"
                  maxLength={160}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Ej: Guía de comprensión lectora Nº 1"
                  required
                  value={form.title}
                />

                <Textarea
                  id="editor-description"
                  label="Descripción breve (opcional)"
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Resumen o contexto visible en el listado…"
                  value={form.description}
                />
              </div>

              {/* Specific Body Fields with Markdown */}
              {form.type === 'MATERIAL' ? (
                <RichTextEditor
                  id="editor-content-field"
                  label="Contenido del material"
                  onChange={(content) => setForm({ ...form, content })}
                  placeholder="Escribe aquí el material o recursos para tus estudiantes…"
                  value={form.content}
                />
              ) : null}

              {deliverable ? (
                <div className="editor-deliverable-fields">
                  <RichTextEditor
                    id="editor-instructions-field"
                    label="Instrucciones para el estudiante"
                    onChange={(instructions) => setForm({ ...form, instructions })}
                    placeholder="Instrucciones claras sobre qué debe resolver y adjuntar el estudiante…"
                    required
                    value={form.instructions}
                  />

                  <Input
                    hint="Los estudiantes verán la fecha límite en su zona horaria local (Chile)."
                    id="editor-due-field"
                    label="Fecha y hora de entrega"
                    onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                    required
                    type="datetime-local"
                    value={form.dueAt}
                  />
                </div>
              ) : null}

              {form.type === 'ANNOUNCEMENT' ? (
                <RichTextEditor
                  id="editor-body-field"
                  label="Mensaje del anuncio"
                  onChange={(body) => setForm({ ...form, body })}
                  placeholder="Escribe el comunicado para los estudiantes…"
                  required
                  value={form.body}
                />
              ) : null}
            </div>

            {/* Sidebar metadata / helpers */}
            <aside className="editor-side-helper">
              <Card className="editor-help-card">
                <h3>Orientación para el docente</h3>
                <p>
                  {form.type === 'MATERIAL'
                    ? 'El material permite compartir explicaciones, lecturas y recursos descargables. No genera entregas ni calificaciones.'
                    : form.type === 'ASSIGNMENT'
                    ? 'La actividad solicita que los estudiantes suban archivos o respuestas antes del plazo configurado.'
                    : form.type === 'ASSESSMENT'
                    ? 'La evaluación en documento registra entregas con control de plazo estricto y auditoría inmutable de revisiones.'
                    : 'Los anuncios comunican avisos y orientaciones generales en la ruta del estudiante.'}
                </p>

                <div className="markdown-hints">
                  <strong>Formato rápido:</strong>
                  <ul>
                    <li><code>**negrita**</code> o Ctrl+B</li>
                    <li><code>*cursiva*</code> o Ctrl+I</li>
                    <li><code>### Título de sección</code></li>
                    <li><code>- Viñeta</code> o <code>1. Número</code></li>
                  </ul>
                </div>
              </Card>
            </aside>
          </div>
        ) : null}

        {/* 2. FILES TAB */}
        {activeTab === 'files' && item && item.type !== 'ANNOUNCEMENT' ? (
          <div className="editor-files-panel">
            <TeacherAttachmentManager api={api} item={item} />
          </div>
        ) : null}

        {/* 3. SETTINGS & PUBLICATION TAB */}
        {activeTab === 'settings' ? (
          <div className="editor-settings-panel">
            <Card className="settings-card">
              <div className="section-heading">
                <div>
                  <h3>Estado y publicación</h3>
                  <p>Controla la visibilidad de este contenido para los estudiantes.</p>
                </div>
                {isPublished ? (
                  <Badge tone="success">Publicado</Badge>
                ) : isScheduled ? (
                  <Badge tone="info">Programado</Badge>
                ) : (
                  <Badge tone="neutral">Borrador</Badge>
                )}
              </div>

              <div className="settings-options">
                {isPublished ? (
                  <div className="settings-published-box">
                    <p>
                      Este contenido está <strong>publicado y visible</strong> para los estudiantes del curso.
                    </p>
                    <Button
                      onClick={() => setUnpublishDialogOpen(true)}
                      size="sm"
                      variant="secondary"
                    >
                      Quitar publicación
                    </Button>
                  </div>
                ) : (
                  <div className="settings-schedule-box">
                    <p>
                      Puedes programar una fecha y hora futura para que el contenido se publique automáticamente.
                    </p>
                    <Input
                      id="editor-publish-at"
                      label="Publicar automáticamente el (opcional)"
                      min={learningInstantToDateTimeLocal(new Date().toISOString())}
                      onChange={(event) => setForm({ ...form, publishAt: event.target.value })}
                      type="datetime-local"
                      value={form.publishAt}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : null}

        {/* 4. PREVIEW AS STUDENT TAB */}
        {activeTab === 'preview' ? (
          <div className="editor-preview-panel">
            <div className="preview-indicator-bar">
              <Badge tone="info"><Icon name="eye" />Vista previa como estudiante</Badge>
              <small>Esta es la apariencia exacta que experimentarán tus estudiantes al abrir este contenido.</small>
            </div>

            <div className="assignment-layout">
              <article className="assignment-content">
                <div className="assignment-title">
                  <Badge tone="success"><Icon name="check" />Publicado</Badge>
                  <h1>{form.title || 'Título del contenido'}</h1>
                  <p>{form.description || 'Descripción del contenido publicado para tu curso.'}</p>
                  <div className="item-context">
                    <span>{subjectName(subject)}</span>
                    <span>{courseName(subject)}</span>
                    <span>
                      {form.type === 'ASSESSMENT'
                        ? 'Evaluación en documento'
                        : form.type === 'ASSIGNMENT'
                        ? 'Actividad'
                        : form.type === 'MATERIAL'
                        ? 'Material'
                        : 'Anuncio'}
                    </span>
                    {form.dueAt ? <span>Vence {formatInstant(learningDateTimeLocalToInstant(form.dueAt) ?? '')}</span> : null}
                  </div>
                </div>

                {form.instructions ? (
                  <section>
                    <h2>Instrucciones</h2>
                    <div className="learning-rich-text">
                      <MarkdownRenderer content={form.instructions} />
                    </div>
                  </section>
                ) : null}

                {form.content ? (
                  <section>
                    <h2>Contenido</h2>
                    <div className="learning-rich-text">
                      <MarkdownRenderer content={form.content} />
                    </div>
                  </section>
                ) : null}

                {form.body ? (
                  <section>
                    <h2>Mensaje</h2>
                    <div className="learning-rich-text">
                      <MarkdownRenderer content={form.body} />
                    </div>
                  </section>
                ) : null}

                {deliverable && form.dueAt ? (
                  <Alert title="Fecha de entrega" tone="warning">
                    {formatInstant(learningDateTimeLocalToInstant(form.dueAt) ?? '')}. La hora y la condición de atraso son calculadas automáticamente.
                  </Alert>
                ) : null}
              </article>

              <aside className="preview-side-note">
                <Card className="item-side-note">
                  <Icon name="layers" />
                  <h2>{deliverable ? 'Módulo de entregas' : 'Recurso informativo'}</h2>
                  <p>
                    {deliverable
                      ? 'Los estudiantes dispondrán de una zona de carga de archivos protegida para enviar sus trabajos.'
                      : 'Este recurso se consulta directamente sin requerir envíos por parte del alumno.'}
                  </p>
                </Card>
              </aside>
            </div>
          </div>
        ) : null}
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="teacher-editor-footer">
        <div className="editor-footer-left">
          <Button
            onClick={() => {
              if (isDirty && !window.confirm('Tienes cambios locales sin guardar. ¿Deseas descartarlos?')) {
                return;
              }
              onClose();
            }}
            type="button"
            variant="secondary"
          >
            Cerrar
          </Button>

          {isDirty ? (
            <Button
              onClick={() => {
                setForm(savedFormSnapshot);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Restablecer cambios
            </Button>
          ) : null}
        </div>

        <div className="editor-footer-right">
          <Button
            disabled={saving || publishing}
            loading={saving}
            onClick={() => void handleSaveDraft()}
            type="button"
            variant="secondary"
          >
            {isPublished ? 'Guardar borrador de trabajo' : 'Guardar borrador'}
          </Button>

          <Button
            disabled={saving || publishing}
            loading={publishing}
            onClick={() => void handlePublish(false)}
            type="button"
          >
            <Icon name="check" />
            {isPublished ? 'Publicar cambios' : form.publishAt ? 'Programar y guardar' : 'Publicar ahora'}
          </Button>
        </div>
      </footer>

      {/* History Drawer Modal */}
      {item && historyOpen ? (
        <ContentHistoryDrawer
          api={api}
          currentVersion={item.version}
          entityId={item.id}
          entityTitle={item.title}
          entityType="LEARNING_ITEM"
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            await loadDraft();
            onSaved();
          }}
          open={historyOpen}
        />
      ) : null}

      {/* Sensitive Confirmation Dialog */}
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
              onClick={async () => {
                setConfirming(true);
                try {
                  await confirmation.run();
                  setConfirmation(null);
                } catch (err) {
                  setError(err instanceof AcademicApiError ? err.message : 'No se pudo confirmar el cambio.');
                } finally {
                  setConfirming(false);
                }
              }}
              type="button"
            >
              Confirmar cambio
            </Button>
          </div>
        </Dialog>
      ) : null}

      {/* Unpublish Confirmation Dialog */}
      {unpublishDialogOpen ? (
        <Dialog
          description="Al retirar la publicación, los estudiantes dejarán de ver este contenido."
          onOpenChange={(open) => {
            if (!open && !unpublishing) setUnpublishDialogOpen(false);
          }}
          open
          title="Quitar publicación"
        >
          <div>
            <p>
              ¿Deseas despublicar <strong>{form.title}</strong>?
            </p>
            <p className="integration-note">
              <Icon name="layers" />
              El contenido volverá al estado de borrador. Las entregas y el historial de revisiones se conservan intactos.
            </p>
            <div className="showcase-dialog-actions">
              <Button disabled={unpublishing} onClick={() => setUnpublishDialogOpen(false)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button loading={unpublishing} onClick={() => void handleUnpublish()} type="button" variant="danger">
                Quitar publicación
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
