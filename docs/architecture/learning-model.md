# Learning model

Status: proposed MVP content model

## Hierarchy

```text
CourseSubject
└── Learning Unit
    └── Learning Item
        ├── MATERIAL
        ├── ASSIGNMENT
        ├── ASSESSMENT
        └── ANNOUNCEMENT
```

### Subject

The reusable tenant-level catalog entry. It provides the academic identity of
the offering but does not own teachers, students, learning units, or content.

### CourseSubject

The course-specific offering/context that links a Course to a Subject. Teachers,
student access, learning units, and content are attached to this context. A
single Subject may therefore have different CourseSubjects, teachers, materials,
and timelines across courses.

### Learning unit

An ordered organizational container such as a topic, module, or period. It should support a title, description, ordering, visibility/lifecycle state, and tenant ownership.

### Learning item

A typed unit with common metadata:

- title and optional description/instructions;
- parent learning unit and CourseSubject context;
- ordering;
- draft/published/archived lifecycle proposal;
- optional availability dates;
- created/updated metadata;
- attachment references where applicable.

## Item types

| Type | MVP behavior |
| --- | --- |
| `MATERIAL` | Readable content and optional files/links for student study. |
| `ASSIGNMENT` | Instructions, optional attachments, deadline, and student file submission. |
| `ASSESSMENT` | Document-based instructions, attachments, deadline, and file submission; no exam engine or grade. |
| `ANNOUNCEMENT` | Teacher/tenant communication displayed in the appropriate CourseSubject context; no submission. |

`ASSESSMENT` is intentionally a content/work type, not an online question bank or automatic evaluation model.

## Publication and visibility

Proposed baseline:

- teachers work on drafts;
- only published items are visible to students;
- archived items are retained for history but removed from active navigation;
- an item with a deadline should preserve the effective deadline used for already-created submissions;
- edits to instructions or attachments after submission require audit history.

The exact edit-after-publication policy is unresolved.

## Ordering and presentation

- CourseSubject navigation is stable and predictable on mobile and desktop.
- Units and items have explicit ordering values rather than relying on creation time.
- A future reordering operation must be scoped to one CourseSubject/unit and be idempotent.
- The content model should not assume a single teacher or a single content author.

## Content safety

User-provided text must be validated and rendered through an approved safe-content path. Attachments use the file-storage policy. Links should be treated as untrusted external navigation and may require future tenant policy.
