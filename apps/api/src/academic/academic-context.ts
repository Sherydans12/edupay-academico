import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import type { TrustedTenantContext } from '../tenant/trusted-tenant-context';

export interface AcademicRequestContext {
  readonly principal: TrustedIdentityPrincipal;
  readonly requestId: string;
  readonly tenant: TrustedTenantContext;
}
