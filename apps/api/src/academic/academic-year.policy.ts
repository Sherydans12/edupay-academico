import { ConflictException } from '@nestjs/common';
import type { AcademicYearStatus } from '../generated/prisma/client';

export function requireAcademicYearMutable(status: AcademicYearStatus): void {
  if (status === 'CLOSED' || status === 'ARCHIVED') {
    throw new ConflictException('The academic year is read-only.');
  }
}
