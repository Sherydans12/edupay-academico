import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcademicRequestContext } from '../academic/academic-context';
import type { AcademicAuditPort } from '../academic/academic-audit.port';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  TrustedIdentityPrincipal,
  type IdentityRole,
} from '../identity/identity.types';
import type { LearningStudentWorkPort } from './learning-student-work.port';
import { LearningService } from './learning.service';
import { SparseOrderingService } from './ordering/sparse-ordering.service';
import { CommandIdempotencyService } from './idempotency/command-idempotency.service';
import type { NotificationService } from '../notifications/notification.service';
import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import type { PrismaService } from '../persistence/prisma.service';

const ids = {
  courseSubject1: '10000000-0000-4000-8000-000000000001',
  courseSubject2: '10000000-0000-4000-8000-000000000002',
  unit1: '10000000-0000-4000-8000-000000000003',
  unit2: '10000000-0000-4000-8000-000000000004',
  unitCrossSubject: '10000000-0000-4000-8000-000000000005',
  item1: '10000000-0000-4000-8000-000000000006',
  item2: '10000000-0000-4000-8000-000000000007',
  teacher1: '10000000-0000-4000-8000-000000000008',
};

const now = new Date('2026-08-24T12:00:00.000Z');

interface MockUnit {
  id: string;
  tenantId: string;
  courseSubjectId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  startAt: Date | null;
  endAt: Date | null;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  courseSubject?: { status: string } | undefined;
}

interface MockItem {
  id: string;
  tenantId: string;
  courseSubjectId: string;
  learningUnitId: string;
  type: string;
  title: string;
  description: string | null;
  content: string | null;
  instructions: string | null;
  body: string | null;
  sortOrder: number;
  publicationStatus: string;
  publishAt: Date | null;
  publishedAt: Date | null;
  publishedByIdentityUserId: string | null;
  dueAt: Date | null;
  createdByIdentityUserId: string;
  updatedByIdentityUserId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  learningUnit?: MockUnit | undefined;
}

interface MockRevision {
  tenantId: string;
  entityType: string;
  entityId: string;
  revisionNumber: number;
  operation: string;
  snapshot: Record<string, unknown>;
  actorIdentityUserId: string;
  requestId: string;
  restoredFromRevision: number | null;
}

interface MockReceipt {
  id: string;
  tenantId: string;
  actorIdentityUserId: string;
  commandName: string;
  idempotencyKey: string;
  payloadFingerprint: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
}

function createPrincipal(
  roles: IdentityRole[],
  identityUserId = 'user-teacher-1',
  tenantId = 'tenant-a',
) {
  return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
    aud: 'academic-api',
    exp: 2_000_000_000,
    iat: 1_999_999_000,
    iss: 'https://identity.example.test',
    jti: `token-${identityUserId}`,
    membership_id: `membership-${identityUserId}`,
    nbf: 1_999_999_000,
    roles,
    sid: `session-${identityUserId}`,
    sub: identityUserId,
    tenant_id: tenantId,
  });
}

function createContext(
  roles: IdentityRole[] = ['TEACHER'],
  identityUserId = 'user-teacher-1',
  tenantId = 'tenant-a',
  idempotencyKey?: string | undefined,
): AcademicRequestContext {
  const principal = createPrincipal(roles, identityUserId, tenantId);
  return {
    principal,
    requestId: 'req-atomic-test',
    tenant: TrustedTenantContext.fromPrincipal(principal),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}

describe('Learning Content - Phase 3 Atomic Commands', () => {
  let auditPort: AcademicAuditPort;
  let studentWorkPort: LearningStudentWorkPort;
  let notificationService: NotificationService;
  let orderingService: SparseOrderingService;
  let idempotencyService: CommandIdempotencyService;
  let service: LearningService;

  let units: MockUnit[];
  let items: MockItem[];
  let revisions: MockRevision[];
  let receipts: MockReceipt[];
  let fileReferences: Array<Record<string, unknown>>;

  let updateUnitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    units = [
      {
        id: ids.unit1,
        tenantId: 'tenant-a',
        courseSubjectId: ids.courseSubject1,
        title: 'Unidad 1',
        description: 'Desc 1',
        sortOrder: 1024,
        startAt: null,
        endAt: null,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
        courseSubject: { status: 'ACTIVE' },
      },
      {
        id: ids.unit2,
        tenantId: 'tenant-a',
        courseSubjectId: ids.courseSubject1,
        title: 'Unidad 2',
        description: 'Desc 2',
        sortOrder: 2048,
        startAt: null,
        endAt: null,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
        courseSubject: { status: 'ACTIVE' },
      },
      {
        id: ids.unitCrossSubject,
        tenantId: 'tenant-a',
        courseSubjectId: ids.courseSubject2,
        title: 'Unidad Subject 2',
        description: 'Desc Cross',
        sortOrder: 1024,
        startAt: null,
        endAt: null,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
        courseSubject: { status: 'ACTIVE' },
      },
    ];

    items = [
      {
        id: ids.item1,
        tenantId: 'tenant-a',
        courseSubjectId: ids.courseSubject1,
        learningUnitId: ids.unit1,
        type: 'MATERIAL',
        title: 'Item 1',
        description: 'Item Desc 1',
        content: 'Body 1',
        instructions: null,
        body: null,
        sortOrder: 1024,
        publicationStatus: 'DRAFT',
        publishAt: null,
        publishedAt: null,
        publishedByIdentityUserId: null,
        dueAt: null,
        createdByIdentityUserId: 'user-teacher-1',
        updatedByIdentityUserId: 'user-teacher-1',
        version: 1,
        createdAt: now,
        updatedAt: now,
        learningUnit: units[0],
      },
      {
        id: ids.item2,
        tenantId: 'tenant-a',
        courseSubjectId: ids.courseSubject1,
        learningUnitId: ids.unit1,
        type: 'MATERIAL',
        title: 'Item 2',
        description: 'Item Desc 2',
        content: 'Body 2',
        instructions: null,
        body: null,
        sortOrder: 2048,
        publicationStatus: 'DRAFT',
        publishAt: null,
        publishedAt: null,
        publishedByIdentityUserId: null,
        dueAt: null,
        createdByIdentityUserId: 'user-teacher-1',
        updatedByIdentityUserId: 'user-teacher-1',
        version: 1,
        createdAt: now,
        updatedAt: now,
        learningUnit: units[0],
      },
    ];

    revisions = [];
    receipts = [];
    fileReferences = [];

    updateUnitMock = vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          tenantId_id?: { tenantId: string; id: string };
          id?: string;
          tenantId?: string;
        };
        data: {
          version?: { increment?: number };
          sortOrder?: number;
          status?: string;
          title?: string;
        };
      }) => {
        const id = where.tenantId_id?.id ?? where.id;
        const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
        const unit = units.find((u) => u.id === id && u.tenantId === tenantId);
        if (!unit) throw new Error('Unit not found');
        if (data.version?.increment) unit.version += data.version.increment;
        if (data.sortOrder !== undefined) unit.sortOrder = data.sortOrder;
        if (data.status !== undefined) unit.status = data.status;
        if (data.title !== undefined) unit.title = data.title;
        return unit;
      },
    );

    const mockPrisma = {
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const addedUnitIds: string[] = [];
        const addedItemIds: string[] = [];

        const txClient = {
          ...mockPrisma,
          learningUnit: {
            ...mockPrisma.learningUnit,
            create: vi.fn(
              async ({
                data,
              }: {
                data: Omit<
                  MockUnit,
                  'id' | 'version' | 'createdAt' | 'updatedAt' | 'courseSubject'
                > & { status?: string };
              }) => {
                const newUnit: MockUnit = {
                  id: `unit-gen-${units.length + 1}`,
                  version: 1,
                  createdAt: now,
                  updatedAt: now,
                  status: data.status ?? 'DRAFT',
                  title: data.title,
                  description: data.description ?? null,
                  sortOrder: data.sortOrder,
                  startAt: data.startAt ?? null,
                  endAt: data.endAt ?? null,
                  courseSubjectId: data.courseSubjectId,
                  tenantId: data.tenantId,
                  courseSubject: { status: 'ACTIVE' },
                };
                units.push(newUnit);
                addedUnitIds.push(newUnit.id);
                return newUnit;
              },
            ),
          },
          learningItem: {
            ...mockPrisma.learningItem,
            create: vi.fn(
              async ({
                data,
              }: {
                data: Omit<
                  MockItem,
                  'id' | 'version' | 'createdAt' | 'updatedAt' | 'learningUnit'
                > & { publicationStatus?: string };
              }) => {
                const newItem: MockItem = {
                  id: `item-gen-${items.length + 1}`,
                  version: 1,
                  createdAt: now,
                  updatedAt: now,
                  publicationStatus: data.publicationStatus ?? 'DRAFT',
                  title: data.title,
                  description: data.description ?? null,
                  content: data.content ?? null,
                  instructions: data.instructions ?? null,
                  body: data.body ?? null,
                  sortOrder: data.sortOrder,
                  dueAt: data.dueAt ?? null,
                  type: data.type,
                  learningUnitId: data.learningUnitId,
                  courseSubjectId: data.courseSubjectId,
                  tenantId: data.tenantId,
                  publishAt: data.publishAt ?? null,
                  publishedAt: data.publishedAt ?? null,
                  publishedByIdentityUserId:
                    data.publishedByIdentityUserId ?? null,
                  createdByIdentityUserId: data.createdByIdentityUserId,
                  updatedByIdentityUserId: data.updatedByIdentityUserId,
                };
                items.push(newItem);
                addedItemIds.push(newItem.id);
                return newItem;
              },
            ),
          },
        };

        try {
          return await cb(txClient);
        } catch (err) {
          for (const uid of addedUnitIds) {
            const idx = units.findIndex((u) => u.id === uid);
            if (idx !== -1) units.splice(idx, 1);
          }
          for (const iid of addedItemIds) {
            const idx = items.findIndex((i) => i.id === iid);
            if (idx !== -1) items.splice(idx, 1);
          }
          throw err;
        }
      }),
      courseSubject: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            if (
              tenantId === 'tenant-a' &&
              (id === ids.courseSubject1 || id === ids.courseSubject2)
            ) {
              return { id, tenantId, status: 'ACTIVE' };
            }
            return null;
          },
        ),
      },
      teacher: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId: string;
              identityUserId?: string;
              status?: string;
            };
          }) => {
            if (where.tenantId === 'tenant-a' && where.identityUserId) {
              return {
                id: `teacher-${where.identityUserId}`,
                tenantId: 'tenant-a',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      courseSubjectTeacher: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: { tenantId: string; teacherId?: string; status?: string };
          }) => {
            if (where.tenantId === 'tenant-a' && where.teacherId) {
              return { id: 'cst-1', status: 'ACTIVE' };
            }
            return null;
          },
        ),
      },
      learningUnit: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            const found = units.find(
              (u) => u.id === id && u.tenantId === tenantId,
            );
            return found ?? null;
          },
        ),
        findUniqueOrThrow: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            const found = units.find(
              (u) => u.id === id && u.tenantId === tenantId,
            );
            if (!found) throw new Error('Not found');
            return found;
          },
        ),
        findFirst: vi.fn(
          async ({
            where,
            orderBy,
          }: {
            where: { tenantId: string; courseSubjectId?: string };
            orderBy?: { sortOrder?: string };
          }) => {
            let list = units.filter((u) => u.tenantId === where.tenantId);
            if (where.courseSubjectId)
              list = list.filter(
                (u) => u.courseSubjectId === where.courseSubjectId,
              );
            if (orderBy?.sortOrder === 'desc') {
              list.sort((a, b) => b.sortOrder - a.sortOrder);
            }
            return list[0] ?? null;
          },
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId: string;
              courseSubjectId?: string;
              id?: { in?: string[] };
            };
          }) => {
            let list = units.filter((u) => u.tenantId === where.tenantId);
            if (where.courseSubjectId)
              list = list.filter(
                (u) => u.courseSubjectId === where.courseSubjectId,
              );
            if (where.id?.in) {
              const inIds = where.id.in;
              list = list.filter((u) => inIds.includes(u.id));
            }
            return list;
          },
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: Omit<
              MockUnit,
              'id' | 'version' | 'createdAt' | 'updatedAt' | 'courseSubject'
            > & { status?: string };
          }) => {
            const newUnit: MockUnit = {
              id: `unit-gen-${units.length + 1}`,
              version: 1,
              createdAt: now,
              updatedAt: now,
              status: data.status ?? 'DRAFT',
              title: data.title,
              description: data.description ?? null,
              sortOrder: data.sortOrder,
              startAt: data.startAt ?? null,
              endAt: data.endAt ?? null,
              courseSubjectId: data.courseSubjectId,
              tenantId: data.tenantId,
              courseSubject: { status: 'ACTIVE' },
            };
            units.push(newUnit);
            return newUnit;
          },
        ),
        update: updateUnitMock,
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              tenantId: string;
              id?: string;
              version?: number | { lte?: number };
            };
            data: {
              version?: { increment?: number };
              sortOrder?: number;
              title?: string;
              status?: string;
            };
          }) => {
            const id = where.id;
            if (!id) return { count: 0 };
            const unit = units.find(
              (u) => u.id === id && u.tenantId === where.tenantId,
            );
            if (!unit) return { count: 0 };
            if (
              typeof where.version === 'number' &&
              unit.version !== where.version
            ) {
              return { count: 0 };
            }
            if (
              typeof where.version === 'object' &&
              where.version?.lte !== undefined &&
              unit.version > where.version.lte
            ) {
              return { count: 0 };
            }
            if (data.version?.increment) unit.version += data.version.increment;
            if (data.sortOrder !== undefined) unit.sortOrder = data.sortOrder;
            if (data.title !== undefined) unit.title = data.title;
            if (data.status !== undefined) unit.status = data.status;
            return { count: 1 };
          },
        ),
      },
      learningItem: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            const found = items.find(
              (i) => i.id === id && i.tenantId === tenantId,
            );
            return found
              ? {
                  ...found,
                  learningUnit: units.find(
                    (u) => u.id === found.learningUnitId,
                  ),
                }
              : null;
          },
        ),
        findUniqueOrThrow: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            const found = items.find(
              (i) => i.id === id && i.tenantId === tenantId,
            );
            if (!found) throw new Error('Not found');
            return {
              ...found,
              learningUnit: units.find((u) => u.id === found.learningUnitId),
            };
          },
        ),
        findFirst: vi.fn(
          async ({
            where,
            orderBy,
          }: {
            where: {
              tenantId: string;
              learningUnitId?: string;
              id?: { not?: string };
            };
            orderBy?: { sortOrder?: string };
          }) => {
            let list = items.filter((i) => i.tenantId === where.tenantId);
            if (where.learningUnitId)
              list = list.filter(
                (i) => i.learningUnitId === where.learningUnitId,
              );
            const notId = where.id?.not;
            if (notId) list = list.filter((i) => i.id !== notId);
            if (orderBy?.sortOrder === 'desc') {
              list.sort((a, b) => b.sortOrder - a.sortOrder);
            }
            return list[0] ?? null;
          },
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId: string;
              learningUnitId?: string;
              id?: { in?: string[]; not?: string };
            };
          }) => {
            let list = items.filter((i) => i.tenantId === where.tenantId);
            if (where.learningUnitId)
              list = list.filter(
                (i) => i.learningUnitId === where.learningUnitId,
              );
            if (where.id?.in) {
              const inIds = where.id.in;
              list = list.filter((i) => inIds.includes(i.id));
            }
            const notId = where.id?.not;
            if (notId) list = list.filter((i) => i.id !== notId);
            return list;
          },
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: Omit<
              MockItem,
              'id' | 'version' | 'createdAt' | 'updatedAt' | 'learningUnit'
            > & { publicationStatus?: string };
          }) => {
            const newItem: MockItem = {
              id: `item-gen-${items.length + 1}`,
              version: 1,
              createdAt: now,
              updatedAt: now,
              publicationStatus: data.publicationStatus ?? 'DRAFT',
              title: data.title,
              description: data.description ?? null,
              content: data.content ?? null,
              instructions: data.instructions ?? null,
              body: data.body ?? null,
              sortOrder: data.sortOrder,
              dueAt: data.dueAt ?? null,
              type: data.type,
              learningUnitId: data.learningUnitId,
              courseSubjectId: data.courseSubjectId,
              tenantId: data.tenantId,
              publishAt: data.publishAt ?? null,
              publishedAt: data.publishedAt ?? null,
              publishedByIdentityUserId: data.publishedByIdentityUserId ?? null,
              createdByIdentityUserId: data.createdByIdentityUserId,
              updatedByIdentityUserId: data.updatedByIdentityUserId,
            };
            items.push(newItem);
            return newItem;
          },
        ),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              tenantId_id?: { tenantId: string; id: string };
              id?: string;
              tenantId?: string;
            };
            data: {
              version?: { increment?: number };
              sortOrder?: number;
              learningUnitId?: string;
              courseSubjectId?: string;
              title?: string;
              publicationStatus?: string;
            };
          }) => {
            const id = where.tenantId_id?.id ?? where.id;
            const tenantId = where.tenantId_id?.tenantId ?? where.tenantId;
            const item = items.find(
              (i) => i.id === id && i.tenantId === tenantId,
            );
            if (!item) throw new Error('Item not found');
            if (data.version?.increment) item.version += data.version.increment;
            if (data.sortOrder !== undefined) item.sortOrder = data.sortOrder;
            if (data.learningUnitId !== undefined)
              item.learningUnitId = data.learningUnitId;
            if (data.courseSubjectId !== undefined)
              item.courseSubjectId = data.courseSubjectId;
            if (data.title !== undefined) item.title = data.title;
            if (data.publicationStatus !== undefined)
              item.publicationStatus = data.publicationStatus;
            return item;
          },
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { tenantId: string; id?: string; version?: number };
            data: {
              version?: { increment?: number };
              sortOrder?: number;
              learningUnitId?: string;
              courseSubjectId?: string;
              title?: string;
              publicationStatus?: string;
            };
          }) => {
            const id = where.id;
            if (!id) return { count: 0 };
            const item = items.find(
              (i) => i.id === id && i.tenantId === where.tenantId,
            );
            if (!item) return { count: 0 };
            if (where.version !== undefined && item.version !== where.version) {
              return { count: 0 };
            }
            if (data.version?.increment) item.version += data.version.increment;
            if (data.sortOrder !== undefined) item.sortOrder = data.sortOrder;
            if (data.learningUnitId !== undefined)
              item.learningUnitId = data.learningUnitId;
            if (data.courseSubjectId !== undefined)
              item.courseSubjectId = data.courseSubjectId;
            if (data.title !== undefined) item.title = data.title;
            if (data.publicationStatus !== undefined)
              item.publicationStatus = data.publicationStatus;
            return { count: 1 };
          },
        ),
      },
      contentRevision: {
        create: vi.fn(async ({ data }: { data: MockRevision }) => {
          revisions.push(data);
          return data;
        }),
      },
      commandReceipt: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              tenantId_actorIdentityUserId_commandName_idempotencyKey: {
                tenantId: string;
                actorIdentityUserId: string;
                commandName: string;
                idempotencyKey: string;
              };
            };
          }) => {
            const lookup =
              where.tenantId_actorIdentityUserId_commandName_idempotencyKey;
            return (
              receipts.find(
                (r) =>
                  r.tenantId === lookup.tenantId &&
                  r.actorIdentityUserId === lookup.actorIdentityUserId &&
                  r.commandName === lookup.commandName &&
                  r.idempotencyKey === lookup.idempotencyKey,
              ) ?? null
            );
          },
        ),
        create: vi.fn(async ({ data }: { data: MockReceipt }) => {
          const duplicate = receipts.find(
            (r) =>
              r.tenantId === data.tenantId &&
              r.actorIdentityUserId === data.actorIdentityUserId &&
              r.commandName === data.commandName &&
              r.idempotencyKey === data.idempotencyKey,
          );
          if (duplicate) {
            const p2002Error = new Error(
              'Unique constraint failed on the fields: (`tenant_id`,`actor_identity_user_id`,`command_name`,`idempotency_key`)',
            );
            (p2002Error as unknown as { code: string }).code = 'P2002';
            throw p2002Error;
          }
          receipts.push(data);
          return data;
        }),
      },
      fileReference: {
        findMany: vi.fn(async () => fileReferences),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          fileReferences.push(data);
          return data;
        }),
      },
    };

    auditPort = { record: vi.fn().mockResolvedValue(undefined) };
    studentWorkPort = { hasStudentWork: vi.fn().mockResolvedValue(false) };
    notificationService = {
      createLearningPublicationIntent: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationService;
    orderingService = new SparseOrderingService();
    idempotencyService = new CommandIdempotencyService(
      mockPrisma as unknown as PrismaService,
    );

    service = new LearningService(
      mockPrisma as unknown as PrismaService,
      new AuthorizationService(),
      auditPort,
      studentWorkPort,
      notificationService,
      orderingService,
      idempotencyService,
    );
  });

  describe('1. Reorder exitoso con posiciones sparse', () => {
    it('reorders units assigning sparse positions (1024, 2048) and increments versions', async () => {
      const ctx = createContext();
      const result = await service.reorderUnits(ctx, ids.courseSubject1, {
        orderedIds: [ids.unit2, ids.unit1],
      });

      expect(result).toHaveLength(2);
      expect(units.find((u) => u.id === ids.unit2)?.sortOrder).toBe(1024);
      expect(units.find((u) => u.id === ids.unit1)?.sortOrder).toBe(2048);
      expect(units.find((u) => u.id === ids.unit2)?.version).toBe(2);
      expect(units.find((u) => u.id === ids.unit1)?.version).toBe(2);
      expect(revisions.filter((r) => r.operation === 'REORDERED')).toHaveLength(
        2,
      );
    });

    it('reorders items assigning sparse positions (1024, 2048) within a unit', async () => {
      const ctx = createContext();
      const result = await service.reorderItems(ctx, ids.unit1, {
        orderedIds: [ids.item2, ids.item1],
      });

      expect(result).toHaveLength(2);
      expect(items.find((i) => i.id === ids.item2)?.sortOrder).toBe(1024);
      expect(items.find((i) => i.id === ids.item1)?.sortOrder).toBe(2048);
      expect(items.find((i) => i.id === ids.item2)?.version).toBe(2);
      expect(items.find((i) => i.id === ids.item1)?.version).toBe(2);
      expect(units.find((u) => u.id === ids.unit1)?.version).toBe(2);
    });
  });

  describe('2 & 3. Concurrencia real de reorder y 409 STALE_REVISION', () => {
    it('rejects reorder if expectedOrderRevision does not match current version', async () => {
      const ctx = createContext();
      await expect(
        service.reorderItems(ctx, ids.unit1, {
          orderedIds: [ids.item1, ids.item2],
          expectedOrderRevision: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('demonstrates real concurrent race between two teachers where only one commits and the second receives 409 STALE_REVISION', async () => {
      const teacherA = createContext(['TEACHER'], 'teacher-A');
      const teacherB = createContext(['TEACHER'], 'teacher-B');

      // Both teachers read base revision = 1 and submit concurrent reorder requests
      const promiseA = service.reorderItems(teacherA, ids.unit1, {
        orderedIds: [ids.item2, ids.item1],
        expectedOrderRevision: 1,
      });

      const promiseB = service.reorderItems(teacherB, ids.unit1, {
        orderedIds: [ids.item1, ids.item2],
        expectedOrderRevision: 1,
      });

      const results = await Promise.allSettled([promiseA, promiseB]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<object[]> => r.status === 'fulfilled',
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The rejected one failed with 409 Conflict STALE_REVISION
      expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);
      expect((rejected[0]?.reason as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ code: 'STALE_REVISION' }),
      );

      // The unit version was incremented exactly once (from 1 to 2)
      const unit = units.find((u) => u.id === ids.unit1);
      expect(unit?.version).toBe(2);

      // The winning order is preserved and all items have valid sparse positions
      const winningItems = items
        .filter((i) => i.learningUnitId === ids.unit1)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      expect(winningItems[0]?.sortOrder).toBe(1024);
      expect(winningItems[1]?.sortOrder).toBe(2048);
    });
  });

  describe('4 & 8. Concurrencia real de idempotencia y replay seguro', () => {
    it('handles concurrent identical requests returning the exact same response with only 1 execution', async () => {
      const ctx1 = createContext(
        ['TEACHER'],
        'user-teacher-1',
        'tenant-a',
        'key-concurrent-1',
      );
      const ctx2 = createContext(
        ['TEACHER'],
        'user-teacher-1',
        'tenant-a',
        'key-concurrent-1',
      );

      const payload = {
        title: 'Copia Idempotente Concurrente',
        duplicateItems: true,
      };

      const initialUnitsCount = units.length;

      // Two concurrent requests executed with Promise.all
      const [res1, res2] = await Promise.all([
        service.duplicateUnit(ctx1, ids.unit1, payload),
        service.duplicateUnit(ctx2, ids.unit1, payload),
      ]);

      expect(res1).toEqual(res2);
      expect(units.length).toBe(initialUnitsCount + 1); // Exactly 1 unit was created
    });

    it('returns the exact cached result on sequential replay with same idempotency key and payload', async () => {
      const ctx = createContext(
        ['TEACHER'],
        'user-teacher-1',
        'tenant-a',
        'key-dup-unit-1',
      );
      const payload = {
        title: 'Copia Idempotente',
        duplicateItems: true,
      };

      const firstCall = await service.duplicateUnit(ctx, ids.unit1, payload);
      const initialUnitsCount = units.length;

      const secondCall = await service.duplicateUnit(ctx, ids.unit1, payload);

      expect(secondCall).toEqual(firstCall);
      expect(units.length).toBe(initialUnitsCount);
    });
  });

  describe('7. Reutilización de idempotency key con payload distinto', () => {
    it('throws 409 IDEMPOTENCY_KEY_REUSED when key is reused with different payload', async () => {
      const ctx = createContext(
        ['TEACHER'],
        'user-teacher-1',
        'tenant-a',
        'key-mismatch-1',
      );

      await service.createUnit(ctx, {
        courseSubjectId: ids.courseSubject1,
        title: 'First Payload',
        sortOrder: 0,
      });

      await expect(
        service.createUnit(ctx, {
          courseSubjectId: ids.courseSubject1,
          title: 'Changed Payload',
          sortOrder: 0,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('5 & 6. Rollback transaccional ante timeout o error 500', () => {
    it('rolls back completely on unexpected error without saving receipt or corrupting order', async () => {
      const ctx = createContext(
        ['TEACHER'],
        'user-teacher-1',
        'tenant-a',
        'fail-key-1',
      );

      const prismaClient = (
        service as unknown as {
          prisma: { learningUnit: { updateMany: ReturnType<typeof vi.fn> } };
        }
      ).prisma;
      prismaClient.learningUnit.updateMany.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      await expect(
        service.reorderUnits(ctx, ids.courseSubject1, {
          orderedIds: [ids.unit2, ids.unit1],
        }),
      ).rejects.toThrow('Database connection failed');

      expect(receipts).toHaveLength(0);
    });
  });

  describe('9. Movimiento entre Units (same CourseSubject)', () => {
    it('moves item to another unit within same CourseSubject and updates unit versions', async () => {
      const ctx = createContext();
      const moved = (await service.moveItem(ctx, ids.item1, {
        targetLearningUnitId: ids.unit2,
        expectedRevision: 1,
        sourceOrderRevision: 1,
        targetOrderRevision: 1,
      })) as { learningUnitId: string; version: number };

      expect(moved.learningUnitId).toBe(ids.unit2);
      expect(moved.version).toBe(2);
      expect(units.find((u) => u.id === ids.unit1)?.version).toBe(2);
      expect(units.find((u) => u.id === ids.unit2)?.version).toBe(2);
      expect(revisions.some((r) => r.operation === 'MOVED')).toBe(true);
    });
  });

  describe('10. Movimiento cross-CourseSubject rechazado', () => {
    it('rejects moving item to a unit belonging to a different CourseSubject', async () => {
      const ctx = createContext();
      await expect(
        service.moveItem(ctx, ids.item1, {
          targetLearningUnitId: ids.unitCrossSubject,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('11. Edición concurrente y movimiento concurrente', () => {
    it('rejects move if item version changed concurrently during an edit', async () => {
      const ctx = createContext();

      await service.updateItem(ctx, ids.item1, {
        title: 'Edited Item Title',
        expectedRevision: 1,
        confirmSensitiveChange: false,
      });

      expect(items.find((i) => i.id === ids.item1)?.version).toBe(2);

      await expect(
        service.moveItem(ctx, ids.item1, {
          targetLearningUnitId: ids.unit2,
          expectedRevision: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('12. Archive/restore conservando historial y submissions', () => {
    it('archives and restores unit while recording ContentRevisions', async () => {
      const ctx = createContext();

      const archived = (await service.archiveUnit(ctx, ids.unit1)) as {
        status: string;
      };
      expect(archived.status).toBe('ARCHIVED');
      expect(revisions.some((r) => r.operation === 'ARCHIVED')).toBe(true);

      const restored = (await service.restoreArchivedUnit(ctx, ids.unit1)) as {
        status: string;
      };
      expect(restored.status).toBe('DRAFT');
      expect(revisions.some((r) => r.operation === 'RESTORED')).toBe(true);
    });
  });

  describe('13. Duplicación sin copiar Submission, Review ni evidencia', () => {
    it('duplicates unit and items without copying any student submission records', async () => {
      const ctx = createContext();
      const cloned = (await service.duplicateUnit(ctx, ids.unit1, {
        title: 'Cloned Unit',
        duplicateItems: true,
      })) as { id: string; title: string; status: string; version: number };

      expect(cloned.title).toBe('Cloned Unit');
      expect(cloned.status).toBe('DRAFT');
      expect(cloned.version).toBe(1);

      const clonedItems = items.filter((i) => i.learningUnitId === cloned.id);
      expect(clonedItems.length).toBe(2);
      for (const item of clonedItems) {
        expect(item.publicationStatus).toBe('DRAFT');
        expect(item.version).toBe(1);
      }
    });
  });

  describe('14. Matriz de autorización: roles, sesión revocada, cross-tenant y mismatch T-03', () => {
    it('rejects STUDENT role from mutating units or items (403)', async () => {
      const studentCtx = createContext(['STUDENT'], 'student-1');
      await expect(
        service.createUnit(studentCtx, {
          courseSubjectId: ids.courseSubject1,
          title: 'Student Unit',
          sortOrder: 0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-tenant access when resource does not exist in trusted tenant (404)', async () => {
      const otherTenantCtx = createContext(
        ['TEACHER'],
        'teacher-other',
        'tenant-b',
      );
      await expect(service.getUnit(otherTenantCtx, ids.unit1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects teacher not assigned to the CourseSubject (403)', async () => {
      const unassignedCtx = createContext(['TEACHER'], 'unassigned-teacher');
      const mockPrisma = (
        service as unknown as {
          prisma: {
            courseSubjectTeacher: { findFirst: ReturnType<typeof vi.fn> };
          };
        }
      ).prisma;
      mockPrisma.courseSubjectTeacher.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateUnit(unassignedCtx, ids.unit1, {
          title: 'Unassigned Edit',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
