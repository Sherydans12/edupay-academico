'use client';

import { Alert, Badge, Button, Card, Dialog, Input, Tabs } from '@edupay/ui';
import type {
  CourseSubject,
  LearningItem,
  LearningUnitWithItems,
} from '@edupay/contracts';
import Link from 'next/link';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { bodyDocumentToLegacyText } from '@/components/body-document';
import { ContentHistoryDrawer } from '@/components/content-history-drawer';
import { Icon } from '@/components/icons';
import { TeacherAttachmentDialog } from '@/components/teacher-attachment-manager';
import { TeacherContentEditor } from '@/components/teacher-content-editor';
import { TeacherSubmissionQueue } from '@/components/teacher-submission-workflow';
import {
  courseName,
  isSensitiveConfirmationError,
  subjectName,
} from '@/features/learning-screen-support';
import {
  learningDateTimeLocalToInstant,
  learningInstantToDateTimeLocal,
} from '@/features/learning-datetime';
import {
  courseBuilderReducer,
  initialCourseBuilderState,
} from './course-builder-reducer';
import { CourseOutline } from './course-outline';
import { ItemEditor } from './item-editor';
import { MoveItemDialog } from './move-item-dialog';
import { UnitEditor } from './unit-editor';
import type { ItemEditorFormValues, UnitEditorFormValues } from './types';

function newClientUUID(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface CourseBuilderProps {
  api: AcademicApiClient;
  subject: CourseSubject;
  initialUnits: LearningUnitWithItems[];
  onRefreshRoute?: () => Promise<void>;
}

export function CourseBuilder({
  api,
  initialUnits,
  onRefreshRoute,
  subject,
}: CourseBuilderProps) {
  const [state, dispatch] = useReducer(
    courseBuilderReducer,
    initialUnits,
    (units) => ({
      ...initialCourseBuilderState,
      units,
    }),
  );

  // Synchronize incoming units from route loader if they update
  useEffect(() => {
    dispatch({ type: 'SET_ROUTE', units: initialUnits });
  }, [initialUnits]);

  // Editor and dialog states
  const [activeUnitEditor, setActiveUnitEditor] = useState<{
    unit: LearningUnitWithItems | null;
  } | null>(null);

  const [activeItemEditor, setActiveItemEditor] = useState<{
    unitId: string;
    item: LearningItem | null;
  } | null>(null);

  const [scheduleDraft, setScheduleDraft] = useState<{
    itemId: string;
    value: string;
  } | null>(null);

  const scheduledItem = useMemo(() => {
    if (!scheduleDraft) return null;
    for (const u of state.units) {
      const it = u.items.find((item) => item.id === scheduleDraft.itemId);
      if (it) return it;
    }
    return null;
  }, [scheduleDraft, state.units]);

  const [fullscreenEditorItem, setFullscreenEditorItem] = useState<{
    item: LearningItem | null;
    unit: LearningUnitWithItems;
  } | null>(null);

  const [attachmentItem, setAttachmentItem] = useState<LearningItem | null>(
    null,
  );

  const [historyEntity, setHistoryEntity] = useState<{
    type: 'LEARNING_UNIT' | 'LEARNING_ITEM';
    id: string;
    title: string;
    version: number;
  } | null>(null);

  const [moveItemData, setMoveItemData] = useState<{
    item: LearningItem;
    currentUnit: LearningUnitWithItems;
  } | null>(null);

  const [movingItem, setMovingItem] = useState(false);

  // Status and Confirmation
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionStatus, setActionStatus] = useState('');
  const [confirmation, setConfirmation] = useState<{
    body: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Concurrency conflict handler (409 STALE_REVISION)
  const handleConcurrencyError = useCallback(
    async (commandId: string, error: unknown) => {
      if (isSensitiveConfirmationError(error)) {
        return false;
      }

      const isStaleRevision =
        (error instanceof AcademicApiError &&
          (error.code === 'STALE_REVISION' ||
            (error.status === 409 &&
              error.code !== 'CONFIRMATION_REQUIRED'))) ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code: string }).code === 'STALE_REVISION');

      if (isStaleRevision) {
        // Rollback optimistic state immediately
        dispatch({ commandId, type: 'ROLLBACK_COMMAND' });
        // Announce conflict notification non-blockingly
        dispatch({
          message:
            'La estructura fue modificada por otro usuario. Se ha recargado la última versión.',
          type: 'SET_CONFLICT',
        });
        // Silent background refetch
        if (onRefreshRoute) {
          try {
            await onRefreshRoute();
          } catch {
            // Ignore background refetch error
          }
        }
        return true;
      }
      return false;
    },
    [onRefreshRoute],
  );

  // Generic runner for commands with error capture & confirmation handling
  const runCommand = useCallback(
    async (
      commandId: string,
      action: () => Promise<void>,
      successMsg = 'Cambios guardados.',
      confirmedAction = action,
    ) => {
      setSaving(true);
      setFormError('');
      setActionStatus('');
      try {
        await action();
        dispatch({ commandId, type: 'CONFIRM_COMMAND' });
        setActionStatus(successMsg);
      } catch (err) {
        const handled409 = await handleConcurrencyError(commandId, err);
        if (!handled409) {
          if (isSensitiveConfirmationError(err)) {
            setConfirmation({
              body:
                err instanceof Error
                  ? err.message
                  : 'Este cambio puede afectar contenido publicado o evidencia histórica.',
              run: confirmedAction,
            });
          } else {
            dispatch({ commandId, type: 'ROLLBACK_COMMAND' });
            setFormError(
              err instanceof AcademicApiError
                ? err.message
                : 'No pudimos completar la acción.',
            );
          }
        }
      } finally {
        setSaving(false);
      }
    },
    [handleConcurrencyError],
  );

  // --- UNIT OPERATIONS ---

  const handleSaveUnit = async (values: UnitEditorFormValues) => {
    const commandId = newClientUUID();
    if (values.id) {
      // Edit existing unit
      dispatch({
        commandId,
        type: 'OPTIMISTIC_UPDATE_UNIT',
        unitId: values.id,
        updates: {
          description: values.description || null,
          endAt: learningDateTimeLocalToInstant(values.endAt) ?? null,
          startAt: learningDateTimeLocalToInstant(values.startAt) ?? null,
          title: values.title.trim(),
        },
      });
      await runCommand(
        commandId,
        async () => {
          await api.updateLearningUnit(
            values.id!,
            {
              description: values.description || null,
              endAt: learningDateTimeLocalToInstant(values.endAt) ?? null,
              startAt: learningDateTimeLocalToInstant(values.startAt) ?? null,
              title: values.title.trim(),
            },
            { idempotencyKey: commandId },
          );
          if (onRefreshRoute) await onRefreshRoute();
        },
        'Unidad actualizada.',
      );
    } else {
      // Create new unit
      await runCommand(
        commandId,
        async () => {
          await api.createLearningUnit(
            {
              courseSubjectId: subject.id,
              description: values.description || undefined,
              endAt: learningDateTimeLocalToInstant(values.endAt),
              sortOrder: state.units.length,
              startAt: learningDateTimeLocalToInstant(values.startAt),
              title: values.title.trim(),
            },
            { idempotencyKey: commandId },
          );
          if (onRefreshRoute) await onRefreshRoute();
        },
        'Unidad creada.',
      );
    }
    setActiveUnitEditor(null);
  };

  const handleMoveUnit = async (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= state.units.length) return;

    const commandId = newClientUUID();
    const orderedIds = [...state.units.map((u) => u.id)];
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    dispatch({
      commandId,
      orderedIds,
      type: 'OPTIMISTIC_REORDER_UNITS',
    });

    await runCommand(
      commandId,
      async () => {
        await api.reorderLearningUnits(
          subject.id,
          { orderedIds },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      },
      direction === -1
        ? 'Unidad movida hacia arriba.'
        : 'Unidad movida hacia abajo.',
    );
  };

  const handleActivateUnit = async (unit: LearningUnitWithItems) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      type: 'OPTIMISTIC_ACTIVATE_UNIT',
      unitId: unit.id,
    });
    await runCommand(
      commandId,
      async () => {
        await api.updateLearningUnit(
          unit.id,
          { status: 'ACTIVE' },
          { idempotencyKey: commandId },
        );
      },
      'Unidad activada.',
    );
  };

  const handleArchiveUnit = async (unit: LearningUnitWithItems) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      type: 'OPTIMISTIC_ARCHIVE_UNIT',
      unitId: unit.id,
    });
    await runCommand(
      commandId,
      async () => {
        await api.archiveLearningUnit(unit.id, {
          idempotencyKey: commandId,
        });
      },
      'Unidad archivada.',
    );
  };

  const handleRestoreUnit = async (unit: LearningUnitWithItems) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      type: 'OPTIMISTIC_RESTORE_UNIT',
      unitId: unit.id,
    });
    await runCommand(
      commandId,
      async () => {
        await api.restoreLearningUnit(unit.id, {
          idempotencyKey: commandId,
        });
      },
      'Unidad restaurada como borrador.',
    );
  };

  const handleDuplicateUnit = async (unit: LearningUnitWithItems) => {
    const commandId = newClientUUID();
    await runCommand(
      commandId,
      async () => {
        await api.duplicateLearningUnit(
          unit.id,
          {
            duplicateItems: true,
            title: `${unit.title} (Copia)`,
          },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      },
      'Unidad duplicada.',
    );
  };

  // --- ITEM OPERATIONS ---

  const handleSaveItem = async (values: ItemEditorFormValues) => {
    const draftUnitId = activeItemEditor?.unitId;
    if (!draftUnitId) return;

    const commandId = newClientUUID();
    const deliverable =
      values.type === 'ASSIGNMENT' || values.type === 'ASSESSMENT';

    const inputData = {
      body:
        values.type === 'ANNOUNCEMENT'
          ? bodyDocumentToLegacyText(values.bodyDocument) || undefined
          : undefined,
      content:
        values.type === 'MATERIAL'
          ? bodyDocumentToLegacyText(values.bodyDocument) || undefined
          : undefined,
      description: values.description || undefined,
      dueAt: deliverable
        ? learningDateTimeLocalToInstant(values.dueAt)
        : undefined,
      instructions: deliverable
        ? bodyDocumentToLegacyText(values.bodyDocument) || undefined
        : undefined,
      bodyDocument: values.bodyDocument,
      title: values.title.trim(),
      type: values.type,
    };

    if (values.id) {
      // Optimistic update
      dispatch({
        commandId,
        itemId: values.id,
        type: 'OPTIMISTIC_UPDATE_ITEM',
        updates: {
          body: inputData.body ?? null,
          content: inputData.content ?? null,
          description: inputData.description ?? null,
          dueAt: inputData.dueAt ?? null,
          instructions: inputData.instructions ?? null,
          bodyDocument: values.bodyDocument,
          title: inputData.title,
          type: inputData.type,
        },
      });

      const executeUpdate = async (confirmSensitiveChange: boolean) => {
        await api.updateLearningItem(
          values.id!,
          {
            ...inputData,
            confirmSensitiveChange,
            expectedRevision: activeItemEditor.item?.version,
          },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      };

      await runCommand(
        commandId,
        () => executeUpdate(false),
        'Contenido guardado.',
        () => executeUpdate(true),
      );
    } else {
      // Create new item
      const executeCreate = async () => {
        await api.createLearningItem(
          draftUnitId,
          {
            ...inputData,
            dueAt: inputData.dueAt ?? undefined,
            sortOrder: 0,
          },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      };

      await runCommand(commandId, executeCreate, 'Contenido creado.');
    }

    setActiveItemEditor(null);
  };

  const handleMoveItemInUnit = async (
    unit: LearningUnitWithItems,
    item: LearningItem,
    index: number,
    direction: -1 | 1,
  ) => {
    const next = index + direction;
    if (next < 0 || next >= unit.items.length) return;

    const commandId = newClientUUID();
    const orderedIds = unit.items.map((i) => i.id);
    const current = orderedIds[index];
    orderedIds[index] = orderedIds[next] ?? orderedIds[index] ?? '';
    orderedIds[next] = current ?? '';

    dispatch({
      commandId,
      orderedIds,
      type: 'OPTIMISTIC_REORDER_ITEMS',
      unitId: unit.id,
    });

    await runCommand(
      commandId,
      async () => {
        await api.reorderLearningItems(
          unit.id,
          {
            orderedIds,
          },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      },
      direction === -1
        ? 'Contenido movido hacia arriba.'
        : 'Contenido movido hacia abajo.',
    );
  };

  const handleExecuteMoveItemToUnit = async ({
    item,
    sourceUnit,
    targetUnit,
    targetUnitId,
  }: {
    item: LearningItem;
    sourceUnit: LearningUnitWithItems;
    targetUnitId: string;
    targetUnit: LearningUnitWithItems;
  }) => {
    setMovingItem(true);
    const commandId = newClientUUID();

    dispatch({
      commandId,
      itemId: item.id,
      sourceUnitId: sourceUnit.id,
      targetUnitId,
      type: 'OPTIMISTIC_MOVE_ITEM',
    });

    try {
      await api.moveLearningItem(
        item.id,
        {
          expectedRevision: item.version,
          sourceOrderRevision: sourceUnit.version,
          targetLearningUnitId: targetUnitId,
          targetOrderRevision: targetUnit.version,
        },
        { idempotencyKey: commandId },
      );
      dispatch({ commandId, type: 'CONFIRM_COMMAND' });
      setActionStatus('Contenido movido a la unidad seleccionada.');
      setMoveItemData(null);
      if (onRefreshRoute) await onRefreshRoute();
    } catch (err) {
      const handled409 = await handleConcurrencyError(commandId, err);
      if (!handled409) {
        dispatch({ commandId, type: 'ROLLBACK_COMMAND' });
        setFormError(
          err instanceof AcademicApiError
            ? err.message
            : 'No se pudo mover el contenido.',
        );
      }
    } finally {
      setMovingItem(false);
    }
  };

  const handlePublishItem = async (item: LearningItem) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      itemId: item.id,
      type: 'OPTIMISTIC_UPDATE_ITEM',
      updates: { publicationStatus: 'PUBLISHED' },
    });
    await runCommand(
      commandId,
      async () => {
        await api.publishLearningItem(item.id, {
          idempotencyKey: commandId,
        });
        if (onRefreshRoute) await onRefreshRoute();
      },
      'Contenido publicado.',
    );
  };

  const handleSaveSchedule = async (item: LearningItem, dateStr: string) => {
    const value = learningDateTimeLocalToInstant(dateStr);
    if (!value) {
      setFormError('Selecciona una fecha futura para programar.');
      return;
    }
    const commandId = newClientUUID();
    dispatch({
      commandId,
      itemId: item.id,
      type: 'OPTIMISTIC_UPDATE_ITEM',
      updates: {
        publishAt: value,
        publicationStatus: 'SCHEDULED',
      },
    });

    const execute = async (confirmSensitiveChange: boolean) => {
      await api.scheduleLearningItem(
        item.id,
        {
          confirmSensitiveChange,
          expectedRevision: item.version,
          publishAt: value,
        },
        { idempotencyKey: commandId },
      );
      setScheduleDraft(null);
      if (onRefreshRoute) await onRefreshRoute();
    };

    await runCommand(
      commandId,
      () => execute(false),
      'Publicación programada.',
      () => execute(true),
    );
  };

  const handleArchiveItem = async (item: LearningItem) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      itemId: item.id,
      type: 'OPTIMISTIC_ARCHIVE_ITEM',
    });
    await runCommand(
      commandId,
      async () => {
        await api.archiveLearningItem(item.id, {
          idempotencyKey: commandId,
        });
        if (onRefreshRoute) await onRefreshRoute();
      },
      'Contenido archivado.',
    );
  };

  const handleRestoreItem = async (item: LearningItem) => {
    const commandId = newClientUUID();
    dispatch({
      commandId,
      itemId: item.id,
      type: 'OPTIMISTIC_RESTORE_ITEM',
    });
    await runCommand(
      commandId,
      async () => {
        await api.restoreLearningItem(item.id, {
          idempotencyKey: commandId,
        });
        if (onRefreshRoute) await onRefreshRoute();
      },
      'Contenido restaurado como borrador.',
    );
  };

  const handleDuplicateItem = async (item: LearningItem) => {
    const commandId = newClientUUID();
    await runCommand(
      commandId,
      async () => {
        await api.duplicateLearningItem(
          item.id,
          { title: `${item.title} (Copia)` },
          { idempotencyKey: commandId },
        );
        if (onRefreshRoute) await onRefreshRoute();
      },
      'Contenido duplicado.',
    );
  };

  const handleConfirmSensitive = async () => {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.run();
      setConfirmation(null);
      setActionStatus('Cambios guardados.');
      if (onRefreshRoute) await onRefreshRoute();
    } catch (err) {
      setFormError(
        err instanceof AcademicApiError
          ? err.message
          : 'No pudimos completar la confirmación.',
      );
    } finally {
      setConfirming(false);
    }
  };

  // Status pills count
  const counts = useMemo(() => {
    let drafts = 0;
    let scheduled = 0;
    let published = 0;
    for (const u of state.units) {
      for (const it of u.items) {
        if (it.publicationStatus === 'DRAFT') drafts++;
        else if (it.publicationStatus === 'SCHEDULED') scheduled++;
        else if (it.publicationStatus === 'PUBLISHED') published++;
      }
    }
    return { drafts, published, scheduled };
  }, [state.units]);

  return (
    <>
      {/* Breadcrumb Navigation */}
      <nav aria-label="Ruta de navegación" className="breadcrumbs">
        <Link href="/docente/asignaturas">Asignaturas</Link>
        <Icon name="chevron-right" />
        <span>
          {subjectName(subject)} · {courseName(subject)}
        </span>
      </nav>

      {/* Authoring Workspace Header */}
      <section className="teacher-subject-header">
        <div className="teacher-subject-header__title-area">
          <div className="subject-hero__mark">
            {subjectName(subject).slice(0, 3).toUpperCase()}
          </div>
          <div>
            <h1>{subjectName(subject)}</h1>
            <p>{courseName(subject)} · Espacio de autoría docente</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-status-pills">
            <Badge tone="neutral">Borradores: {counts.drafts}</Badge>
            <Badge tone="info">Programados: {counts.scheduled}</Badge>
            <Badge tone="success">Publicados: {counts.published}</Badge>
          </div>

          <Button
            onClick={() => setActiveUnitEditor({ unit: null })}
            variant="secondary"
          >
            <Icon name="plus" />
            Nueva unidad
          </Button>

          <Link
            className="button-link button-link--primary"
            href={`/docente/asignaturas/${subject.id}/estudiantes`}
          >
            <Icon name="people" />
            Ver estudiantes
          </Link>
        </div>
      </section>

      {/* Conflict Notice Announcement (Non-blocking banner) */}
      {state.conflictNotice ? (
        <Alert
          action={
            <Button
              onClick={() => dispatch({ type: 'CLEAR_CONFLICT' })}
              size="sm"
              variant="secondary"
            >
              Entendido
            </Button>
          }
          title="Conflicto de concurrencia detectado"
          tone="warning"
        >
          <div aria-live="polite" role="status">
            {state.conflictNotice}
          </div>
        </Alert>
      ) : null}

      {/* General form error */}
      {formError ? (
        <Alert title="No se pudo completar la acción" tone="error">
          {formError}
        </Alert>
      ) : null}

      {/* Polite action status */}
      {actionStatus ? (
        <p aria-live="polite" className="teacher-action-status" role="status">
          {actionStatus}
        </p>
      ) : null}

      {/* Inline Unit Form */}
      {activeUnitEditor ? (
        <UnitEditor
          initialUnit={activeUnitEditor.unit}
          onCancel={() => setActiveUnitEditor(null)}
          onSave={handleSaveUnit}
          saving={saving}
        />
      ) : null}

      {/* Slide-over Item Form */}
      {activeItemEditor ? (
        <ItemEditor
          api={api}
          expectedItemVersion={activeItemEditor.item?.version}
          initialItem={activeItemEditor.item}
          onCancel={() => setActiveItemEditor(null)}
          onOpenAdvancedEditor={() => {
            const targetUnit =
              state.units.find((u) => u.id === activeItemEditor.unitId) ??
              state.units[0];
            if (targetUnit) {
              const it = activeItemEditor.item;
              setActiveItemEditor(null);
              setFullscreenEditorItem({ item: it, unit: targetUnit });
            }
          }}
          onSave={handleSaveItem}
          saving={saving}
          unitId={activeItemEditor.unitId}
        />
      ) : null}

      {/* Main Tabs: Content / Submissions / Collaboration */}
      <Tabs
        items={[
          {
            content: (
              <div className="authoring-workspace-body">
                <div className="authoring-toolbar">
                  <div>
                    <h2>Ruta de aprendizaje</h2>
                    <p>
                      Organiza unidades, materiales, actividades, evaluaciones y
                      anuncios de esta asignatura.
                    </p>
                  </div>
                  <Badge tone="info">Vista docente</Badge>
                </div>

                {/* Extracted CourseOutline Component */}
                <CourseOutline
                  onActivateUnit={handleActivateUnit}
                  onAddItem={(unit) =>
                    setActiveItemEditor({ item: null, unitId: unit.id })
                  }
                  onArchiveItem={handleArchiveItem}
                  onArchiveUnit={handleArchiveUnit}
                  onCancelSchedule={() => setScheduleDraft(null)}
                  onChangeScheduleDraftValue={(value) => {
                    if (scheduleDraft) {
                      setScheduleDraft({ ...scheduleDraft, value });
                    }
                  }}
                  onDuplicateItem={handleDuplicateItem}
                  onDuplicateUnit={handleDuplicateUnit}
                  onEditItem={(unit, it) =>
                    setActiveItemEditor({ item: it, unitId: unit.id })
                  }
                  onEditUnit={(unit) => setActiveUnitEditor({ unit })}
                  onManageAttachments={(it) => setAttachmentItem(it)}
                  onMoveItemDown={(unit, it, idx) =>
                    void handleMoveItemInUnit(unit, it, idx, 1)
                  }
                  onMoveItemToUnit={(unit, it) =>
                    setMoveItemData({ currentUnit: unit, item: it })
                  }
                  onMoveItemUp={(unit, it, idx) =>
                    void handleMoveItemInUnit(unit, it, idx, -1)
                  }
                  onMoveUnitDown={(idx) => void handleMoveUnit(idx, 1)}
                  onMoveUnitUp={(idx) => void handleMoveUnit(idx, -1)}
                  onOpenAdvancedEditor={(unit, it) =>
                    setFullscreenEditorItem({ item: it, unit })
                  }
                  onOpenItemHistory={(it) =>
                    setHistoryEntity({
                      id: it.id,
                      title: it.title,
                      type: 'LEARNING_ITEM',
                      version: it.version,
                    })
                  }
                  onOpenUnitHistory={(unit) =>
                    setHistoryEntity({
                      id: unit.id,
                      title: unit.title,
                      type: 'LEARNING_UNIT',
                      version: unit.version,
                    })
                  }
                  onPublishItem={handlePublishItem}
                  onRestoreItem={handleRestoreItem}
                  onRestoreUnit={handleRestoreUnit}
                  onSaveSchedule={handleSaveSchedule}
                  onScheduleItemClick={(it) =>
                    setScheduleDraft({
                      itemId: it.id,
                      value: it.publishAt ?? '',
                    })
                  }
                  saving={saving}
                  scheduleDraft={scheduleDraft}
                  units={state.units}
                />

                {/* Attachments Dialog */}
                {attachmentItem ? (
                  <TeacherAttachmentDialog
                    api={api}
                    item={attachmentItem}
                    onChanged={() => {
                      if (onRefreshRoute) void onRefreshRoute();
                    }}
                    onClose={() => setAttachmentItem(null)}
                  />
                ) : null}
              </div>
            ),
            id: 'content',
            label: 'Ruta y contenido',
          },
          {
            content: (
              <TeacherSubmissionQueue
                api={api}
                courseSubjectId={subject.id}
                items={state.units.flatMap((u) =>
                  u.items.filter(
                    (i) => i.type === 'ASSIGNMENT' || i.type === 'ASSESSMENT',
                  ),
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
                  <strong>Equipo docente</strong>
                  <small>
                    Los docentes asignados comparten este espacio de trabajo.
                  </small>
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
            api={api}
            item={fullscreenEditorItem.item}
            onClose={() => setFullscreenEditorItem(null)}
            onSaved={async () => {
              if (onRefreshRoute) await onRefreshRoute();
            }}
            subject={subject}
            unit={fullscreenEditorItem.unit}
          />
        </div>
      ) : null}

      {/* MOVE ITEM DIALOG */}
      {moveItemData ? (
        <MoveItemDialog
          currentUnit={moveItemData.currentUnit}
          item={moveItemData.item}
          moving={movingItem}
          onClose={() => setMoveItemData(null)}
          onMove={handleExecuteMoveItemToUnit}
          units={state.units}
        />
      ) : null}

      {/* HISTORY DRAWER */}
      {historyEntity ? (
        <ContentHistoryDrawer
          api={api}
          currentVersion={historyEntity.version}
          entityId={historyEntity.id}
          entityTitle={historyEntity.title}
          entityType={historyEntity.type}
          onClose={() => setHistoryEntity(null)}
          onRestored={async () => {
            if (onRefreshRoute) await onRefreshRoute();
          }}
          open
        />
      ) : null}

      {/* SCHEDULE ITEM DIALOG */}
      {scheduleDraft && scheduledItem ? (
        <Dialog
          description={`Contenido: ${scheduledItem.title}`}
          onOpenChange={(open) => {
            if (!open && !saving) setScheduleDraft(null);
          }}
          open
          title="Programar publicación"
        >
          <form
            aria-label="Programar publicación de contenido"
            className="schedule-editor-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveSchedule(scheduledItem, scheduleDraft.value);
            }}
          >
            <div className="learning-editor-grid">
              <Input
                hint="El contenido pasará automáticamente a estado 'Publicado' en la fecha y hora seleccionada."
                id={`schedule-modal-${scheduledItem.id}`}
                label="Fecha y hora de publicación"
                min={learningInstantToDateTimeLocal(new Date().toISOString())}
                onChange={(event) =>
                  setScheduleDraft({
                    ...scheduleDraft,
                    value: event.target.value,
                  })
                }
                required
                type="datetime-local"
                value={scheduleDraft.value}
              />
            </div>
            <div
              className="showcase-dialog-actions"
              style={{ marginTop: '1.25rem' }}
            >
              <Button
                disabled={saving}
                onClick={() => setScheduleDraft(null)}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button loading={saving} type="submit">
                Guardar programación
              </Button>
            </div>
          </form>
        </Dialog>
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
            <Button
              onClick={() => setConfirmation(null)}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              loading={confirming}
              onClick={() => void handleConfirmSensitive()}
              type="button"
            >
              Confirmar cambio
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
