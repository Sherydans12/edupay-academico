# AI-assisted frontend design workflow (EduPay Académico)

This is the recommended sequence for a Claude Code-assisted UX/UI pass over
one persona surface (Student, Teacher, or Tenant Admin). It exists so
repeated passes stay consistent and don't re-litigate decisions already made
elsewhere. See `.claude/skills/README.md` for what each skill is and the
design authority order it enforces.

## Sequence

1. **Establish persona/surface scope.** One persona per feature branch (see
   "Persona branches" below). Don't mix Student and Teacher changes in one
   pass.
2. **Read the product context.** This repo does not have a root `PRODUCT.md`;
   the closest equivalents are `docs/design/STUDENT-EXPERIENCE.md` (or the
   equivalent persona brief) and this repo's `docs/product/` directory.
3. **Read `apps/web/DESIGN.md`** — tokens, components, responsive rules. This
   is the design system of record.
4. **Read the persona-specific design brief** in `docs/design/` (e.g.
   `STUDENT-EXPERIENCE.md`).
5. **Inspect the actual implemented routes/components** for that persona
   before proposing changes — don't design against an assumed structure.
6. **Run the application** and view the current state of the surface being
   changed.
7. **Use `frontend-design`** (official plugin, see `.claude/skills/README.md`)
   for overall aesthetic direction when the pass involves new visual
   territory, not just refinement of existing screens.
8. **Use `impeccable`'s `shape` / `critique` commands** for hierarchy and UX
   decisions on the specific surface.
9. **Use `ui-ux-pro-max`** as a supporting heuristic/reference (patterns,
   accessibility, typography, responsive precedent) — advisory only, never
   authoritative over steps 2–4.
10. **Implement using existing `@edupay/ui` components and design tokens.**
    Do not introduce new one-off colors, spacing, or components when an
    existing token/component covers the case.
11. **Use `impeccable`'s `quieter`, `clarify`, `adapt`, `harden`, or `polish`
    commands** only where they apply — not as a mandatory checklist.
12. **Run desktop and mobile visual QA.**
13. **Run accessibility and regression tests** relevant to the changed
    surface.
14. **Commit on the persona-specific feature branch.**
15. **Integration/deployment is performed separately**, by a task explicitly
    scoped for it — a design pass does not merge itself or touch
    `ops/pilot-production-deployment`.

## `impeccable` command reference (EduPay usage)

| Command | Fits at step | Use for |
|---|---|---|
| `shape` | 8 | Turning a rough ask into a concrete UX direction/plan for a surface. |
| `critique` | 8 | Reviewing an existing screen's hierarchy, IA, and cognitive load before changing it. |
| `audit` | 12–13 | Systematic pass for anti-patterns, accessibility, and consistency issues. |
| `polish` | 11 | General visual/interaction refinement once structure is right. |
| `quieter` | 11 | Reducing visual noise on a surface that's louder than the "white surface, brand accent" principle calls for. |
| `distill` | 8 | Cutting a feature/screen down to its essential content and actions. |
| `harden` | 11 | Tightening edge cases, error states, and empty states. |
| `clarify` | 11 | Improving UX copy and reducing ambiguity in labels/microcopy. |
| `adapt` | 9–11 | Adjusting a pattern for a different viewport, density, or context. |
| `typeset` | 11 | Typography-specific pass (scale, pairing, rhythm). |
| `layout` | 8–11 | Structural spacing/grid decisions. |

Do not run `impeccable init` — see `.claude/skills/README.md` for why.

## Persona branches

- **Student** — `feat/student-experience-polish` (current; Student UX is
  frozen at commit `d207bb6e2c9fb99aed2b146dc19ac69daa74fe57` pending
  integration review — this workflow doc does not authorize further Student
  screen changes).
- **Teacher** — `feat/teacher-experience-polish` (planned, not yet created).
- **Tenant Admin** — `feat/admin-experience-polish` (planned, not yet
  created).

Branches are created when that persona's pass actually starts, not in
advance.

## Tenant theming: Colegio Conquistadores

Colegio Conquistadores is the initial tenant theme, but the frontend is
multi-tenant. For Student study surfaces specifically, white/light neutral
surfaces dominate and Colegio Conquistadores colors are accents — see
`docs/design/STUDENT-EXPERIENCE.md` for the concrete rule. Avoid hardcoding
tenant colors into domain components where an existing theme token
(`apps/web/.impeccable/design.json`, `apps/web/DESIGN.md`) already covers the
case; this keeps the same components correct for other tenants.

## Design authority order

See `.claude/skills/README.md` for the full authority order. In short: a
skill's suggestion never overrides real product/backend behavior, the design
system docs, or tenant branding configuration — it only fills gaps within
what those already allow.
