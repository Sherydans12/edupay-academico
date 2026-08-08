import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import type { TrustedTenantContext } from '../tenant/trusted-tenant-context';

declare global {
  namespace Express {
    interface Request {
      principal?: TrustedIdentityPrincipal;
      requestId?: string;
      tenantContext?: TrustedTenantContext;
    }
  }
}

export {};
