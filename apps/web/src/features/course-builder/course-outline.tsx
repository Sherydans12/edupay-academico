'use client';

import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import React, { memo, useMemo, useState } from 'react';

import { Icon } from '@/components/icons';
import { ScrollableTabsBar } from '@/components/scrollable-tabs-bar';
import { UnitCard } from './unit-card';

export type CourseOutlineStatusFilter =
  | 'ALL'
  | 'PUBLISHED'
  | 'DRAFT'
  | 'ARCHIVED';

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
  onDeleteItem?: ((item: LearningItem) => void) | undefined;
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
  onDeleteItem,
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
  const [statusFilter, setStatusFilter] =
    useState<CourseOutlineStatusFilter>('ALL');

  const counts = useMemo(() => {
    let published = 0;
    let drafts = 0;
    let archived = 0;
    let total = 0;
    for (const unit of units) {
      for (const item of unit.items) {
        total++;
        if (item.publicationStatus === 'PUBLISHED') published++;
        else if (item.publicationStatus === 'ARCHIVED') archived++;
        else drafts++;
      }
    }
    return { all: total, archived, drafts, published };
  }, [units]);

  const filteredUnits = useMemo(() => {
    if (statusFilter === 'ALL') return units;
    return units.map((u) => ({
      ...u,
      items: u.items.filter((item) => {
        if (statusFilter === 'PUBLISHED')
          return item.publicationStatus === 'PUBLISHED';
        if (statusFilter === 'ARCHIVED')
          return item.publicationStatus === 'ARCHIVED';
        if (statusFilter === 'DRAFT') {
          return (
            item.publicationStatus === 'DRAFT' ||
            item.publicationStatus === 'SCHEDULED'
          );
        }
        return true;
      }),
    }));
  }, [statusFilter, units]);

  if (!units.length) {
    return (
      <div className="teacher-route-empty-card">
        <div className="teacher-route-empty-card__icon">
          <Icon name="book-open" />
        </div>
        <div className="teacher-route-empty-card__content">
          <h3>Empieza planificando tu primera unidad</h3>
          <p className="learning-route__empty">
            Aún no hay contenido visible en esta ruta.
          </p>
          <small>
            Haz clic en "+ Nueva unidad" arriba para comenzar a estructurar los
            temas y contenidos de la asignatura.
          </small>
        </div>
      </div>
    );
  }

  const noMatchesForFilter =
    statusFilter !== 'ALL' &&
    filteredUnits.every((u) => u.items.length === 0);

  return (
    <div className="teacher-route-outline-wrapper">
      {/* Status Lifecycle Filter Chips */}
      <div className="teacher-route-filter-bar">
        <span className="teacher-route-filter-label">
          <Icon name="filter" />
          Filtrar:
        </span>
        <ScrollableTabsBar ariaLabel="Filtros por estado de contenido y unidades">
          <div className="teacher-route-filter-chips" role="tablist">
            <button
              aria-selected={statusFilter === 'ALL'}
              className={`teacher-route-filter-chip ${statusFilter === 'ALL' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
              role="tab"
              type="button"
            >
              <span>Todos</span>
              <span className="chip-badge">{counts.all}</span>
            </button>
            <button
              aria-selected={statusFilter === 'PUBLISHED'}
              className={`teacher-route-filter-chip ${statusFilter === 'PUBLISHED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setStatusFilter('PUBLISHED')}
              role="tab"
              type="button"
            >
              <Icon name="check-circle" />
              <span>Publicados</span>
              <span className="chip-badge">{counts.published}</span>
            </button>
            <button
              aria-selected={statusFilter === 'DRAFT'}
              className={`teacher-route-filter-chip ${statusFilter === 'DRAFT' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setStatusFilter('DRAFT')}
              role="tab"
              type="button"
            >
              <Icon name="edit" />
              <span>Borradores</span>
              <span className="chip-badge">{counts.drafts}</span>
            </button>
            <button
              aria-selected={statusFilter === 'ARCHIVED'}
              className={`teacher-route-filter-chip ${statusFilter === 'ARCHIVED' ? 'teacher-route-filter-chip--active' : ''}`}
              onClick={() => setStatusFilter('ARCHIVED')}
              role="tab"
              type="button"
            >
              <Icon name="archive" />
              <span>Archivados</span>
              <span className="chip-badge chip-badge--archived">{counts.archived}</span>
            </button>
          </div>
        </ScrollableTabsBar>
      </div>

      {noMatchesForFilter ? (
        <div className="teacher-route-empty-filter-notice">
          <Icon name={statusFilter === 'ARCHIVED' ? 'archive' : 'layers'} />
          <p>
            {statusFilter === 'ARCHIVED'
              ? 'No hay contenidos archivados en esta asignatura. Cuando archives un contenido, aparecerá aquí para poder restaurarlo o eliminarlo permanentemente.'
              : statusFilter === 'PUBLISHED'
                ? 'No hay contenidos publicados todavía en esta asignatura.'
                : 'No hay borradores ni publicaciones programadas pendientes.'}
          </p>
          <button
            className="teacher-route-filter-reset-btn"
            onClick={() => setStatusFilter('ALL')}
            type="button"
          >
            Mostrar todos los contenidos
          </button>
        </div>
      ) : null}

      <div className="teacher-units-list">
        {filteredUnits.map((unit, unitIndex) => (
          <UnitCard
            key={unit.id}
            onActivateUnit={onActivateUnit}
            onAddItem={onAddItem}
            onArchiveItem={onArchiveItem}
            onArchiveUnit={onArchiveUnit}
            onCancelSchedule={onCancelSchedule}
            onChangeScheduleDraftValue={onChangeScheduleDraftValue}
            onDeleteItem={onDeleteItem}
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
    </div>
  );
});
