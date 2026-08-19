# `.claude/` — repository-local Claude Code configuration

This directory is intentionally committed to version control. It holds reusable
Claude Code project capabilities and design skills used for frontend/product
quality work on EduPay Académico. It is developer tooling, not application
code — nothing here ships to production.

## Purpose

- Give future Claude Code agents (and human contributors) a consistent,
  reviewable set of design/UX capabilities for repeated passes over each
  persona surface (Student, Teacher, Tenant Admin).
- Keep those capabilities in-repo so they version alongside the product,
  survive machine changes, and are auditable in PR review.

## Rules

- **Skills do not define product truth.** Read `apps/web/DESIGN.md`, the
  persona-specific brief under `docs/design/`, and `apps/web/.impeccable/design.json`
  before using any design skill. See `.claude/skills/README.md` and
  `docs/design/AI-DESIGN-WORKFLOW.md` for the authority order.
- Existing code and contracts define actual supported behavior. Do not invent
  backend capabilities merely because a UX skill recommends them.
- Do not expose secrets to design agents. Skills are developer tooling and
  must not receive production credentials unless an explicitly authorized
  operational task requires it.
- Design agents must not deploy production, merge to `main`, or touch
  `ops/pilot-production-deployment` unless explicitly assigned an operations
  role for that task.

## Persona workflow

Frontend/UX passes proceed one persona at a time, each on its own
feature branch:

1. **Student** — `feat/student-experience-polish` (current)
2. **Teacher** — `feat/teacher-experience-polish` (planned, not yet created)
3. **Tenant Admin** — `feat/admin-experience-polish` (planned, not yet created)

Each persona receives an independent UX/UI pass reviewed and integrated on
its own before the next persona starts. See
`docs/design/AI-DESIGN-WORKFLOW.md` for the full step-by-step sequence.

## Structure

```
.claude/
  README.md              this file
  settings.local.json     local-only, gitignored
  skills/
    README.md             skill registry: what each skill is, when to use it
    impeccable/            vendored skill (repository-local)
    ui-ux-pro-max/         vendored skill (repository-local)
```

The official Anthropic `frontend-design` skill is installed as a **user-scope
Claude Code plugin**, not vendored in this repository. See
`.claude/skills/README.md` for why, and the exact install/verify commands.
