# @edupay/ui

Tenant-neutral semantic design tokens and accessible React primitives for
EduPay Académico. Components consume semantic CSS custom properties and never
branch on tenant names. Import `@edupay/ui/styles.css` once at the application
root, then apply a safe default or configured tenant theme with `TenantTheme`.

The first configured tenant theme is `colegio-conquistadores`; the default theme
remains available whenever configuration is absent or invalid.
