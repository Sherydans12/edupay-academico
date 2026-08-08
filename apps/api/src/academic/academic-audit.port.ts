import { Injectable, Logger } from '@nestjs/common';

import type { AcademicRequestContext } from './academic-context';

export const ACADEMIC_AUDIT_PORT = Symbol('ACADEMIC_AUDIT_PORT');

export interface AcademicAuditEvent {
  readonly action: string;
  readonly context: AcademicRequestContext;
  readonly courseSubjectId?: string;
  readonly resourceId: string;
  readonly resourceType: string;
}

export interface AcademicAuditPort {
  record(event: AcademicAuditEvent): Promise<void>;
}

/**
 * Correlation-capable default until D-17 defines durable retention and read
 * policy. It intentionally records no before/after profile data.
 */
@Injectable()
export class CorrelatedAcademicAuditLogger implements AcademicAuditPort {
  private readonly logger = new Logger('AcademicAudit');

  record(event: AcademicAuditEvent): Promise<void> {
    this.logger.log({
      action: event.action,
      actorIdentityUserId: event.context.principal.identityUserId,
      courseSubjectId: event.courseSubjectId,
      membershipId: event.context.tenant.membershipId,
      requestId: event.context.requestId,
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      sessionId: event.context.tenant.sessionId,
      tenantId: event.context.tenant.tenantId,
    });
    return Promise.resolve();
  }
}
