import type { LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import type {
  CourseBuilderAction,
  CourseBuilderState,
  PendingCommand,
} from './types';

export const initialCourseBuilderState: CourseBuilderState = {
  conflictNotice: null,
  isSyncing: false,
  pendingCommands: [],
  units: [],
};

export function courseBuilderReducer(
  state: CourseBuilderState,
  action: CourseBuilderAction,
): CourseBuilderState {
  switch (action.type) {
    case 'SET_ROUTE': {
      return {
        ...state,
        units: action.units,
      };
    }

    case 'OPTIMISTIC_REORDER_ITEMS': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) => {
        if (unit.id !== action.unitId) return unit;
        const itemMap = new Map(unit.items.map((item) => [item.id, item]));
        const reorderedItems: LearningItem[] = [];
        for (const id of action.orderedIds) {
          const found = itemMap.get(id);
          if (found) reorderedItems.push(found);
        }
        // Include any leftover items not in orderedIds to prevent data loss
        for (const item of unit.items) {
          if (!action.orderedIds.includes(item.id)) {
            reorderedItems.push(item);
          }
        }
        return {
          ...unit,
          items: reorderedItems,
        };
      });

      const pending: PendingCommand = {
        actionType: 'REORDER_ITEMS',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_MOVE_ITEM': {
      const previousUnits = state.units;
      let movedItem: LearningItem | null = null;

      // Extract item from source
      const unitsWithoutItem = state.units.map((unit) => {
        if (unit.id === action.sourceUnitId) {
          const item = unit.items.find((it) => it.id === action.itemId);
          if (item) {
            movedItem = { ...item, learningUnitId: action.targetUnitId };
          }
          return {
            ...unit,
            items: unit.items.filter((it) => it.id !== action.itemId),
          };
        }
        return unit;
      });

      if (!movedItem) return state;

      // Insert item into target
      const nextUnits = unitsWithoutItem.map((unit) => {
        if (unit.id === action.targetUnitId) {
          return {
            ...unit,
            items: [...unit.items, movedItem!],
          };
        }
        return unit;
      });

      const pending: PendingCommand = {
        actionType: 'MOVE_ITEM',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_REORDER_UNITS': {
      const previousUnits = state.units;
      const unitMap = new Map(state.units.map((u) => [u.id, u]));
      const nextUnits: LearningUnitWithItems[] = [];
      for (const id of action.orderedIds) {
        const found = unitMap.get(id);
        if (found) nextUnits.push(found);
      }
      for (const u of state.units) {
        if (!action.orderedIds.includes(u.id)) {
          nextUnits.push(u);
        }
      }

      const pending: PendingCommand = {
        actionType: 'REORDER_UNITS',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_UPDATE_ITEM': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) => ({
        ...unit,
        items: unit.items.map((item) =>
          item.id === action.itemId ? { ...item, ...action.updates } : item,
        ),
      }));

      const pending: PendingCommand = {
        actionType: 'UPDATE_ITEM',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_UPDATE_UNIT': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) =>
        unit.id === action.unitId ? { ...unit, ...action.updates } : unit,
      );

      const pending: PendingCommand = {
        actionType: 'UPDATE_UNIT',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_ARCHIVE_ITEM': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) => ({
        ...unit,
        items: unit.items.map((item) =>
          item.id === action.itemId
            ? { ...item, publicationStatus: 'ARCHIVED' as const }
            : item,
        ),
      }));

      const pending: PendingCommand = {
        actionType: 'ARCHIVE_ITEM',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_RESTORE_ITEM': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) => ({
        ...unit,
        items: unit.items.map((item) =>
          item.id === action.itemId
            ? { ...item, publicationStatus: 'DRAFT' as const }
            : item,
        ),
      }));

      const pending: PendingCommand = {
        actionType: 'RESTORE_ITEM',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_ACTIVATE_UNIT': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) =>
        unit.id === action.unitId
          ? { ...unit, status: 'ACTIVE' as const }
          : unit,
      );

      const pending: PendingCommand = {
        actionType: 'ACTIVATE_UNIT',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_ARCHIVE_UNIT': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) =>
        unit.id === action.unitId
          ? { ...unit, status: 'ARCHIVED' as const }
          : unit,
      );

      const pending: PendingCommand = {
        actionType: 'ARCHIVE_UNIT',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'OPTIMISTIC_RESTORE_UNIT': {
      const previousUnits = state.units;
      const nextUnits = state.units.map((unit) =>
        unit.id === action.unitId
          ? { ...unit, status: 'DRAFT' as const }
          : unit,
      );

      const pending: PendingCommand = {
        actionType: 'RESTORE_UNIT',
        id: action.commandId,
        previousUnits,
      };

      return {
        ...state,
        pendingCommands: [...state.pendingCommands, pending],
        units: nextUnits,
      };
    }

    case 'CONFIRM_COMMAND': {
      return {
        ...state,
        pendingCommands: state.pendingCommands.filter(
          (c) => c.id !== action.commandId,
        ),
        units: action.consolidatedUnits ?? state.units,
      };
    }

    case 'ROLLBACK_COMMAND': {
      const found = state.pendingCommands.find(
        (c) => c.id === action.commandId,
      );
      if (!found) return state;

      return {
        ...state,
        pendingCommands: state.pendingCommands.filter(
          (c) => c.id !== action.commandId,
        ),
        units: found.previousUnits,
      };
    }

    case 'SET_CONFLICT': {
      return {
        ...state,
        conflictNotice: action.message,
      };
    }

    case 'CLEAR_CONFLICT': {
      return {
        ...state,
        conflictNotice: null,
      };
    }

    case 'SET_SYNCING': {
      return {
        ...state,
        isSyncing: action.isSyncing,
      };
    }

    default:
      return state;
  }
}
