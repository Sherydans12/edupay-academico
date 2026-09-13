import { randomUUID } from 'node:crypto';

import {
  ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
  academicFinancialProjectionEventSchema,
  academicFinancialProjectionSnapshotCompleteSchema,
  academicFinancialProjectionSnapshotPageSchema,
  academicFinancialProjectionSnapshotStartSchema,
  type AcademicFinancialProjectionEnrollment,
  type AcademicFinancialProjectionEvent,
  type AcademicFinancialProjectionSnapshotPage,
} from '@edupay/contracts';

export class FinancialProjectionContractFixture {
  private readonly snapshots = new Map<
    string,
    {
      snapshotId: string;
      canonicalTenantId: string;
      capturedAt: string;
      items: AcademicFinancialProjectionEnrollment[];
    }
  >();
  private readonly cursors = new Map<
    string,
    { snapshotToken: string; offset: number }
  >();
  private readonly seenEventIds = new Set<string>();
  private readonly highestEntityVersion = new Map<string, number>();

  constructor(
    private readonly items: AcademicFinancialProjectionEnrollment[],
  ) {}

  start(authorizedCanonicalTenantId: string) {
    const snapshotId = randomUUID();
    const snapshotToken = randomUUID();
    const capturedAt = '2026-09-03T12:00:00.000Z';
    this.snapshots.set(snapshotToken, {
      snapshotId,
      canonicalTenantId: authorizedCanonicalTenantId,
      capturedAt,
      items: this.items
        .filter(
          (item) => item.canonicalTenantId === authorizedCanonicalTenantId,
        )
        .sort((left, right) =>
          left.academicEnrollmentId.localeCompare(right.academicEnrollmentId),
        ),
    });
    return academicFinancialProjectionSnapshotStartSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshotToken,
      snapshot: {
        snapshotId,
        canonicalTenantId: authorizedCanonicalTenantId,
        capturedAt,
        entity: 'ACADEMIC_ENROLLMENT',
        complete: false,
      },
    });
  }

  page(input: {
    authorizedCanonicalTenantId: string;
    snapshotToken: string;
    cursor?: string;
    limit: number;
  }): AcademicFinancialProjectionSnapshotPage {
    const snapshot = this.requireSnapshot(
      input.authorizedCanonicalTenantId,
      input.snapshotToken,
    );
    const offset = input.cursor
      ? this.requireCursor(input.cursor, input.snapshotToken)
      : 0;
    const items = snapshot.items.slice(offset, offset + input.limit);
    const nextOffset = offset + items.length;
    const complete = nextOffset >= snapshot.items.length;
    const nextCursor = complete
      ? null
      : this.createCursor(input.snapshotToken, nextOffset);
    const watermark = complete ? `watermark:${snapshot.snapshotId}` : null;

    return academicFinancialProjectionSnapshotPageSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshot: {
        snapshotId: snapshot.snapshotId,
        canonicalTenantId: snapshot.canonicalTenantId,
        capturedAt: snapshot.capturedAt,
        entity: 'ACADEMIC_ENROLLMENT',
        complete,
      },
      items,
      page: {
        limit: input.limit,
        itemCount: items.length,
        nextCursor,
        complete,
      },
      watermark: { value: watermark, available: complete },
    });
  }

  complete(input: {
    authorizedCanonicalTenantId: string;
    snapshotToken: string;
  }) {
    const snapshot = this.requireSnapshot(
      input.authorizedCanonicalTenantId,
      input.snapshotToken,
    );
    return academicFinancialProjectionSnapshotCompleteSchema.parse({
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      snapshot: {
        snapshotId: snapshot.snapshotId,
        canonicalTenantId: snapshot.canonicalTenantId,
        capturedAt: snapshot.capturedAt,
        entity: 'ACADEMIC_ENROLLMENT',
        complete: true,
      },
      watermark: `watermark:${snapshot.snapshotId}`,
      completedAt: '2026-09-03T12:01:00.000Z',
    });
  }

  apply(
    event: AcademicFinancialProjectionEvent,
  ): 'APPLIED' | 'DUPLICATE' | 'STALE' {
    const parsed = academicFinancialProjectionEventSchema.parse(event);
    if (this.seenEventIds.has(parsed.eventId)) return 'DUPLICATE';
    this.seenEventIds.add(parsed.eventId);
    const currentVersion =
      this.highestEntityVersion.get(parsed.aggregateId) ?? 0;
    if (parsed.entityVersion <= currentVersion) return 'STALE';
    this.highestEntityVersion.set(parsed.aggregateId, parsed.entityVersion);
    return 'APPLIED';
  }

  private requireSnapshot(authorizedTenant: string, snapshotToken: string) {
    const snapshot = this.snapshots.get(snapshotToken);
    if (!snapshot) throw new Error('INVALID_SNAPSHOT');
    if (snapshot.canonicalTenantId !== authorizedTenant) {
      throw new Error('INTEGRATION_TENANT_FORBIDDEN');
    }
    return snapshot;
  }

  private requireCursor(cursor: string, snapshotToken: string): number {
    const decoded = this.cursors.get(cursor);
    if (!decoded || decoded.snapshotToken !== snapshotToken) {
      throw new Error('INVALID_CURSOR');
    }
    return decoded.offset;
  }

  private createCursor(snapshotToken: string, offset: number): string {
    const cursor = randomUUID();
    this.cursors.set(cursor, { snapshotToken, offset });
    return cursor;
  }
}
