# Design system

Status: proposed product design foundation; tenant branding inputs pending

## Experience direction

The interface should be educational, modern, interactive, warm, highly usable, and responsive on mobile and desktop. Visual hierarchy should help a student answer “what do I need to do next?” quickly and help a teacher manage work without administrative clutter.

## Tenant theming

Brand-specific styling is configuration, not a business-specific component fork. Tenant theme/design tokens should cover at least:

- color roles such as primary, accent, surface, text, success, warning, and error;
- typography choices and scale constraints;
- logo/wordmark assets;
- border radius and elevation preferences within accessibility limits;
- optional navigation or terminology overrides.

Components consume semantic tokens. They do not contain Colegio Conquistadores names, logos, or hard-coded colors. A safe default theme is required when tenant configuration is missing or invalid.

## Component foundations

Prioritize a small, consistent set:

- application shell and responsive navigation;
- subject and learning-unit navigation;
- item cards and status badges;
- deadline and late indicators;
- file picker/upload list;
- submission timeline and review panel;
- notification list and unread state;
- forms, dialogs, toasts, empty/error states;
- accessible table/list alternatives.

## Interaction principles

- Make deadline, submission state, and requested action visible without relying on color alone.
- Preserve user input during recoverable failures.
- Provide confirmation for destructive or irreversible actions.
- Prefer progressive disclosure for secondary metadata.
- Make mobile upload and review practical, not merely technically responsive.

## Content and terminology

UI labels should use student/teacher language and map to the canonical domain terms. Avoid calling a document-based assessment an “exam” unless the tenant explicitly chooses that copy and the behavior remains within MVP scope.

## Open design decisions

- Approved Colegio Conquistadores brand assets and accessibility-tested color palette.
- Localization/language requirements beyond the initial Spanish experience.
- Typography and icon licensing.
- Whether tenant admins can edit all theme tokens or only a curated subset.
