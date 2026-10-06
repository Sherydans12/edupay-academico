'use client';

import { Badge, Button, Dialog, Select } from '@edupay/ui';
import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import React, { useState } from 'react';

import { Icon } from '@/components/icons';

export interface MoveItemDialogProps {
  item: LearningItem;
  currentUnit: LearningUnitWithItems;
  units: LearningUnitWithItems[];
  moving?: boolean;
  onClose: () => void;
  onMove: (data: {
    item: LearningItem;
    sourceUnit: LearningUnitWithItems;
    targetUnitId: string;
    targetUnit: LearningUnitWithItems;
  }) => Promise<void> | void;
}

export function MoveItemDialog({
  currentUnit,
  item,
  moving = false,
  onClose,
  onMove,
  units,
}: MoveItemDialogProps) {
  const eligibleUnits = units.filter((u) => u.id !== currentUnit.id);
  const [targetUnitId, setTargetUnitId] = useState(eligibleUnits[0]?.id ?? '');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetUnitId) return;
    const targetUnit = units.find((u) => u.id === targetUnitId);
    if (!targetUnit) return;

    void onMove({
      item,
      sourceUnit: currentUnit,
      targetUnit,
      targetUnitId,
    });
  };

  const selectedTargetUnit = units.find((u) => u.id === targetUnitId);

  return (
    <Dialog
      description="Selecciona la unidad de destino para reorganizar este contenido pedagógico."
      onOpenChange={(open) => {
        if (!open && !moving) onClose();
      }}
      open
      title="Mover contenido a otra unidad"
    >
      <form onSubmit={handleSubmit}>
        <div className="move-item-form">
          {/* Visual Route Flow Banner */}
          <div className="move-item-flow-card">
            <div className="move-item-flow-step">
              <span className="move-item-flow-step__label">Moviendo</span>
              <div className="move-item-flow-step__pill move-item-flow-step__pill--source">
                <Icon
                  name={
                    item.type === 'ASSESSMENT'
                      ? 'award'
                      : item.type === 'ASSIGNMENT'
                        ? 'file-text'
                        : item.type === 'MATERIAL'
                          ? 'book-open'
                          : 'message'
                  }
                />
                <span className="move-item-flow-step__title" title={item.title}>
                  «<strong>{item.title}</strong>»
                </span>
              </div>
            </div>

            <div className="move-item-flow-connector" aria-hidden="true">
              <Icon name="arrow-right" />
            </div>

            <div className="move-item-flow-step">
              <span className="move-item-flow-step__label">Unidad de destino</span>
              <div className="move-item-flow-step__pill move-item-flow-step__pill--target">
                <Icon name="layers" />
                <span className="move-item-flow-step__title">
                  {selectedTargetUnit ? selectedTargetUnit.title : 'Selecciona una unidad'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Unit Cards Grid */}
          <div className="move-item-unit-cards">
            <span className="move-item-unit-cards__title">
              Unidades disponibles ({eligibleUnits.length})
            </span>
            <div className="move-item-unit-grid" role="radiogroup" aria-label="Seleccionar unidad de destino">
              {eligibleUnits.map((u) => {
                const isSelected = u.id === targetUnitId;
                return (
                  <button
                    aria-checked={isSelected}
                    className={`move-unit-card ${isSelected ? 'move-unit-card--selected' : ''}`}
                    key={u.id}
                    onClick={() => setTargetUnitId(u.id)}
                    role="radio"
                    type="button"
                  >
                    <div className="move-unit-card__radio-indicator">
                      {isSelected ? <Icon name="check" /> : null}
                    </div>
                    <div className="move-unit-card__info">
                      <div className="move-unit-card__head">
                        <strong className="move-unit-card__title">{u.title}</strong>
                        <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {u.status === 'ACTIVE' ? 'Activa' : 'Borrador'}
                        </Badge>
                      </div>
                      <span className="move-unit-card__items-count">
                        <Icon name="layers" />
                        {u.items.length} {u.items.length === 1 ? 'contenido existente' : 'contenidos existentes'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Standard Select for accessibility & test compatibility */}
          <div className="move-item-select-fallback">
            <Select
              id="target-unit-select"
              label="O seleccionar desde la lista"
              onChange={(event) => setTargetUnitId(event.target.value)}
              value={targetUnitId}
            >
              {eligibleUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title} ({u.items.length} contenidos)
                </option>
              ))}
            </Select>
          </div>

          <div className="showcase-dialog-actions move-item-dialog-actions">
            <Button
              disabled={moving}
              onClick={onClose}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              disabled={!targetUnitId || moving}
              loading={moving}
              type="submit"
              variant="primary"
            >
              <Icon name="check" />
              Mover contenido
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
