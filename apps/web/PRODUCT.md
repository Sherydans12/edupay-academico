# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Students use a responsive academic workspace to find current work, continue through subjects, open instructions, submit files, and see teacher feedback.
- Teachers use a focused teaching workspace to organize assigned subjects, publish learning content, and review authorized submissions without unrelated administration dominating the experience.
- Tenant administrators configure academic structure and access inside their active tenant context.
- System administrators have no automatic tenant access; elevated tenant support is explicit, audited, and outside this frontend prototype.

## Product Purpose

EduPay Académico is a multi-tenant educational operating environment for the work-first learning loop: subject, learning unit, learning item, student submission, and human teacher review. The MVP succeeds when the complete loop is clear on mobile and desktop without becoming a broad LMS or school ERP.

## Positioning

The product combines a calm, school-branded learning route for students with a practical authoring and review workspace for teachers, while preserving strict tenant and Identity service boundaries.

## Operating Context

The initial experience is Spanish and the first tenant is Colegio Conquistadores. Students may work from phones as well as desktop devices. Teachers manage materials, assignments, document-based assessments, and announcements inside assigned subjects. Identity supplies trusted user and membership context; Académico does not own login credentials or refresh tokens.

## Capabilities and Constraints

- The approved hierarchy is Subject → Learning unit → Learning item.
- MVP learning-item types are material, assignment, document-based assessment, and announcement.
- The frontend calls reviewed APIs in future phases and never connects directly to databases, object storage, Identity tables, or the existing EduPay platform.
- Authorization remains server-owned even when navigation mirrors role context.
- Submission revision, draft, replacement, reviewed-state meaning, and post-review rules remain explicitly unresolved and must not be inferred by UI copy.
- Prototype screens use typed local view-model data clearly isolated from future integration.
- No grades, attendance, online exam engine, internal chat, guardian interface, or financial workflow belongs to the MVP.

## Brand Commitments

EduPay Académico must feel welcoming, educational, clear, interactive, professional, warm, and accessible—not like an ERP, marketing site, Moodle clone, or futuristic glass dashboard. Tenant branding is configuration rather than component forking. Colegio Conquistadores uses the owner-supplied institutional palette and Montserrat typography. Yellow is an attention accent and never carries white text. No crest may be invented; the interface uses a clearly marked asset slot until an approved logo file exists.

## Evidence on Hand

- Product, architecture, governance, and accepted ADR documentation under `docs/`.
- Owner-supplied Colegio Conquistadores palette and typography in the frontend foundation brief.
- No approved Colegio Conquistadores logo or crest asset was found in the repository; future work must replace the explicit asset slot with the approved file.
- Screen content is synthetic demonstration data and must not be represented as live academic data.

## Product Principles

1. Clarity before completeness.
2. Work-first learning with visible next actions.
3. Tenant-safe and server-authorized by default.
4. Human review without invented grading semantics.
5. Brand through semantic configuration, never component forks.

## Accessibility & Inclusion

The experience requires semantic landmarks and headings, visible labels, keyboard navigation, a strong accessible focus ring, non-color status cues, readable body sizing, reduced-motion support, approximately 44×44 px interactive targets, and responsive alternatives to desktop tables at representative widths from 375 px through 1440 px.
