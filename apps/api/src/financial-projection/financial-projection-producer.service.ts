import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
  academicFinancialProjectionSnapshotCompleteSchema,
  academicFinancialProjectionSnapshotPageSchema,
  academicFinancialProjectionSnapshotStartSchema,
  type AcademicFinancialProjectionSnapshotComplete,
  type AcademicFinancialProjectionSnapshotPage,
  type AcademicFinancialProjectionSnapshotQuery,
  type AcademicFinancialProjectionSnapshotStart,
} from '@edupay/contracts';
import type { Prisma } from '../generated/prisma/client';

import { PrismaService } from '../persistence/prisma.service';
import { FinancialProjectionConfigService } from './financial-projection-config.service';
import { FinancialProjectionOutboxService } from './financial-projection-outbox.service';

type SnapshotCursor = {
  readonly snapshotToken: string;
  readonly ordinal: number;
};

@Injectable()
export class FinancialProjectionProducerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: FinancialProjectionConfigService,
    private readonly outbox: FinancialProjectionOutboxService,
  ) {}

  async startSnapshot(
    canonicalTenantId: string,
  ): Promise<AcademicFinancialProjectionSnapshotStart> {
    const now = new Date();
    const token = randomUUID();
    const snapshotId = randomUUID();
    const expiresAt = new Date(
      now.getTime() + this.config.snapshotTtlMilliseconds(),
    );
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: canonicalTenantId },
        select: { id: true },
      });
      if (!tenant)
        throw new NotFoundException('The authorized tenant was not found.');

      const enrollments = await tx.courseEnrollment.findMany({
        where: { tenantId: canonicalTenantId },
        include: { course: { select: { academicYearId: true } } },
        orderBy: { id: 'asc' },
      });
      const lastEvent = await tx.financialProjectionOutboxEvent.findFirst({
        where: { tenantId: canonicalTenantId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const watermark = `outbox-sequence:${lastEvent?.sequence.toString() ?? '0'}`;
      await tx.financialProjectionSnapshot.create({
        data: {
          id: snapshotId,
          token,
          tenantId: canonicalTenantId,
          capturedAt: now,
          expiresAt,
          watermark,
          itemCount: enrollments.length,
        },
      });
      if (enrollments.length > 0) {
        await tx.financialProjectionSnapshotItem.createMany({
          data: enrollments.map((enrollment, index) => ({
            snapshotId,
            ordinal: index + 1,
            enrollmentId: enrollment.id,
            entityVersion: enrollment.financialProjectionVersion,
            payload: this.outbox.enrollmentPayload(
              enrollment,
            ) as unknown as Prisma.InputJsonValue,
          })),
        });
      }
      return { id: snapshotId, capturedAt: now };
    });

    return academicFinancialProjectionSnapshotStartSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshotToken: token,
      snapshot: {
        snapshotId: snapshot.id,
        canonicalTenantId,
        capturedAt: snapshot.capturedAt.toISOString(),
        entity: 'ACADEMIC_ENROLLMENT',
        complete: false,
      },
    });
  }

  async listSnapshotEnrollments(
    canonicalTenantId: string,
    snapshotToken: string,
    query: AcademicFinancialProjectionSnapshotQuery,
  ): Promise<AcademicFinancialProjectionSnapshotPage> {
    const snapshot = await this.snapshot(canonicalTenantId, snapshotToken);
    const boundary = query.cursor
      ? this.decodeCursor(query.cursor, snapshotToken).ordinal
      : 0;
    const items = await this.prisma.financialProjectionSnapshotItem.findMany({
      where: { snapshotId: snapshot.id, ordinal: { gt: boundary } },
      orderBy: { ordinal: 'asc' },
      take: query.limit + 1,
    });
    const hasMore = items.length > query.limit;
    const visible = hasMore ? items.slice(0, query.limit) : items;
    const last = visible.at(-1);
    const complete = !hasMore;
    if (complete) {
      await this.prisma.financialProjectionSnapshot.updateMany({
        where: { id: snapshot.id, completedAt: null },
        data: { completedAt: new Date() },
      });
    }

    return academicFinancialProjectionSnapshotPageSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshot: {
        snapshotId: snapshot.id,
        canonicalTenantId,
        capturedAt: snapshot.capturedAt.toISOString(),
        entity: 'ACADEMIC_ENROLLMENT',
        complete,
      },
      items: visible.map((item) => item.payload),
      page: {
        limit: query.limit,
        itemCount: visible.length,
        nextCursor:
          last && hasMore
            ? this.encodeCursor(snapshotToken, last.ordinal)
            : null,
        complete,
      },
      watermark: {
        value: complete ? snapshot.watermark : null,
        available: complete,
      },
    });
  }

  async completeSnapshot(
    canonicalTenantId: string,
    snapshotToken: string,
  ): Promise<AcademicFinancialProjectionSnapshotComplete> {
    const snapshot = await this.snapshot(canonicalTenantId, snapshotToken);
    await this.prisma.financialProjectionSnapshot.updateMany({
      where: { id: snapshot.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    return academicFinancialProjectionSnapshotCompleteSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshot: {
        snapshotId: snapshot.id,
        canonicalTenantId,
        capturedAt: snapshot.capturedAt.toISOString(),
        entity: 'ACADEMIC_ENROLLMENT',
        complete: true,
      },
      watermark: snapshot.watermark,
      completedAt: new Date().toISOString(),
    });
  }

  private async snapshot(canonicalTenantId: string, token: string) {
    const snapshot = await this.prisma.financialProjectionSnapshot.findUnique({
      where: { token },
    });
    if (!snapshot || snapshot.expiresAt <= new Date()) {
      throw new NotFoundException('The requested snapshot is not available.');
    }
    if (snapshot.tenantId !== canonicalTenantId) {
      throw new ForbiddenException(
        'The requested snapshot tenant is not authorized.',
      );
    }
    return snapshot;
  }

  private encodeCursor(snapshotToken: string, ordinal: number): string {
    const encoded = Buffer.from(
      JSON.stringify({ snapshotToken, ordinal }),
    ).toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  private decodeCursor(
    cursor: string,
    expectedSnapshotToken: string,
  ): SnapshotCursor {
    const [encoded, signature, extra] = cursor.split('.');
    if (
      !encoded ||
      !signature ||
      extra ||
      !this.signatureMatches(encoded, signature)
    ) {
      throw new BadRequestException(
        'The financial projection cursor is invalid.',
      );
    }
    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<SnapshotCursor>;
      if (
        parsed.snapshotToken !== expectedSnapshotToken ||
        !Number.isInteger(parsed.ordinal) ||
        (parsed.ordinal ?? 0) < 0
      ) {
        throw new Error('invalid cursor binding');
      }
      return { snapshotToken: expectedSnapshotToken, ordinal: parsed.ordinal! };
    } catch {
      throw new BadRequestException(
        'The financial projection cursor is invalid.',
      );
    }
  }

  private signature(value: string): string {
    return createHmac('sha256', this.config.cursorSecret())
      .update(value)
      .digest('base64url');
  }

  private signatureMatches(value: string, received: string): boolean {
    const expected = Buffer.from(this.signature(value));
    const actual = Buffer.from(received);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
