'use client';

import { Button, Input, Textarea } from '@edupay/ui';
import type { LearningUnitWithItems } from '@edupay/contracts';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Icon } from '@/components/icons';
import { learningInstantToDateTimeLocal } from '@/features/learning-datetime';
import type { UnitEditorFormValues } from './types';

export interface UnitEditorProps {
  initialUnit?: LearningUnitWithItems | null | undefined;
  saving?: boolean | undefined;
  onSave: (values: UnitEditorFormValues) => Promise<void> | void;
  onCancel: () => void;
}

export function UnitEditor({
  initialUnit,
  onCancel,
  onSave,
  saving = false,
}: UnitEditorProps) {
  const defaultValues: UnitEditorFormValues = {
    description: initialUnit?.description ?? '',
    endAt: learningInstantToDateTimeLocal(initialUnit?.endAt ?? null),
    id: initialUnit?.id,
    startAt: learningInstantToDateTimeLocal(initialUnit?.startAt ?? null),
    title: initialUnit?.title ?? '',
  };

  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<UnitEditorFormValues>({
    defaultValues,
  });

  // Browser tab/reload protection when dirty
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

  // Cancel with confirmation
  const handleCancelClick = useCallback(() => {
    if (isDirty) {
      const confirmDiscard = window.confirm(
        'Tienes cambios sin guardar en la unidad. ¿Estás seguro de que deseas salir sin guardar?',
      );
      if (!confirmDiscard) return;
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

  const onSubmit = async (values: UnitEditorFormValues) => {
    await onSave(values);
    reset(values);
  };

  return (
    <div
      className="course-editor-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancelClick();
      }}
    >
      <aside
        aria-label={initialUnit ? 'Editar unidad' : 'Nueva unidad'}
        aria-modal="true"
        className="course-editor-drawer"
        role="dialog"
      >
        <form
          aria-label={
            initialUnit
              ? 'Editar unidad de aprendizaje'
              : 'Nueva unidad de aprendizaje'
          }
          className="course-editor-drawer__form"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="course-editor-drawer__header">
            <div>
              <h3>{initialUnit ? 'Editar unidad' : 'Nueva unidad'}</h3>
              <p>
                Las unidades nuevas quedan en borrador hasta que las actives.
              </p>
            </div>
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

          <div className="course-editor-drawer__body">
            <div className="learning-editor-grid">
              <div>
                <Input
                  id="unit-title"
                  label="Título"
                  maxLength={160}
                  {...register('title', {
                    maxLength: {
                      message: 'Máximo 160 caracteres',
                      value: 160,
                    },
                    required: 'El título de la unidad es obligatorio',
                  })}
                />
                {errors.title ? (
                  <span className="form-error-message" role="alert">
                    {errors.title.message}
                  </span>
                ) : null}
              </div>

              <Textarea
                id="unit-description"
                label="Descripción (opcional)"
                {...register('description')}
              />

              <Input
                id="unit-start"
                label="Disponible desde (opcional)"
                type="datetime-local"
                {...register('startAt')}
              />

              <Input
                id="unit-end"
                label="Disponible hasta (opcional)"
                type="datetime-local"
                {...register('endAt')}
              />
            </div>
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
              {initialUnit ? 'Guardar unidad' : 'Crear unidad'}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
