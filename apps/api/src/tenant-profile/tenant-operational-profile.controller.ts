import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import {
  tenantOperationalProfileSchema,
  updateTenantOperationalProfileSchema,
  type UpdateTenantOperationalProfile,
} from '@edupay/contracts';

import type { AcademicRequestContext } from '../academic/academic-context';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { TenantCapability } from '../authorization/authorization.types';
import {
  ContractBody,
  ContractResponse,
} from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { RequireCurrentIdentityStatus } from '../identity/require-current-identity-status.decorator';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { TenantOperationalProfileService } from './tenant-operational-profile.service';

@Controller('tenant/operational-profile')
@RequireCapabilities(TenantCapability.AccessTenant)
export class TenantOperationalProfileController {
  constructor(
    private readonly profiles: TenantOperationalProfileService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ContractResponse(tenantOperationalProfileSchema)
  get() {
    return this.profiles.get(this.context());
  }

  @Patch()
  @RequireCapabilities(TenantCapability.AdministerAcademicStructure)
  @RequireCurrentIdentityStatus()
  @Header('Cache-Control', 'private, no-store')
  @ContractBody(updateTenantOperationalProfileSchema)
  @ContractResponse(tenantOperationalProfileSchema)
  update(
    @Body(new ZodValidationPipe(updateTenantOperationalProfileSchema))
    input: UpdateTenantOperationalProfile,
  ) {
    return this.profiles.update(this.context(), input);
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      tenant: this.current.tenant(),
      requestId: this.current.requestId(),
    };
  }
}
