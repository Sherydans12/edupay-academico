# Frontend architecture

Status: proposed Next.js 16 App Router architecture

## Application structure

Use Next.js 16 App Router with route groups organized around user intent and tenant context, for example:

- authenticated shell;
- student workspace;
- teacher workspace;
- tenant administration;
- platform support;
- authentication and invitation entry points.

The exact folder layout is an implementation detail and should follow the approved monorepo convention.

## Rendering and data access

- Prefer server-rendered data for authenticated pages and initial navigation.
- Use client components only for interaction-heavy controls such as forms, upload progress, sorting, and inline state changes.
- Fetch academic data through the API boundary; do not connect the browser to PostgreSQL, object storage, or the existing EduPay system.
- Treat authorization as server-owned even if route visibility is also mirrored in the UI.
- Invalidate/revalidate data after mutations using a consistent policy.

## Forms and validation

- React Hook Form manages interaction state.
- Zod validates user input at the boundary; server validation remains authoritative.
- Upload forms must show progress, file constraints, pending/failed states, and recovery actions.
- Error messages are actionable and do not expose security-sensitive details.

## Responsive experience

The main student loop—find subject, open item, upload work, see review—must work on narrow mobile screens and desktop. Tables should have a mobile alternative; horizontal overflow is not the only responsive strategy.

## Accessibility

- Keyboard navigation and visible focus states.
- Semantic headings and landmarks.
- Labels and error associations for forms.
- Accessible upload status and notification announcements.
- Sufficient color contrast and non-color status indicators.
- Reduced-motion behavior for interactive feedback.

## Frontend security boundaries

- Do not place refresh tokens or sensitive credentials in browser-accessible storage unless the Identity contract explicitly requires it and the threat model accepts it.
- Do not assume route hiding is authorization.
- Avoid rendering untrusted HTML without a reviewed sanitizer/content policy.
- Never expose private storage keys or provider secrets to the browser.

## Observability and UX states

Every major screen must define loading, empty, error, permission-denied, stale, and success states. Correlation/request IDs should be available to support without exposing internal logs to students.
