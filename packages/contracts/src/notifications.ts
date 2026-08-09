import { z } from 'zod';

const opaqueIdSchema = z.string().uuid();
const timestampSchema = z.iso.datetime({ offset: true });

export const notificationTypeSchema = z.enum([
  'ASSIGNMENT_PUBLISHED',
  'ASSESSMENT_PUBLISHED',
  'ANNOUNCEMENT_PUBLISHED',
  'SUBMISSION_RECEIVED',
  'RESUBMISSION_RECEIVED',
  'SUBMISSION_REVIEWED',
  'CHANGES_REQUESTED',
]);

export const inAppNotificationSchema = z
  .object({
    id: opaqueIdSchema,
    eventId: z.string().min(1).max(220),
    type: notificationTypeSchema,
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
    targetPath: z.string().min(1).max(500),
    createdAt: timestampSchema,
    readAt: timestampSchema.nullable(),
  })
  .strict();

export const notificationPageSchema = z
  .object({
    items: z.array(inAppNotificationSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const notificationListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const unreadNotificationCountSchema = z
  .object({ count: z.number().int().nonnegative() })
  .strict();

export const markedNotificationsSchema = z
  .object({ updatedCount: z.number().int().nonnegative() })
  .strict();

export type InAppNotification = z.infer<typeof inAppNotificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
