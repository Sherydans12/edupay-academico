'use client';

import { Badge, Button } from '@edupay/ui';
import type { LearningItem } from '@edupay/contracts';
import React, { memo, useRef } from 'react';

import { Icon } from '@/components/icons';
import { formatInstant } from '@/features/learning-screen-support';
import { ItemActionsMenu } from './item-actions-menu';

export interface ItemRowProps {
  item: LearningItem;
  itemIndex: number;
  totalItems: number;
  unitId: string;
  expectedItemVersion: number;
  saving?: boolean;
  onMoveUp: (item: LearningItem, index: number) => void;
  onMoveDown: (item: LearningItem, index: number) => void;
  onEdit: (item: LearningItem) => void;
  onManageAttachments: (item: LearningItem) => void;
  onPublish: (item: LearningItem) => void;
  onSchedule: (item: LearningItem) => void;
  onArchive: (item: LearningItem) => void;
  onRestore: (item: LearningItem) => void;
  onDuplicate: (item: LearningItem) => void;
  onMoveToUnit: (item: LearningItem) => void;
  onOpenAdvancedEditor: (item: LearningItem) => void;
  onOpenHistory: (item: LearningItem) => void;
  onDelete?: ((item: LearningItem) => void) | undefined;
}

export const ItemRow = memo(function ItemRow({
  expectedItemVersion: _,
  item,
  itemIndex,
  onArchive,
  onDelete,
  onDuplicate,
  onEdit,
  onManageAttachments,
  onMoveDown,
  onMoveToUnit,
  onMoveUp,
  onOpenAdvancedEditor,
  onOpenHistory,
  onPublish,
  onRestore,
  onSchedule,
  saving = false,
  totalItems,
  unitId: __,
}: ItemRowProps) {
  void _;
  void __;

  const moveUpRef = useRef<HTMLButtonElement>(null);
  const moveDownRef = useRef<HTMLButtonElement>(null);

  const deliverable = item.type === 'ASSIGNMENT' || item.type === 'ASSESSMENT';
  const attachmentSupported = item.type !== 'ANNOUNCEMENT';

  const handleMoveUp = () => {
    onMoveUp(item, itemIndex);
    window.requestAnimationFrame(() => {
      moveUpRef.current?.focus();
    });
  };

  const handleMoveDown = () => {
    onMoveDown(item, itemIndex);
    window.requestAnimationFrame(() => {
      moveDownRef.current?.focus();
    });
  };

  return (
    <div
      aria-label={`Contenido: ${item.title}`}
      className="learning-item teacher-learning-item"
      data-item-id={item.id}
      data-version={item.version}
    >
      <span
        className={`learning-item__icon learning-item__icon--${item.type.toLowerCase()}`}
      >
        <Icon
          name={
            item.type === 'ASSESSMENT'
              ? 'document'
              : item.type === 'ASSIGNMENT'
                ? 'clipboard'
                : item.type === 'MATERIAL'
                  ? 'book-open'
                  : 'message'
          }
        />
      </span>

      <div className="learning-item__copy">
        <small
          className={`learning-item__type-chip learning-item__type-chip--${item.type.toLowerCase()}`}
        >
          {item.type === 'ASSESSMENT'
            ? 'Evaluación en documento'
            : item.type === 'ASSIGNMENT'
              ? 'Actividad'
              : item.type === 'MATERIAL'
                ? 'Material'
                : 'Anuncio'}
        </small>
        <strong>{item.title}</strong>
        <span>
          {item.description ||
            item.instructions ||
            item.content ||
            item.body ||
            'Sin descripción'}
        </span>
      </div>

      <div className="learning-item__meta">
        <Badge
          icon={
            <Icon
              name={
                item.publicationStatus === 'PUBLISHED'
                  ? 'check-circle'
                  : item.publicationStatus === 'SCHEDULED'
                    ? 'clock'
                    : item.publicationStatus === 'ARCHIVED'
                      ? 'archive'
                      : 'edit'
              }
            />
          }
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
              : item.publicationStatus === 'ARCHIVED'
                ? 'Archivado'
                : 'Borrador'}
        </Badge>

        {deliverable && item.dueAt ? (
          <small className="learning-item__due-badge">
            <Icon name="clock" />
            Vence {formatInstant(item.dueAt)}
          </small>
        ) : null}

        {item.publicationStatus === 'SCHEDULED' && item.publishAt ? (
          <small className="learning-item__schedule-badge">
            <Icon name="calendar" />
            Publica el {formatInstant(item.publishAt)}
          </small>
        ) : null}
      </div>

      <div className="learning-item__actions">
        <div className="learning-item__reorder-group">
          {/* Reordering Accessibility Buttons */}
          <Button
            aria-label={`Mover ${item.title} hacia arriba`}
            disabled={itemIndex === 0 || saving}
            onClick={handleMoveUp}
            size="icon"
            title="Mover hacia arriba"
            variant="ghost"
          >
            <Icon name="arrow-up" />
          </Button>
          <Button
            aria-label={`Mover ${item.title} hacia abajo`}
            disabled={itemIndex === totalItems - 1 || saving}
            onClick={handleMoveDown}
            size="icon"
            title="Mover hacia abajo"
            variant="ghost"
          >
            <Icon name="arrow-down" />
          </Button>
        </div>

        <div className="learning-item__primary-actions">
          {item.publicationStatus === 'ARCHIVED' ? (
            <Button
              aria-label={`Restaurar ${item.title} como borrador`}
              onClick={() => onRestore(item)}
              size="sm"
              variant="secondary"
            >
              <Icon name="history" />
              Restaurar
            </Button>
          ) : (
            <Button
              aria-label={`Editar ${item.title}`}
              onClick={() => onEdit(item)}
              size="sm"
              variant="secondary"
            >
              <Icon name="edit" />
              Editar
            </Button>
          )}

          {item.publicationStatus === 'DRAFT' ? (
            <Button onClick={() => onPublish(item)} size="sm">
              <Icon name="sparkles" />
              Publicar
            </Button>
          ) : null}

          <ItemActionsMenu
            attachmentSupported={attachmentSupported}
            item={item}
            onArchive={onArchive}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onManageAttachments={onManageAttachments}
            onMoveToUnit={onMoveToUnit}
            onOpenAdvancedEditor={onOpenAdvancedEditor}
            onOpenHistory={onOpenHistory}
            onRestore={onRestore}
            onSchedule={onSchedule}
          />
        </div>
      </div>
    </div>
  );
});
