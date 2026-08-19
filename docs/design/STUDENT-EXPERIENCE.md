# Student experience design notes

This complements `apps/web/DESIGN.md` (tokens, components, responsive rules) with
decisions specific to the Student persona. Teacher and Admin keep their own
passes later; nothing here should be read as governing those roles.

## Principle: white is the surface, brand is the accent

Student screens read as a calm study workspace, not a colored dashboard.
Concretely: the dashboard "next step" panel (`.student-next`) is a white,
bordered card — not a solid brand-color hero. Brand color is reserved for the
primary CTA, the warning-tone "Próxima entrega" badge, active-route markers,
and small identity touches (subject initials, progress fill). This mirrors
`DESIGN.md`'s own "Ambient-First Rule" and "The Next Step First Rule"; the
change is not adding new tokens, only spending less surface on the ones that
already exist.

## Information hierarchy

`/estudiante` priority order: next deliverable → upcoming deadlines → subjects
→ nothing else. No subject/activity/completion counters were added — the
existing screens already avoid business-analytics-style KPI tiles, and that
should stay true as the dashboard evolves.

## Mis entregas and Calendario are real screens now

Both routes were wired to `StudentPlaceholderScreen` ("not implemented yet").
They now render real data:

- **Mis entregas** (`StudentDeliverablesScreen` in `student-screens.tsx`)
  aggregates every ASSIGNMENT/ASSESSMENT item visible to the student across
  subjects, fetches the student's own submission per item
  (`getOwnSubmission`, 404 → not yet submitted), and groups into three
  sections: *Requiere tu atención* (nothing submitted yet, or the teacher
  requested changes), *En revisión* (submitted, awaiting review), *Revisadas*
  (review complete). Status labels and tone map 1:1 onto
  `submissionStatusSchema` (`PENDING` implied / `SUBMITTED` / `REVIEWED` /
  `CHANGES_REQUESTED`) plus the revision-level `isLate` flag — no invented
  states, no grading language.
- **Calendario** (`StudentCalendarScreen`) is a chronological agenda grouped
  by local calendar day ("Hoy" / "Mañana" / weekday), not a month grid. There
  is no scheduling domain beyond `dueAt` on learning items, so a list is the
  honest representation on both desktop and mobile; a fabricated grid would
  imply data the backend doesn't have.

Both screens reuse the existing `.submission-row` / `.learning-item` row
patterns instead of introducing new card components, so they visually match
the rest of the Student surfaces without new CSS surface area.

## Fixed: two screens disagreed with each other

`/estudiante/asignaturas` previously rendered `StudentAcademicSubjectsScreen`
(`academic-context-screens.tsx`), a differently-styled card grid that also
exposed internal vocabulary to students ("Aprendizaje conectado al Learning
API", "CourseSubjects efectivos"). The dashboard's own subject preview linked
to that page but used a different, calmer card style
(`SubjectCard`/`.subject-grid`). The route now renders `StudentSubjectsScreen`
(already implemented, previously dead code) so the full page matches the
dashboard preview, and its copy no longer names internal domain concepts.
`StudentAcademicSubjectsScreen` and its test were removed; the Teacher
variant in the same file is untouched.

## Student UX vocabulary

Use "Asignatura", "Actividad", "Evaluación", "Entrega", "Archivo", "Fecha
límite" — never "CourseSubject", "LearningItem", "SubmissionRevision" in
copy. Grading, attendance, and finance are out of MVP scope; don't imply them
through status copy.

## STUDENT_UX_BACKEND_GAP

None found. Every screen in this pass is backed by an existing API method
(`getStudentContextSubjects`, `getLearningRoute`, `getOwnSubmission`). No
backend, contract, or schema change was needed for Mis entregas or
Calendario.
