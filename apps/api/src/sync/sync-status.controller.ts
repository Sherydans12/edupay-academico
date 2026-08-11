import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { syncStatusSchema } from '@edupay/contracts';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractResponse } from '../http/zod-response.interceptor';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { SyncStatusService } from './sync-status.service';

@ApiTags('EduPay synchronization')
@Controller('sync')
@RequireCapabilities(TenantCapability.AdministerAcademicStructure)
export class SyncStatusController {
  constructor(
    @Inject(SyncStatusService)
    private readonly status: SyncStatusService,
    @Inject(CurrentRequestContext)
    private readonly current: CurrentRequestContext,
  ) {}

  @Get('status')
  @ContractResponse(syncStatusSchema)
  getStatus(): Promise<object> {
    return this.status.forTenant(this.current.tenant().tenantId);
  }
}
