# Pilot production environment matrix

Status: deployment template; final hostnames, providers, regions, and support
ownership remain operator decisions under D-15. Pilot audit/support policy and
success targets are fixed by ADR-0019 and ADR-0020.

Do not commit the final pilot domains or secret values. Replace each
`<placeholder>` in managed deployment configuration and record the resulting
values in the release evidence.

## Public and private endpoints

| Setting | Académico value | Identity value | Requirement |
| --- | --- | --- | --- |
| Academic web public origin | `https://<academico-web-hostname>` | `IDENTITY_PUBLIC_BASE_URL=https://<academico-web-hostname>` | The Academic web origin serves `/activate` and `/reset-password` links. |
| Academic API public origin | `https://<academico-api-hostname>` | — | Browser API base is `https://<academico-api-hostname>/api/v1`. |
| Identity public API origin | — | `https://<identity-api-hostname>` | Browser login, refresh, logout, activation, recovery, and membership calls use this origin. |
| Identity internal API base | `https://<identity-private-or-internal-hostname>` | — | Académico-only restricted status/link calls; use a private network address where available. |
| Academic API CORS | `ACADEMIC_TRUSTED_WEB_ORIGINS=https://<academico-web-hostname>` | — | Exact origins only; no wildcard, path, query, or fragment. |
| Identity browser CORS | — | `IDENTITY_TRUSTED_WEB_ORIGINS=https://<academico-web-hostname>` | Exact Academic web origin only; credentials enabled by Identity. |
| Academic API liveness | `https://<academico-api-hostname>/api/v1/health/live` | — | Public, secret-free process check. `/api/v1/health` remains a compatibility alias. |
| Academic API readiness | `https://<academico-api-hostname>/api/v1/health/ready` | — | Public, secret-free database and private-storage dependency check. |
| Academic web liveness | `https://<academico-web-hostname>/api/health` | — | Public, secret-free Next.js process check. |
| Identity liveness | — | `https://<identity-api-hostname>/api/v1/identity/health` | Existing Identity endpoint; it is liveness only. |
| Identity JWKS | — | `https://<identity-api-hostname>/.well-known/jwks.json` | Public keys only; issuer and key ID must match deployment evidence. |

## JWT and session values

| Setting | Value to coordinate | Validation |
| --- | --- | --- |
| `IDENTITY_ISSUER` | `https://<identity-api-hostname>` | Must equal the JWT `iss` claim and use HTTPS in production. |
| `IDENTITY_AUDIENCE` / `JWT_AUDIENCE` | `edupay-academico-api` | Must equal the JWT `aud` claim and Académico configuration. |
| `IDENTITY_JWKS_URI` | `https://<identity-api-hostname>/.well-known/jwks.json` | Must be reachable from the Academic API private network. |
| Access-token lifetime | At most 600 seconds | Identity and Académico contract; do not extend for the pilot. |
| Refresh cookie | Identity `__Host-edupay-refresh` | `HttpOnly`, `Secure`, `Path=/`, host-only, no `Domain`. |
| `IDENTITY_REFRESH_COOKIE_SAMESITE` | `lax` for same-site subdomains; `none` only when an explicitly cross-site deployment requires it | `none` requires `IDENTITY_COOKIE_SECURE=true`; production always requires Secure cookies. |

## Email and storage values

| Setting | Académico | Identity |
| --- | --- | --- |
| Email sender secret | `ACADEMIC_RESEND_API_KEY` | `RESEND_API_KEY` |
| Email sender/from | `ACADEMIC_EMAIL_FROM`, optional reply-to | `IDENTITY_EMAIL_FROM` |
| Public link base | `ACADEMIC_PUBLIC_BASE_URL=https://<academico-web-hostname>` | `IDENTITY_PUBLIC_BASE_URL=https://<academico-web-hostname>` |
| Final private files | `/var/lib/edupay-academico/files` | — |
| Staging/temp files | `/var/lib/edupay-academico/tmp` | — |
| Physical guard | `STORAGE_MIN_FREE_BYTES` and `STORAGE_MIN_FREE_PERCENTAGE` | — |

Production Académico startup rejects missing or relative storage paths, missing
physical guard values, equal final/temp paths, insecure Identity endpoints,
fake email mode, and an empty web-origin allowlist. Production web builds
reject HTTP API or Identity URLs. Identity startup rejects insecure cookies,
an empty trusted-origin allowlist, and an absent current Académico service
token.

## Deployment checklist

- [ ] Final web, Academic API, and Identity API origins are approved and use HTTPS.
- [ ] The exact Academic web origin is present in both CORS allowlists; no wildcard remains.
- [ ] The activation/recovery public base is the Academic web origin, not the Identity API origin.
- [ ] `IDENTITY_ISSUER`, audience, JWKS URI, and key ID are recorded in release evidence.
- [ ] SameSite behavior has been tested in the chosen hostnames; no Secure-cookie workaround is used.
- [ ] Internal Identity traffic uses a private network path or HTTPS and carries no browser `Origin`.
- [ ] The shared service token is present only in the two server-side secret stores.
- [ ] The Academic final and staging directories are separate writable mounts and are not public/static mounts.
- [ ] Resend sender domains and reply-to values are approved; no real provider is contacted by ordinary CI.
