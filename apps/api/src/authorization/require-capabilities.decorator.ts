import { applyDecorators, SetMetadata } from '@nestjs/common';

import { RequireTenantContext } from '../tenant/require-tenant-context.decorator';
import { REQUIRED_CAPABILITIES } from './authorization.constants';
import type { TenantCapability } from './authorization.types';

export const RequireCapabilities = (
  ...capabilities: readonly TenantCapability[]
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    RequireTenantContext(),
    SetMetadata(REQUIRED_CAPABILITIES, capabilities),
  );
