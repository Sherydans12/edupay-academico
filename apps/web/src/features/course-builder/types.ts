import type {
  CourseSubject,
  LearningBodyDocument,
  LearningItem,
  LearningUnitWithItems,
} from '@edupay/contracts';

export interface MoveItemRequest {
  targetLearningUnitId: string;
  expectedItemVersion: number;
  sourceOrderRevision: number;
  targetOrderRevision: number;
  idempotencyKey: string;
  position?: number;
}

export interface UpdateLearningItemRequest {
  title?: string;
  description?: string | null;
  content?: string | null;
  instructions?: string | null;
  body?: string | null;
  bodyDocument?: LearningBodyDocument | null;
  dueAt?: string | null;
  type?: LearningItem['type'];
  expectedItemVersion: number;
  idempotencyKey: string;
  confirmSensitiveChange?: boolean;
}

export interface CreateLearningItemRequest {
  learningUnitId: string;
  title: string;
  type: LearningItem['type'];
  description?: string;
  content?: string;
  instructions?: string;
  body?: string;
  bodyDocument?: LearningBodyDocument | null;
  dueAt?: string;
  idempotencyKey: string;
}

export interface ItemEditorFormValues {
  id?: string | undefined;
  type: LearningItem['type'];
  title: string;
  description: string;
  content: string;
  instructions: string;
  body: string;
  bodyDocument: LearningBodyDocument | null;
  dueAt: string;
}

export interface UnitEditorFormValues {
  id?: string | undefined;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
}

export interface PendingCommand {
  id: string;
  actionType: string;
  previousUnits: LearningUnitWithItems[];
}

export interface CourseBuilderState {
  units: LearningUnitWithItems[];
  pendingCommands: PendingCommand[];
  conflictNotice: string | null;
  isSyncing: boolean;
}

export type CourseBuilderAction =
  | { type: 'SET_ROUTE'; units: LearningUnitWithItems[] }
  | {
      type: 'OPTIMISTIC_REORDER_ITEMS';
      commandId: string;
      unitId: string;
      orderedIds: string[];
    }
  | {
      type: 'OPTIMISTIC_MOVE_ITEM';
      commandId: string;
      itemId: string;
      sourceUnitId: string;
      targetUnitId: string;
    }
  | {
      type: 'OPTIMISTIC_REORDER_UNITS';
      commandId: string;
      orderedIds: string[];
    }
  | {
      type: 'OPTIMISTIC_UPDATE_ITEM';
      commandId: string;
      itemId: string;
      updates: Partial<LearningItem>;
    }
  | {
      type: 'OPTIMISTIC_UPDATE_UNIT';
      commandId: string;
      unitId: string;
      updates: Partial<LearningUnitWithItems>;
    }
  | {
      type: 'OPTIMISTIC_ARCHIVE_ITEM';
      commandId: string;
      itemId: string;
    }
  | {
      type: 'OPTIMISTIC_RESTORE_ITEM';
      commandId: string;
      itemId: string;
    }
  | {
      type: 'OPTIMISTIC_ACTIVATE_UNIT';
      commandId: string;
      unitId: string;
    }
  | {
      type: 'OPTIMISTIC_ARCHIVE_UNIT';
      commandId: string;
      unitId: string;
    }
  | {
      type: 'OPTIMISTIC_RESTORE_UNIT';
      commandId: string;
      unitId: string;
    }
  | {
      type: 'CONFIRM_COMMAND';
      commandId: string;
      consolidatedUnits?: LearningUnitWithItems[];
    }
  | {
      type: 'ROLLBACK_COMMAND';
      commandId: string;
    }
  | {
      type: 'SET_CONFLICT';
      message: string;
    }
  | {
      type: 'CLEAR_CONFLICT';
    }
  | {
      type: 'SET_SYNCING';
      isSyncing: boolean;
    };
