# Multitenancy rules

Status: mandatory security architecture

Tenant isolation is a non-negotiable property. The application must be designed so a client cannot select an arbitrary tenant by changing a request parameter.

## Tenant context

1. Authenticate the request through EduPay Identity.
2. Resolve the effective membership and role from the authenticated session/token and Identity data.
3. Establish a trusted request-scoped tenant context.
4. Authorize the requested resource inside that context.
5. Execute tenant-scoped queries and storage operations.

`tenantId` in a URL, body, query string, header, or hidden form field is a selector at most; it is never authorization context. If it conflicts with the trusted context, reject the request or ignore the client value according to the approved API convention.

## Persistence rules

- Every tenant-owned table includes `tenantId`.
- Repository/query APIs require tenant context for tenant-owned reads and writes.
- Foreign-key relationships between tenant-owned records must prevent cross-tenant references.
- Unique constraints include `tenantId` unless the value is intentionally global.
- Background jobs carry a signed or server-created tenant context and never infer it from user input.
- Database migrations and administrative scripts must document any cross-tenant operation explicitly.

## File and cache rules

- Object keys begin with an internal tenant namespace and resource namespace.
- Signed URLs are short-lived and generated only after authorization.
- Cache keys include tenant identity and the relevant resource scope.
- Search indexes, exports, metrics, and logs must retain tenant attribution or be explicitly platform-wide.

## Elevated access

`SYSTEM_ADMIN` may operate across tenants only through an explicit elevated action or support context that is audited. A system administrator should not silently inherit tenant access merely because the role is powerful.

## Failure and leakage prevention

- Missing tenant context fails closed.
- A resource lookup must not distinguish “exists in another tenant” from “does not exist” in a way that leaks information.
- Authorization checks happen again for file download and asynchronous work.
- Error responses must not include data from a rejected tenant.

## Required tests

- Same identifiers in two tenants cannot be confused.
- A user with membership in tenant A cannot read, mutate, notify, export, or download tenant B data.
- A user with memberships in A and B can switch only through an approved membership-selection flow.
- Worker retries preserve the original tenant scope.
- Provider callbacks cannot cause a cross-tenant write.
