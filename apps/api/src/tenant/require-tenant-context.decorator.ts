import { SetMetadata } from '@nestjs/common';

import { REQUIRES_TENANT_CONTEXT } from './tenant-context.constants';

export const RequireTenantContext = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_TENANT_CONTEXT, true);
