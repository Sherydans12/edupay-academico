'use client';

import { Button, Dialog, Input, Select, Textarea } from '@edupay/ui';
import type { LearningItem } from '@edupay/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { AcademicApiClient } from '@/api/academic-client';
import {
  BlockBodyEditor,
  bodyDocumentToLegacyText,
  legacyTextToBodyDocument,
} from '@/components/body-document';
import { Icon } from '@/components/icons';
import { learningInstantToDateTimeLocal } from '@/features/learning-datetime';
import type { ItemEditorFormValues } from './types';

export interface ItemEditorProps {
  api?: AcademicApiClient | undefined;
  initialItem?: LearningItem | null | undefined;
  unitId: string;
  expectedItemVersion?: number | undefined;
  saving?: boolean | undefined;
  onSave: (
    values: ItemEditorFormValues,
  ) => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
  onOpenAdvancedEditor?: (() => void) | undefined;
}

export function ItemEditor({
  api,
  expectedItemVersion: _,
  initialItem,
  onCancel,
  onOpenAdvancedEditor,
  onSave,
  saving = false,
  unitId: __,
}: ItemEditorProps) {
  void _;
  void __;

  const defaultValues: ItemEditorFormValues = {
    body: initialItem?.body ?? '',
    bodyDocument:
      initialItem?.bodyDocument ??
      legacyTextToBodyDocument(
        initialItem?.type === 'ANNOUNCEMENT'
          ? initialItem.body
          : initialItem?.type === 'MATERIAL'
            ? initialItem.content
            : initialItem?.instructions,
      ),
    content: initialItem?.content ?? '',
    description: initialItem?.description ?? '',
    dueAt: learningInstantToDateTimeLocal(initialItem?.dueAt ?? null),
    id: initialItem?.id,
    instructions: initialItem?.instructions ?? '',
    title: initialItem?.title ?? '',
    type: initialItem?.type ?? 'MATERIAL',
  };
  const [bodyDocument, setBodyDocument] = useState(defaultValues.bodyDocument);

  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<ItemEditorFormValues>({
    defaultValues,
  });

  useEffect(() => {
    register('bodyDocument');
  }, [register]);

  const selectedType = watch('type');

  // Handle browser tab/page close prevention when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showAdvancedConfirm, setShowAdvancedConfirm] = useState(false);

  // Handle cancel with dirty check confirmation
  const handleCancelClick = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
      return;
    }
    onCancel();
  }, [isDirty, onCancel]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCancelClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCancelClick]);

  const onSubmit = async (values: ItemEditorFormValues) => {
    const legacyBody = bodyDocumentToLegacyText(bodyDocument);
    const requiresBody =
      values.type === 'ANNOUNCEMENT' ||
      values.type === 'ASSIGNMENT' ||
      values.type === 'ASSESSMENT';
    if (requiresBody && !legacyBody.trim()) {
      const field = values.type === 'ANNOUNCEMENT' ? 'body' : 'instructions';
      setError(field, {
        message:
          values.type === 'ANNOUNCEMENT'
            ? 'El mensaje del anuncio es obligatorio'
            : 'Las instrucciones son obligatorias para actividades y evaluaciones',
        type: 'required',
      });
      return;
    }
    const nextValues = {
      ...values,
      body: values.type === 'ANNOUNCEMENT' ? legacyBody : values.body,
      bodyDocument,
      content: values.type === 'MATERIAL' ? legacyBody : values.content,
      instructions:
        values.type === 'ASSIGNMENT' || values.type === 'ASSESSMENT'
          ? legacyBody
          : values.instructions,
    };
    if ((await onSave(nextValues)) !== false) reset(nextValues);
  };

  return (
    <div
      className="course-editor-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancelClick();
      }}
    >
      <aside
        aria-label={
          initialItem ? 'Editar contenido' : 'Nuevo contenido de aprendizaje'
        }
        aria-modal="true"
        className="course-editor-drawer"
        role="dialog"
      >
        <form
          aria-label={
            initialItem ? 'Editar contenido' : 'Nuevo contenido de aprendizaje'
          }
          className="course-editor-drawer__form"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="course-editor-drawer__header">
            <div className="course-editor-drawer__header-title">
              <div className="course-editor-drawer__header-icon">
                <Icon name={initialItem ? 'edit' : 'sparkles'} />
              </div>
              <div>
                <h3>{initialItem ? 'Editar contenido' : 'Nuevo contenido'}</h3>
                <p>Elige el tipo y completa sólo la información necesaria.</p>
              </div>
            </div>
            <div className="course-editor-drawer__header-actions">
              <Button
                aria-label="Cerrar panel de edición"
                onClick={handleCancelClick}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Icon name="close" />
              </Button>
            </div>
          </div>

          <div className="course-editor-drawer__body">
            {/* Visual Type Selector Cards */}
            <div className="item-type-selector-group">
              <span className="item-type-selector-label">
                Tipo de contenido
              </span>
              <div className="item-type-cards-grid">
                {[
                  {
                    description: 'Lecturas, guías y recursos de consulta',
                    icon: 'book-open' as const,
                    label: 'Material',
                    type: 'MATERIAL' as const,
                  },
                  {
                    description: 'Tareas y actividades con entrega del alumno',
                    icon: 'clipboard' as const,
                    label: 'Actividad',
                    type: 'ASSIGNMENT' as const,
                  },
                  {
                    description: 'Evaluaciones y rúbricas formales',
                    icon: 'document' as const,
                    label: 'Evaluación',
                    type: 'ASSESSMENT' as const,
                  },
                  {
                    description: 'Avisos, recordatorios y comunicados',
                    icon: 'message' as const,
                    label: 'Anuncio',
                    type: 'ANNOUNCEMENT' as const,
                  },
                ].map((t) => (
                  <button
                    className={`item-type-card ${selectedType === t.type ? 'item-type-card--active' : ''} item-type-card--${t.type.toLowerCase()}`}
                    key={t.type}
                    onClick={() =>
                      setValue('type', t.type, { shouldDirty: true })
                    }
                    type="button"
                  >
                    <div className="item-type-card__icon">
                      <Icon name={t.icon} />
                    </div>
                    <div className="item-type-card__text">
                      <strong>{t.label}</strong>
                      <small>{t.description}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="learning-editor-grid">
              <div className="sr-only">
                <Select
                  id="item-type"
                  label="Tipo"
                  {...register('type', { required: 'El tipo es obligatorio' })}
                >
                  <option value="MATERIAL">Material</option>
                  <option value="ASSIGNMENT">Actividad</option>
                  <option value="ASSESSMENT">Evaluación en documento</option>
                  <option value="ANNOUNCEMENT">Anuncio</option>
                </Select>
              </div>

              <div>
                <Input
                  id="item-title"
                  label="Título"
                  maxLength={160}
                  {...register('title', {
                    maxLength: {
                      message: 'Máximo 160 caracteres',
                      value: 160,
                    },
                    required: 'El título es obligatorio',
                  })}
                />
                {errors.title ? (
                  <span className="form-error-message" role="alert">
                    {errors.title.message}
                  </span>
                ) : null}
              </div>

              <Textarea
                id="item-description"
                label="Descripción (opcional)"
                {...register('description')}
              />

              <BlockBodyEditor
                api={api}
                id="item-body-document"
                label={
                  selectedType === 'ANNOUNCEMENT'
                    ? 'Mensaje'
                    : selectedType === 'MATERIAL'
                      ? 'Contenido'
                      : 'Instrucciones'
                }
                legacyText={
                  selectedType === 'ANNOUNCEMENT'
                    ? initialItem?.body
                    : selectedType === 'MATERIAL'
                      ? initialItem?.content
                      : initialItem?.instructions
                }
                learningItemId={initialItem?.id}
                onChange={(value) => {
                  setBodyDocument(value);
                  setValue('bodyDocument', value, { shouldDirty: true });
                }}
                value={bodyDocument}
              />

              {errors.body || errors.instructions ? (
                <span className="form-error-message" role="alert">
                  {errors.body?.message ?? errors.instructions?.message}
                </span>
              ) : null}

              {selectedType === 'ASSIGNMENT' ||
              selectedType === 'ASSESSMENT' ? (
                <>
                  <div>
                    <Input
                      id="item-due"
                      label="Fecha de entrega"
                      type="datetime-local"
                      {...register('dueAt', {
                        required:
                          selectedType === 'ASSIGNMENT' ||
                          selectedType === 'ASSESSMENT'
                            ? 'La fecha de entrega es obligatoria'
                            : false,
                      })}
                    />
                    {errors.dueAt ? (
                      <span className="form-error-message" role="alert">
                        {errors.dueAt.message}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {/* Prominent Advanced Editor Callout at bottom */}
            {initialItem && onOpenAdvancedEditor ? (
              <div className="drawer-advanced-callout">
                <div className="drawer-advanced-callout__icon">
                  <Icon name="layers" />
                </div>
                <div className="drawer-advanced-callout__text">
                  <strong>¿Necesitas opciones avanzadas?</strong>
                  <p>
                    Gestiona archivos adjuntos, programa fechas de publicación,
                    revisa el historial o accede a la vista previa de
                    estudiante.
                  </p>
                  <Button
                    onClick={() => {
                      if (isDirty) {
                        setShowAdvancedConfirm(true);
                        return;
                      }
                      onOpenAdvancedEditor?.();
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Icon name="edit" />
                    Abrir editor avanzado
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="course-editor-drawer__footer">
            <Button
              disabled={saving}
              onClick={handleCancelClick}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button loading={saving} type="submit">
              {initialItem ? 'Guardar contenido' : 'Crear contenido'}
            </Button>
          </div>
        </form>
      </aside>

      {/* Discard changes dialog */}
      {showDiscardDialog ? (
        <Dialog
          description="Tienes cambios sin guardar en el editor de contenido. Si sales ahora, se perderán todas las modificaciones recientes."
          onOpenChange={(open) => {
            if (!open) setShowDiscardDialog(false);
          }}
          open
          title="¿Descartar cambios no guardados?"
        >
          <div
            className="showcase-dialog-actions"
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '1.25rem',
            }}
          >
            <Button
              onClick={() => setShowDiscardDialog(false)}
              type="button"
              variant="secondary"
            >
              Continuar editando
            </Button>
            <Button
              onClick={() => {
                setShowDiscardDialog(false);
                onCancel();
              }}
              type="button"
              variant="danger"
            >
              Descartar cambios
            </Button>
          </div>
        </Dialog>
      ) : null}

      {/* Advanced editor dirty transition dialog */}
      {showAdvancedConfirm ? (
        <Dialog
          description="¿Deseas abrir el editor avanzado? Los cambios locales no guardados se transferirán al editor avanzado."
          onOpenChange={(open) => {
            if (!open) setShowAdvancedConfirm(false);
          }}
          open
          title="¿Abrir editor avanzado?"
        >
          <div
            className="showcase-dialog-actions"
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '1.25rem',
            }}
          >
            <Button
              onClick={() => setShowAdvancedConfirm(false)}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowAdvancedConfirm(false);
                onOpenAdvancedEditor?.();
              }}
              type="button"
              variant="primary"
            >
              Abrir editor avanzado
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
