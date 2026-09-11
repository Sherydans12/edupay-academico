'use client';

import { Badge, Button, DropdownItem, DropdownMenu } from '@edupay/ui';
import type { LearningItem } from '@edupay/contracts';
import React, { memo, useRef } from 'react';

import { Icon } from '@/components/icons';
import { formatInstant } from '@/features/learning-screen-support';

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
}

export const ItemRow = memo(function ItemRow({
  expectedItemVersion: _,
  item,
  itemIndex,
  onArchive,
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
          <small>
            <Icon name="clock" />
            Vence {formatInstant(item.dueAt)}
          </small>
        ) : null}

        {item.publicationStatus === 'SCHEDULED' && item.publishAt ? (
          <small>
            <Icon name="calendar" />
            Publica el {formatInstant(item.publishAt)}
          </small>
        ) : null}
      </div>

      <div className="learning-item__actions">
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
            Publicar
          </Button>
        ) : null}

        <DropdownMenu
          label={`Más opciones para ${item.title}`}
          trigger={
            <span aria-label="Más opciones" className="dropdown-trigger-icon">
              <Icon name="more" />
            </span>
          }
        >
          <DropdownItem onSelect={() => onOpenAdvancedEditor(item)}>
            <Icon name="edit" />
            Editor avanzado y borrador
          </DropdownItem>
          {attachmentSupported ? (
            <DropdownItem onSelect={() => onManageAttachments(item)}>
              <Icon name="paperclip" />
              Archivos adjuntos
            </DropdownItem>
          ) : null}
          {item.publicationStatus === 'DRAFT' ||
          item.publicationStatus === 'SCHEDULED' ? (
            <DropdownItem onSelect={() => onSchedule(item)}>
              <Icon name="calendar" />
              Programar publicación
            </DropdownItem>
          ) : null}
          <DropdownItem onSelect={() => onMoveToUnit(item)}>
            <Icon name="move" />
            Mover a otra unidad
          </DropdownItem>
          <DropdownItem onSelect={() => onDuplicate(item)}>
            <Icon name="copy" />
            Duplicar contenido
          </DropdownItem>
          <DropdownItem onSelect={() => onOpenHistory(item)}>
            <Icon name="history" />
            Historial de versiones
          </DropdownItem>
          {item.publicationStatus !== 'ARCHIVED' ? (
            <DropdownItem onSelect={() => onArchive(item)}>
              <Icon name="archive" />
              Archivar contenido
            </DropdownItem>
          ) : null}
        </DropdownMenu>
      </div>
    </div>
  );
});
