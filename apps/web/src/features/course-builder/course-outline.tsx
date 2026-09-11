'use client';

import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import React, { memo } from 'react';

import { UnitCard } from './unit-card';

export interface CourseOutlineProps {
  units: LearningUnitWithItems[];
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

export const CourseOutline = memo(function CourseOutline({
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
  saving = false,
  scheduleDraft,
  units,
}: CourseOutlineProps) {
  if (!units.length) {
    return (
      <p className="learning-route__empty">
        Aún no hay contenido visible en esta ruta.
      </p>
    );
  }

  return (
    <div className="teacher-units-list">
      {units.map((unit, unitIndex) => (
        <UnitCard
          key={unit.id}
          onActivateUnit={onActivateUnit}
          onAddItem={onAddItem}
          onArchiveItem={onArchiveItem}
          onArchiveUnit={onArchiveUnit}
          onCancelSchedule={onCancelSchedule}
          onChangeScheduleDraftValue={onChangeScheduleDraftValue}
          onDuplicateItem={onDuplicateItem}
          onDuplicateUnit={onDuplicateUnit}
          onEditItem={onEditItem}
          onEditUnit={onEditUnit}
          onManageAttachments={onManageAttachments}
          onMoveItemDown={onMoveItemDown}
          onMoveItemToUnit={onMoveItemToUnit}
          onMoveItemUp={onMoveItemUp}
          onMoveUnitDown={onMoveUnitDown}
          onMoveUnitUp={onMoveUnitUp}
          onOpenAdvancedEditor={onOpenAdvancedEditor}
          onOpenItemHistory={onOpenItemHistory}
          onOpenUnitHistory={onOpenUnitHistory}
          onPublishItem={onPublishItem}
          onRestoreItem={onRestoreItem}
          onRestoreUnit={onRestoreUnit}
          onSaveSchedule={onSaveSchedule}
          onScheduleItemClick={onScheduleItemClick}
          orderRevision={unit.sortOrder ?? unitIndex}
          saving={saving}
          scheduleDraft={scheduleDraft}
          totalUnits={units.length}
          unit={unit}
          unitIndex={unitIndex}
        />
      ))}
    </div>
  );
});
