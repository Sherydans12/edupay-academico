# Product vision

Status: mandated direction with proposed success measures

## Vision

EduPay Académico gives students one clear online workspace for the subjects, materials, assignments, and document-based assessments they are expected to complete, while giving teachers a simple way to publish work, receive files, review them, and request corrections.

The product should feel like an approachable digital classroom workspace, not a replacement for Moodle and not a general-purpose school ERP.

## Initial users

- **Student**: finds assigned subjects, reads organized content, uploads work, sees deadlines, and responds to requested changes.
- **Teacher**: organizes subject content, creates work, reviews submissions, comments, and requests corrections.
- **Tenant administrator**: configures the school’s academic structure and access, and supervises operational setup.
- **System administrator**: supports the multi-tenant platform and controlled cross-tenant operations.

Guardian support is an architectural consideration only; it is not an MVP interface or permission set.

## Product principles

1. **Clarity before completeness**: a small number of obvious workflows is more valuable than a broad LMS feature set.
2. **Work-first learning**: the MVP optimizes for accessing instructions, doing work, and receiving feedback.
3. **Tenant-safe by default**: a user sees only the institution and academic records authorized by membership and resource policy.
4. **Human review**: teacher feedback and correction requests are first-class; automated grading is not part of this product phase.
5. **Integration without coupling**: existing EduPay data can seed the product through explicit contracts without sharing persistence.
6. **Brand through configuration**: tenant identity is represented through theme tokens and configuration, not forked components.

## Proposed success signals

These are measurement candidates, not committed targets:

- A student can reach an assigned item and submit files from a mobile device without training.
- A teacher can publish a learning item and review a submission in one short workflow.
- Late work is visible and accurately flagged without preventing submission.
- Tenant isolation tests and security review find no cross-tenant data or file access path.
- Colegio Conquistadores can operate the MVP with a documented manual fallback for any pending EduPay synchronization.

Target values, pilot cohort, and launch date remain unresolved.

## Explicit non-vision

EduPay Académico is not intended initially to be:

- an online exam engine;
- a gradebook or automatic grading system;
- a full curriculum, attendance, class-book, scheduling, or admissions system;
- a financial system;
- a chat or live-class platform;
- a native mobile application.
