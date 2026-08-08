import { applyDecorators, SetMetadata } from '@nestjs/common';

import { RequireTenantContext } from '../tenant/require-tenant-context.decorator';
import { REQUIRES_CURRENT_IDENTITY_STATUS } from './high-risk-identity.constants';

export const RequireCurrentIdentityStatus = (): MethodDecorator &
  ClassDecorator =>
  applyDecorators(
    RequireTenantContext(),
    SetMetadata(REQUIRES_CURRENT_IDENTITY_STATUS, true),
  );
