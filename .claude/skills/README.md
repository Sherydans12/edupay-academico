# Skill registry

This registers every Claude Code skill available to agents working in this
repository, and states plainly which ones are repository-vendored (tracked in
git, editable in PRs) versus official Claude Code plugin dependencies (managed
outside the repo by the plugin manager, referenced here only by identifier).

Design authority order (highest to lowest) — a skill's recommendation never
overrides anything above it:

1. Real product requirements / supported backend behavior
2. `apps/web/DESIGN.md`
3. Persona-specific design docs (`docs/design/*.md`)
4. Existing domain/contracts (route handlers, API schemas, DB models)
5. Existing `@edupay/ui` components / design tokens
6. Tenant branding configuration (`apps/web/.impeccable/design.json`)
7. AI design skills / heuristic tools (this table)

> Note: this repo does not have a root `PRODUCT.md`. The equivalent product
> context lives in `docs/design/STUDENT-EXPERIENCE.md` (persona brief) and
> `apps/web/DESIGN.md` (design system). If a root `PRODUCT.md` is added later,
> insert it above `apps/web/DESIGN.md` in the authority order.

| Skill | Source | Type | Purpose | When to use | Update mechanism | Notes |
|---|---|---|---|---|---|---|
| **impeccable** | Vendored at `.claude/skills/impeccable/` (SKILL.md declares `version: 4.1.1`, `license: Apache 2.0`) | Repository-vendored skill | Structured frontend design/critique workflow: shape, audit, critique, polish, harden, etc. | Any hands-on UI redesign, hierarchy/UX critique, or polish pass on an existing surface. Load `PRODUCT.md`-equivalent + `apps/web/DESIGN.md` + persona brief first (the skill's own `scripts/context.mjs` does this). | Replace the `.claude/skills/impeccable/` directory wholesale from upstream when updating; do not hand-edit vendor files. Re-run `git diff --stat` after update to confirm scope. | Do **not** run `impeccable init` — it can overwrite `apps/web/DESIGN.md` / `apps/web/.impeccable/design.json`, which are already intentional, hand-maintained project context. |
| **ui-ux-pro-max** | Vendored at `.claude/skills/ui-ux-pro-max/`. Upstream: [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (GitHub) — the authoritative source for updates. | Repository-vendored skill | Searchable design-intelligence reference: styles, palettes, font pairings, UX guidelines, icons, animation presets, chart types, stack guidance. | Consult as a heuristic/reference when choosing patterns, accessibility practices, typography, or responsive approaches. | Update by pulling the latest content from `nextlevelbuilder/ui-ux-pro-max-skill` and replacing the vendored directory (including `LICENSE`) wholesale; do not hand-edit vendor files. Re-run `git diff --stat` to confirm scope after updating. | **Advisory only.** It may suggest patterns but must never override EduPay's existing design system, tenant branding, or product requirements — see authority order above. |
| **frontend-design** | Official Anthropic plugin, marketplace `claude-plugins-official` (`anthropics/claude-plugins-official`) | Claude official plugin dependency (NOT vendored) | High-level aesthetic direction / distinctive visual design guidance for new or reshaped UI. | Early in a design pass, for overall frontend direction, before detailed `impeccable` critique work. | Managed by Claude Code's plugin manager, not this repo. See install/verify commands below. | Installed **user-scope** on this machine (`~/.claude/plugins/...`), not project-scope. Its plugin cache lives outside the repository and is owned by the plugin manager — do not copy those internals into git. |

## `frontend-design`: plugin identifier and verification

Installed today as a **user-scope** plugin (confirmed via
`~/.claude/plugins/installed_plugins.json`):

- Plugin identifier: `frontend-design@claude-plugins-official`
- Marketplace: `claude-plugins-official` → `anthropics/claude-plugins-official` (GitHub)
- Install path (this machine, user scope): `~/.claude/plugins/cache/claude-plugins-official/frontend-design/`

Install / verify commands:

```
# add the marketplace (one-time, user scope)
/plugin marketplace add anthropics/claude-plugins-official

# install the skill/plugin
/plugin install frontend-design@claude-plugins-official

# verify it's installed and available to the current session
/plugin list
```

Claude Code project-local skill discovery only looks at `.claude/skills/**`
inside the repository (confirmed by how `impeccable` and `ui-ux-pro-max` are
discovered here). Plugin-installed skills are resolved from the user's global
plugin cache, not from a project directory, and the plugin manager does not
currently expose a supported "install this plugin project-locally, version it
in git" mode. Vendoring the plugin's cached internals into this repo would mean
carrying files this repo doesn't own and that the plugin manager would
immediately consider stale on the next update — so `frontend-design` is
documented here as a **plugin dependency**, not copied into `.claude/skills/`.
If Claude Code later ships supported project-scoped plugin installs, revisit
this decision.

## `ui-ux-pro-max`: license and provenance

- **Source:** `nextlevelbuilder/ui-ux-pro-max-skill` (GitHub) — authoritative
  update source.
- **License:** MIT.
- **Copyright:** Copyright (c) 2024 Next Level Builder.
- Verified directly against the upstream repository's `LICENSE` file (GitHub
  API `license` metadata reports `spdx_id: MIT`), not inferred from package
  metadata. The exact MIT text and copyright notice are preserved unmodified
  at `.claude/skills/ui-ux-pro-max/LICENSE`.
- **Provenance:** `skills-lock.json` at the repo root records
  `source: "nextlevelbuilder/ui-ux-pro-max-skill"` and a `computedHash` of the
  vendored `SKILL.md`. That hash is the reliable pin for what was actually
  installed. The installation tooling did not retain an exact upstream git
  SHA for the vendored copy, so none is claimed here — a source URL plus MIT
  license and the recorded content hash are sufficient provenance. (For
  reference only, not a claim of correspondence: upstream `main` was at
  `8a1a6d857332da32252d77365da90c3f6293b47b` at verification time.)

## Repository hygiene

Both vendored skills were reviewed for disposable generated artifacts
(installer caches, archives, nested `node_modules`, logs, OS files). None were
found — `.claude/skills/impeccable/` and `.claude/skills/ui-ux-pro-max/`
contain only skill source (`SKILL.md`, `reference/`, `scripts/`, `data/`).
Nothing was removed.

## Security

Skill scripts were scanned for committed credentials (API keys, tokens, SSH
keys, passwords). None found. Skills are developer tooling; do not pass
production secrets or credentials to a design skill or agent unless an
explicitly authorized operational task requires it (see `.claude/README.md`).
