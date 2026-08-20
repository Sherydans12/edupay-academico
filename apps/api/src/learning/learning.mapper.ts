import type {
  ContentRevision,
  LearningItem,
  LearningItemDraft,
  LearningUnit,
} from '../generated/prisma/client';

const timestamp = (value: Date): string => value.toISOString();

export const mapLearningUnit = (record: LearningUnit): object => ({
  id: record.id,
  courseSubjectId: record.courseSubjectId,
  title: record.title,
  description: record.description,
  sortOrder: record.sortOrder,
  startAt: record.startAt ? timestamp(record.startAt) : null,
  endAt: record.endAt ? timestamp(record.endAt) : null,
  status: record.status,
  version: record.version,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapLearningItem = (record: LearningItem): object => ({
  id: record.id,
  courseSubjectId: record.courseSubjectId,
  learningUnitId: record.learningUnitId,
  type: record.type,
  title: record.title,
  description: record.description,
  content: record.content,
  instructions: record.instructions,
  body: record.body,
  sortOrder: record.sortOrder,
  publicationStatus: record.publicationStatus,
  publishAt: record.publishAt ? timestamp(record.publishAt) : null,
  publishedAt: record.publishedAt ? timestamp(record.publishedAt) : null,
  publishedByIdentityUserId: record.publishedByIdentityUserId,
  dueAt: record.dueAt ? timestamp(record.dueAt) : null,
  createdByIdentityUserId: record.createdByIdentityUserId,
  updatedByIdentityUserId: record.updatedByIdentityUserId,
  version: record.version,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapLearningItemDraft = (record: LearningItemDraft): object => ({
  learningItemId: record.learningItemId,
  title: record.title,
  description: record.description,
  content: record.content,
  instructions: record.instructions,
  body: record.body,
  dueAt: record.dueAt ? timestamp(record.dueAt) : null,
  basedOnVersion: record.basedOnVersion,
  updatedByIdentityUserId: record.updatedByIdentityUserId,
  updatedAt: timestamp(record.updatedAt),
});

export const mapContentRevision = (record: ContentRevision): object => ({
  id: record.id,
  entityType: record.entityType,
  entityId: record.entityId,
  revisionNumber: record.revisionNumber,
  operation: record.operation,
  snapshot: record.snapshot,
  actorIdentityUserId: record.actorIdentityUserId,
  requestId: record.requestId,
  restoredFromRevision: record.restoredFromRevision,
  createdAt: timestamp(record.createdAt),
});

export const mapLearningUnitWithItems = (
  record: LearningUnit & { items: LearningItem[] },
): object => ({
  ...mapLearningUnit(record),
  items: record.items.map(mapLearningItem),
});
