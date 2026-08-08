import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import type { TrustedTenantContext } from '../tenant/trusted-tenant-context';

export interface TenantOwnedResource {
  readonly tenantId: string;
}

export interface ResourcePolicyContext {
  readonly principal: TrustedIdentityPrincipal;
  readonly tenant: TrustedTenantContext;
}

/** Future academic modules provide these relationship/lifecycle policies. */
export interface ResourcePolicy<
  TResource extends TenantOwnedResource,
  TAction extends string,
> {
  evaluate(
    context: ResourcePolicyContext,
    action: TAction,
    resource: TResource,
  ): boolean | Promise<boolean>;
}
