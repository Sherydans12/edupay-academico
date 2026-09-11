'use client';

import { Button, Dialog, Select } from '@edupay/ui';
import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import React, { useState } from 'react';

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

  return (
    <Dialog
      description="Selecciona la unidad de destino para este contenido."
      onOpenChange={(open) => {
        if (!open && !moving) onClose();
      }}
      open
      title="Mover contenido a otra unidad"
    >
      <form onSubmit={handleSubmit}>
        <div className="move-item-form">
          <p>
            Moviendo «<strong>{item.title}</strong>»
          </p>

          <Select
            id="target-unit-select"
            label="Unidad de destino"
            onChange={(event) => setTargetUnitId(event.target.value)}
            value={targetUnitId}
          >
            {eligibleUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}
              </option>
            ))}
          </Select>

          <div className="showcase-dialog-actions">
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
            >
              Mover contenido
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
