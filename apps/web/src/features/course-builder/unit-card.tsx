'use client';

import { Badge, Button, DropdownItem, DropdownMenu } from '@edupay/ui';
import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import React, { memo } from 'react';

import { Icon } from '@/components/icons';
import { formatInstant } from '@/features/learning-screen-support';
import { ItemRow } from './item-row';

export interface UnitCardProps {
  unit: LearningUnitWithItems;
  unitIndex: number;
  totalUnits: number;
  orderRevision?: number | undefined;
  saving?: boolean | undefined;
  scheduleDraft?: { itemId: string; value: string } | null | undefined;
  onMoveUnitUp: (unitIndex: number) => void;
  onMoveUnitDown: (unitIndex: number) => void;
  onEditUnit: (unit: LearningUnitWithItems) => void;
  onActivateUnit: (unit: LearningUnitWithItems) => void;
  onArchiveUnit: (unit: LearningUnitWithItems) => void;
  onRestoreUnit: (unit: LearningUnitWithItems) => void;
  onDuplicateUnit: (unit: LearningUnitWithItems) => void;
  onOpenUnitHistory: (unit: LearningUnitWithItems) => void;
  onAddItem: (unit: LearningUnitWithItems) => void;
  onMoveItemUp: (
    unit: LearningUnitWithItems,
    item: LearningItem,
    index: number,
  ) => void;
  onMoveItemDown: (
    unit: LearningUnitWithItems,
    item: LearningItem,
    index: number,
  ) => void;
  onEditItem: (unit: LearningUnitWithItems, item: LearningItem) => void;
  onManageAttachments: (item: LearningItem) => void;
  onPublishItem: (item: LearningItem) => void;
  onScheduleItemClick: (item: LearningItem) => void;
  onSaveSchedule: (item: LearningItem, dateStr: string) => void;
  onCancelSchedule: () => void;
  onChangeScheduleDraftValue: (value: string) => void;
  onArchiveItem: (item: LearningItem) => void;
  onRestoreItem: (item: LearningItem) => void;
  onDuplicateItem: (item: LearningItem) => void;
  onMoveItemToUnit: (unit: LearningUnitWithItems, item: LearningItem) => void;
  onOpenAdvancedEditor: (
    unit: LearningUnitWithItems,
    item: LearningItem,
  ) => void;
  onOpenItemHistory: (item: LearningItem) => void;
}

export const UnitCard = memo(function UnitCard({
  onAddItem,
  onActivateUnit,
  onArchiveItem,
  onArchiveUnit,
  onCancelSchedule,
  onChangeScheduleDraftValue,
  onDuplicateItem,
  onDuplicateUnit,
  onEditItem,
  onEditUnit,
  onManageAttachments,
  onMoveItemDown,
  onMoveItemToUnit,
  onMoveItemUp,
  onMoveUnitDown,
  onMoveUnitUp,
  onOpenAdvancedEditor,
  onOpenItemHistory,
  onOpenUnitHistory,
  onPublishItem,
  onRestoreItem,
  onRestoreUnit,
  onSaveSchedule,
  onScheduleItemClick,
  orderRevision: _,
  saving = false,
  scheduleDraft,
  totalUnits,
  unit,
  unitIndex,
}: UnitCardProps) {
  void _;
  void onCancelSchedule;
  void onChangeScheduleDraftValue;
  void onSaveSchedule;
  void scheduleDraft;

  const handleMoveUp = () => {
    onMoveUnitUp(unitIndex);
  };

  const handleMoveDown = () => {
    onMoveUnitDown(unitIndex);
  };

  return (
    <section
      aria-label={`Unidad ${unitIndex + 1}: ${unit.title}`}
      className="teacher-unit-panel"
      data-unit-id={unit.id}
      data-version={unit.version}
    >
      {/* Unit Header */}
      <header className="teacher-unit-header">
        <div className="teacher-unit-marker">
          <span>{unitIndex + 1}</span>
        </div>

        <div className="teacher-unit-title-group">
          <div className="teacher-unit-title-row">
            <h3>{unit.title}</h3>
            <Badge
              tone={
                unit.status === 'ACTIVE'
                  ? 'info'
                  : unit.status === 'DRAFT'
                    ? 'neutral'
                    : 'neutral'
              }
            >
              {unit.status === 'ACTIVE'
                ? `${unit.items.length} contenido${unit.items.length === 1 ? '' : 's'}`
                : unit.status === 'DRAFT'
                  ? 'Borrador'
                  : 'Archivada'}
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
            aria-label={`Mover ${unit.title} hacia arriba`}
            disabled={unitIndex === 0 || saving}
            onClick={handleMoveUp}
            size="icon"
            title="Mover hacia arriba"
            variant="ghost"
          >
            <Icon name="arrow-up" />
          </Button>
          <Button
            aria-label={`Mover ${unit.title} hacia abajo`}
            disabled={unitIndex === totalUnits - 1 || saving}
            onClick={handleMoveDown}
            size="icon"
            title="Mover hacia abajo"
            variant="ghost"
          >
            <Icon name="arrow-down" />
          </Button>

          <Button
            disabled={unit.status === 'ARCHIVED'}
            onClick={() => onEditUnit(unit)}
            size="sm"
            variant="secondary"
          >
            Editar unidad
          </Button>

          {unit.status === 'ARCHIVED' ? (
            <Button
              onClick={() => onRestoreUnit(unit)}
              size="sm"
              variant="secondary"
            >
              <Icon name="history" />
              Restaurar unidad
            </Button>
          ) : null}

          {unit.status === 'DRAFT' ? (
            <Button onClick={() => onActivateUnit(unit)} size="sm">
              Activar
            </Button>
          ) : null}

          <DropdownMenu
            label={`Opciones de la unidad ${unit.title}`}
            trigger={
              <span
                aria-label="Opciones de unidad"
                className="dropdown-trigger-icon"
              >
                <Icon name="more" />
              </span>
            }
          >
            <DropdownItem onSelect={() => onDuplicateUnit(unit)}>
              <Icon name="copy" />
              Duplicar unidad
            </DropdownItem>
            <DropdownItem onSelect={() => onOpenUnitHistory(unit)}>
              <Icon name="history" />
              Historial de versiones
            </DropdownItem>
            {unit.status !== 'ARCHIVED' ? (
              <DropdownItem onSelect={() => onArchiveUnit(unit)}>
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
          {unit.items.map((item, itemIndex) => (
            <ItemRow
              expectedItemVersion={item.version}
              item={item}
              itemIndex={itemIndex}
              key={item.id}
              onArchive={onArchiveItem}
              onDuplicate={onDuplicateItem}
              onEdit={(it) => onEditItem(unit, it)}
              onManageAttachments={onManageAttachments}
              onMoveDown={(it, idx) => onMoveItemDown(unit, it, idx)}
              onMoveToUnit={(it) => onMoveItemToUnit(unit, it)}
              onMoveUp={(it, idx) => onMoveItemUp(unit, it, idx)}
              onOpenAdvancedEditor={(it) => onOpenAdvancedEditor(unit, it)}
              onOpenHistory={onOpenItemHistory}
              onPublish={onPublishItem}
              onRestore={onRestoreItem}
              onSchedule={onScheduleItemClick}
              saving={saving}
              totalItems={unit.items.length}
              unitId={unit.id}
            />
          ))}
        </div>
      ) : (
        <div className="teacher-unit-empty">
          <p>No hay contenido en esta unidad.</p>
        </div>
      )}

      {/* Unit Secondary Add action */}
      <div className="learning-unit-secondary-actions">
        <Button
          aria-label={`Agregar contenido a ${unit.title}`}
          disabled={unit.status === 'ARCHIVED'}
          onClick={() => onAddItem(unit)}
          size="sm"
          variant="secondary"
        >
          <Icon name="plus" />
          Agregar contenido
        </Button>
      </div>
    </section>
  );
});
