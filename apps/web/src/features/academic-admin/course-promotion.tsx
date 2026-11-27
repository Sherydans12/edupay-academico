'use client';

import {
  courseEnrollmentPromotionOverrideLimit,
  type PromoteCourseEnrollments,
} from '@edupay/contracts';
import { Alert, Button, Dialog, EmptyState, Input, Select } from '@edupay/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';

import { errorMessage, type AdminData } from './shared';

type ScopeChange = { field: 'course' | 'year' | 'reload'; value?: string };

function rosterSearchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function CoursePromotionPanel({
  api,
  courses,
  academicYears,
  onSaved,
}: {
  api: AcademicApiClient;
  courses: AdminData['courses'];
  academicYears: AdminData['academicYears'];
  onSaved: () => void;
}) {
  type Decision =
    | 'PROMOTE'
    | 'REPEAT'
    | 'TRANSFER'
    | 'DEFER'
    | 'NO_CONTINUE'
    | 'SOURCE_MANAGED';
  type Choice = { targetCourseId: string | null; decision: Decision };
  type Draft = Awaited<
    ReturnType<AcademicApiClient['getCourseRolloverDraft']>
  >['draft'];
  type RosterItem = Awaited<
    ReturnType<AcademicApiClient['getCourseRoster']>
  >['items'][number];
  type RosterSummary = Awaited<
    ReturnType<AcademicApiClient['getCourseRosterSummary']>
  >;

  const sourceOptions = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.status === 'ACTIVE' &&
          academicYears.some(
            (year) =>
              year.id === course.academicYearId && year.status === 'ACTIVE',
          ),
      ),
    [academicYears, courses],
  );
  const [sourceCourseId, setSourceCourseId] = useState(
    sourceOptions[0]?.id ?? '',
  );
  const sourceCourse = sourceOptions.find(
    (course) => course.id === sourceCourseId,
  );
  const sourceYear = academicYears.find(
    (year) => year.id === sourceCourse?.academicYearId,
  );
  const eligibleTargetYears = useMemo(
    () =>
      sourceYear
        ? academicYears
            .filter(
              (year) =>
                ['DRAFT', 'ACTIVE'].includes(year.status) &&
                year.startDate > sourceYear.endDate,
            )
            .sort((left, right) =>
              left.startDate.localeCompare(right.startDate),
            )
        : [],
    [academicYears, sourceYear],
  );
  const [requestedTargetAcademicYearId, setRequestedTargetAcademicYearId] =
    useState('');
  const targetAcademicYearId = eligibleTargetYears.some(
    (year) => year.id === requestedTargetAcademicYearId,
  )
    ? requestedTargetAcademicYearId
    : (eligibleTargetYears[0]?.id ?? '');
  const targetYear = eligibleTargetYears.find(
    (year) => year.id === targetAcademicYearId,
  );
  const targetCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.academicYearId === targetAcademicYearId &&
          course.status !== 'ARCHIVED' &&
          (targetYear?.status !== 'DRAFT' || course.status === 'DRAFT'),
      ),
    [courses, targetAcademicYearId, targetYear?.status],
  );
  const [defaultTargetCourseId, setDefaultTargetCourseId] = useState('');
  const selectedDefaultTargetId = targetCourses.some(
    (course) => course.id === defaultTargetCourseId,
  )
    ? defaultTargetCourseId
    : '';
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [rosterCourseId, setRosterCourseId] = useState('');
  const [rosterSummary, setRosterSummary] = useState<RosterSummary | null>(
    null,
  );
  const [rosterSummaryCourseId, setRosterSummaryCourseId] = useState('');
  const [rosterTotalCount, setRosterTotalCount] = useState(0);
  const [rosterNextCursor, setRosterNextCursor] = useState<string | null>(null);
  const [rosterPageCursor, setRosterPageCursor] = useState<string | undefined>(
    undefined,
  );
  const [rosterPageCursors, setRosterPageCursors] = useState<
    Array<string | undefined>
  >([undefined]);
  const [rosterPageIndex, setRosterPageIndex] = useState(0);
  const [rosterPageLoading, setRosterPageLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [scopeChange, setScopeChange] = useState<ScopeChange | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [operationSuccess, setOperationSuccess] = useState('');
  const [requiresRosterRefresh, setRequiresRosterRefresh] = useState(false);
  const [requiresDraftReload, setRequiresDraftReload] = useState(false);
  const [obsoleteOverrides, setObsoleteOverrides] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [prepareOnly, setPrepareOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftState, setDraftState] = useState<{
    key: string;
    draft: Draft;
    error?: string;
  }>();
  const [draftRetry, setDraftRetry] = useState(0);
  const [commandKey, setCommandKey] = useState<string | null>(null);
  const rosterRequestSequence = useRef(0);
  const summaryRequestSequence = useRef(0);

  const draftKey = `${sourceCourseId}:${targetAcademicYearId}`;
  const hasLoadedDraft = draftState?.key === draftKey && !draftState.error;
  const draft = hasLoadedDraft ? draftState.draft : null;

  useEffect(() => {
    if (!sourceCourseId || !targetAcademicYearId) return;
    let current = true;
    void api
      .getCourseRolloverDraft(sourceCourseId, targetAcademicYearId)
      .then(({ draft: saved }) => {
        if (!current) return;
        setDraftState({ key: draftKey, draft: saved });
        setHasUnsavedEdits(false);
        setDefaultTargetCourseId(saved?.plan.defaultTargetCourseId ?? '');
        setChoices(
          Object.fromEntries(
            (saved?.plan.overrides ?? []).map((override) => [
              override.sourceEnrollmentId,
              {
                targetCourseId: override.targetCourseId,
                decision: override.decision,
              },
            ]),
          ),
        );
      })
      .catch((error: unknown) => {
        if (current)
          setDraftState({
            key: draftKey,
            draft: null,
            error: errorMessage(error).message,
          });
      });
    return () => {
      current = false;
    };
  }, [api, draftKey, draftRetry, sourceCourseId, targetAcademicYearId]);

  useEffect(() => {
    if (!hasUnsavedEdits) return;
    function warnBeforeExit(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeExit);
    return () => window.removeEventListener('beforeunload', warnBeforeExit);
  }, [hasUnsavedEdits]);

  useEffect(() => {
    const sequence = ++rosterRequestSequence.current;
    if (sourceCourseId) {
      void api
        .getCourseRoster(sourceCourseId, rosterPageCursor)
        .then((page) => {
          if (sequence === rosterRequestSequence.current) {
            setRoster(page.items);
            setRosterNextCursor(page.nextCursor);
            setRosterTotalCount(page.totalCount);
            setRosterCourseId(sourceCourseId);
            setRosterError('');
          }
        })
        .catch((error: unknown) => {
          if (sequence === rosterRequestSequence.current) {
            setRosterError(errorMessage(error).message);
            setRosterCourseId(sourceCourseId);
          }
        })
        .finally(() => {
          if (sequence === rosterRequestSequence.current) {
            setRosterPageLoading(false);
          }
        });
    }
    return () => {
      rosterRequestSequence.current += 1;
    };
  }, [api, retryCount, rosterPageCursor, sourceCourseId]);

  useEffect(() => {
    const sequence = ++summaryRequestSequence.current;
    if (sourceCourseId) {
      void api
        .getCourseRosterSummary(sourceCourseId)
        .then((summary) => {
          if (sequence === summaryRequestSequence.current) {
            setRosterSummary(summary);
            setRosterSummaryCourseId(sourceCourseId);
          }
        })
        .catch((error: unknown) => {
          if (sequence === summaryRequestSequence.current) {
            setRosterError(errorMessage(error).message);
            setRosterSummaryCourseId(sourceCourseId);
          }
        });
    }
    return () => {
      summaryRequestSequence.current += 1;
    };
  }, [api, retryCount, sourceCourseId]);

  function choiceFor(item: RosterItem): Choice {
    if (item.sourceManaged) {
      return { targetCourseId: null, decision: 'SOURCE_MANAGED' };
    }
    return (
      choices[item.enrollmentId] ?? {
        targetCourseId: selectedDefaultTargetId || null,
        decision: selectedDefaultTargetId ? 'PROMOTE' : 'DEFER',
      }
    );
  }

  const overrideChoices = Object.values(choices);
  const repeatedCount = overrideChoices.filter(
    (choice) => choice.decision === 'REPEAT',
  ).length;
  const transferredCount = overrideChoices.filter(
    (choice) => choice.decision === 'TRANSFER',
  ).length;
  const deferredCount = overrideChoices.filter(
    (choice) => choice.decision === 'DEFER',
  ).length;
  const nonContinuingCount = overrideChoices.filter(
    (choice) => choice.decision === 'NO_CONTINUE',
  ).length;
  const unassignedCount = Math.max(
    0,
    (rosterSummary?.totalCount ?? 0) -
      (rosterSummary?.sourceManagedCount ?? 0) -
      overrideChoices.length,
  );
  const counts = {
    promoted: selectedDefaultTargetId ? unassignedCount : 0,
    repeated: repeatedCount,
    transferred: transferredCount,
    deferred: deferredCount + (selectedDefaultTargetId ? 0 : unassignedCount),
    sourceManaged: rosterSummary?.sourceManagedCount ?? 0,
  };
  const hasCurrentRoster =
    Boolean(sourceCourseId) &&
    rosterCourseId === sourceCourseId &&
    rosterSummaryCourseId === sourceCourseId;
  const rosterLoading =
    Boolean(sourceCourseId) && !hasCurrentRoster && !rosterError;
  const cannotSave =
    !hasLoadedDraft ||
    !sourceCourseId ||
    !targetAcademicYearId ||
    !selectedDefaultTargetId ||
    !hasCurrentRoster ||
    !rosterSummary?.operationAllowed ||
    !rosterSummary.fingerprint ||
    rosterLoading ||
    rosterPageLoading ||
    Boolean(rosterError) ||
    rosterTotalCount === 0 ||
    overrideChoices.length > courseEnrollmentPromotionOverrideLimit ||
    saving;

  const plan: PromoteCourseEnrollments = {
    sourceCourseId,
    targetAcademicYearId,
    defaultTargetCourseId: selectedDefaultTargetId,
    expectedRosterFingerprint: rosterSummary?.fingerprint ?? '',
    overrides: Object.entries(choices).map(([sourceEnrollmentId, choice]) => ({
      sourceEnrollmentId,
      targetCourseId: choice.targetCourseId,
      decision: choice.decision as
        'REPEAT' | 'TRANSFER' | 'DEFER' | 'NO_CONTINUE',
    })),
  };
  const savedMatches = Boolean(
    draft && JSON.stringify(plan) === JSON.stringify(draft.plan),
  );
  const rosterChangedSinceDraft = Boolean(
    draft &&
    rosterSummary?.fingerprint &&
    draft.plan.expectedRosterFingerprint !== rosterSummary.fingerprint,
  );
  const prepared = Boolean(
    savedMatches && draft?.preparedRevision === draft?.revision,
  );
  const normalizedRosterSearch = rosterSearchKey(rosterSearch);
  const visibleRoster = roster.filter(
    (item) =>
      rosterSearchKey(
        `${item.student.firstName} ${item.student.lastName}`,
      ).includes(normalizedRosterSearch) &&
      (!exceptionsOnly || choiceFor(item).decision !== 'PROMOTE'),
  );
  const cannotSubmit =
    cannotSave ||
    !savedMatches ||
    counts.promoted + counts.repeated + counts.transferred === 0;

  function reportOperationError(error: unknown) {
    const code = error instanceof AcademicApiError ? error.code : undefined;
    setRequiresRosterRefresh(code === 'COURSE_ROSTER_CHANGED');
    setRequiresDraftReload(code === 'COURSE_ROLLOVER_DRAFT_CHANGED');
    setObsoleteOverrides([]);
    if (code === 'COURSE_ROSTER_CHANGED') {
      setOperationError(
        'El padrón cambió. Actualiza la lista y revisa tus decisiones antes de continuar.',
      );
    } else if (code === 'COURSE_ROLLOVER_DRAFT_CHANGED') {
      setOperationError(
        'Otra sesión guardó una versión más reciente. Puedes seguir revisando aquí o abrir el último borrador guardado.',
      );
    } else if (code === 'COURSE_ROLLOVER_DESTINATION_CONFLICT') {
      setOperationError(
        `Hay un alumno con una matrícula incompatible en ${targetYear?.label}. Revisa Alumnos en los cursos de destino antes de preparar este borrador.`,
      );
    } else if (
      code === 'COURSE_ROLLOVER_OVERRIDES_OBSOLETE' &&
      error instanceof AcademicApiError
    ) {
      setObsoleteOverrides(
        error.details.flatMap(({ field }) =>
          field?.startsWith('overrides.')
            ? [field.slice('overrides.'.length)]
            : [],
        ),
      );
      setOperationError(
        'Algunos alumnos ya no figuran en el padrón. Puedes quitar únicamente sus decisiones y guardar el resto.',
      );
    } else {
      setOperationError(errorMessage(error).message);
    }
  }

  function changeReviewScope(change: ScopeChange) {
    setShowConfirmation(false);
    setScopeChange(null);
    setHasUnsavedEdits(false);
    setDraftState(undefined);
    setDefaultTargetCourseId('');
    setChoices({});
    setRosterSearch('');
    setExceptionsOnly(false);
    setOperationError('');
    setOperationSuccess('');
    setRequiresDraftReload(false);
    setRequiresRosterRefresh(false);
    setObsoleteOverrides([]);
    setCommandKey(null);
    if (change.field === 'course') {
      setSourceCourseId(change.value ?? '');
      refreshRoster();
    } else if (change.field === 'year') {
      setRequestedTargetAcademicYearId(change.value ?? '');
    } else {
      setDraftRetry((current) => current + 1);
    }
  }

  function requestScopeChange(change: ScopeChange) {
    if (hasUnsavedEdits) setScopeChange(change);
    else changeReviewScope(change);
  }

  function clearObsoleteOverrides() {
    const obsolete = new Set(obsoleteOverrides);
    setChoices((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !obsolete.has(id)),
      ),
    );
    setObsoleteOverrides([]);
    setOperationError('');
    setHasUnsavedEdits(true);
    setShowConfirmation(false);
    setCommandKey(null);
  }

  async function saveDraft() {
    if (cannotSave) return;
    setSaving(true);
    setOperationError('');
    setOperationSuccess('');
    try {
      const response = await api.saveCourseRolloverDraft({
        plan,
        expectedRevision: draft?.revision ?? 0,
      });
      setDraftState({ key: draftKey, draft: response.draft });
      setHasUnsavedEdits(false);
    } catch (error) {
      reportOperationError(error);
    } finally {
      setSaving(false);
    }
  }

  function editChoice(item: RosterItem, next: Choice) {
    setHasUnsavedEdits(true);
    setChoices((current) => {
      const updated = { ...current };
      if (
        next.decision === 'PROMOTE' &&
        next.targetCourseId === selectedDefaultTargetId
      ) {
        delete updated[item.enrollmentId];
      } else {
        updated[item.enrollmentId] = next;
      }
      return updated;
    });
    setCommandKey(null);
    setOperationError('');
    setOperationSuccess('');
    setRequiresRosterRefresh(false);
  }

  function refreshRoster() {
    setCommandKey(null);
    setRoster([]);
    setRosterCourseId('');
    setRosterSummary(null);
    setRosterSummaryCourseId('');
    setRosterTotalCount(0);
    setRosterPageCursor(undefined);
    setRosterPageCursors([undefined]);
    setRosterPageIndex(0);
    setRosterPageLoading(false);
    setRosterNextCursor(null);
    setRosterError('');
    setOperationError('');
    setOperationSuccess('');
    setRequiresRosterRefresh(false);
    setRetryCount((current) => current + 1);
  }

  function changeRosterPage(direction: 'previous' | 'next') {
    const cursor =
      direction === 'next'
        ? rosterNextCursor
        : rosterPageCursors[rosterPageIndex - 1];
    if (direction === 'next' && !cursor) return;
    if (direction === 'previous' && rosterPageIndex === 0) return;
    const nextPageIndex = rosterPageIndex + (direction === 'next' ? 1 : -1);
    setRoster([]);
    setRosterCourseId('');
    setRosterPageLoading(true);
    setRosterError('');
    setRosterPageCursor(cursor ?? undefined);
    setRosterPageCursors((current) => [
      ...current.slice(0, nextPageIndex),
      cursor ?? undefined,
    ]);
    setRosterPageIndex(nextPageIndex);
  }

  async function confirmPromotion() {
    if (cannotSubmit || !draft) return;
    const payload = { ...plan, draftRevision: draft.revision };
    const idempotencyKey = commandKey ?? crypto.randomUUID();
    setCommandKey(idempotencyKey);
    setSaving(true);
    setOperationError('');
    setOperationSuccess('');
    try {
      const result = await api.promoteCourseEnrollments(payload, {
        idempotencyKey,
        prepareOnly,
      });
      setOperationSuccess(
        prepareOnly
          ? `Quedaron preparadas ${result.promotedCount + result.repeatedCount + result.transferredCount} matrículas de ${targetYear?.label}. El año de origen sigue operativo.`
          : `Avance completado: ${result.promotedCount} promovidos, ${result.repeatedCount} repitentes y ${result.transferredCount} con cambio de curso.`,
      );
      setShowConfirmation(false);
      setCommandKey(null);
      if (prepareOnly) {
        setDraftState({
          key: draftKey,
          draft: { ...draft, preparedRevision: draft.revision },
        });
        onSaved();
        return;
      }
      setChoices({});
      setHasUnsavedEdits(false);
      setRosterCourseId('');
      setRosterSummary(null);
      setRosterSummaryCourseId('');
      setRosterTotalCount(0);
      setRosterPageCursor(undefined);
      setRosterPageCursors([undefined]);
      setRosterPageIndex(0);
      setRosterNextCursor(null);
      setRosterError('');
      setRequiresRosterRefresh(false);
      setRetryCount((current) => current + 1);
      onSaved();
    } catch (error) {
      reportOperationError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="academic-panel">
      <div className="section-heading">
        <div>
          <h2>Preparar el padrón del próximo año</h2>
          <p>
            Revisa la matrícula vigente, define el destino de cada alumno y
            guarda el borrador para retomarlo en otra sesión.
          </p>
        </div>
      </div>

      {operationError && !showConfirmation ? (
        <Alert title="No se pudo completar el avance" tone="error">
          {operationError}
          {requiresRosterRefresh ? (
            <div className="provisioning-actions">
              <Button onClick={refreshRoster} variant="secondary">
                Actualizar padrón
              </Button>
            </div>
          ) : null}
          {requiresDraftReload ? (
            <Button
              onClick={() => requestScopeChange({ field: 'reload' })}
              variant="secondary"
            >
              Abrir último borrador guardado
            </Button>
          ) : null}
          {obsoleteOverrides.length ? (
            <Button onClick={clearObsoleteOverrides} variant="secondary">
              Quitar decisiones de alumnos fuera del padrón
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {operationSuccess ? (
        <Alert
          title={prepareOnly ? 'Matrículas preparadas' : 'Avance completado'}
          tone="success"
        >
          {operationSuccess}
        </Alert>
      ) : null}

      <div className="assignment-form-grid">
        <Select
          disabled={sourceOptions.length === 0 || saving}
          id="promotion-source-course"
          label="Curso de origen"
          value={sourceCourseId}
          onChange={(event) =>
            requestScopeChange({ field: 'course', value: event.target.value })
          }
        >
          <option value="">Selecciona un curso activo</option>
          {sourceOptions.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label} ·{' '}
              {academicYears.find((year) => year.id === course.academicYearId)
                ?.label ?? 'Año no disponible'}
            </option>
          ))}
        </Select>
        <Select
          disabled={eligibleTargetYears.length === 0 || saving}
          id="promotion-target-year"
          label="Año de destino"
          value={targetAcademicYearId}
          onChange={(event) =>
            requestScopeChange({ field: 'year', value: event.target.value })
          }
        >
          <option value="">Selecciona un año posterior</option>
          {eligibleTargetYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label} ·{' '}
              {year.status === 'DRAFT' ? 'En preparación' : 'Activo'}
            </option>
          ))}
        </Select>
        <Select
          disabled={targetCourses.length === 0 || saving || !hasLoadedDraft}
          id="promotion-default-course"
          label="Curso de destino predeterminado"
          value={selectedDefaultTargetId}
          onChange={(event) => {
            setHasUnsavedEdits(true);
            setDefaultTargetCourseId(event.target.value);
            const destinationId = event.target.value;
            setChoices((current) =>
              Object.fromEntries(
                Object.entries(current).filter(
                  ([, choice]) =>
                    choice.decision !== 'TRANSFER' ||
                    choice.targetCourseId !== destinationId,
                ),
              ),
            );
            setCommandKey(null);
          }}
        >
          <option value="">Selecciona un curso de destino</option>
          {targetCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.label}
            </option>
          ))}
        </Select>
      </div>

      {sourceCourseId && targetAcademicYearId && !hasLoadedDraft ? (
        draftState?.key === draftKey && draftState.error ? (
          <Alert title="No se pudo leer el borrador" tone="error">
            {draftState.error}{' '}
            <Button
              onClick={() => setDraftRetry((count) => count + 1)}
              variant="secondary"
            >
              Reintentar
            </Button>
          </Alert>
        ) : (
          <p role="status" className="table-muted">
            Buscando el borrador guardado…
          </p>
        )
      ) : null}
      {draft ? (
        <p role="status" className="table-muted">
          {savedMatches
            ? prepared
              ? `Matrículas de ${targetYear?.label} preparadas para Pagos.`
              : 'Borrador guardado. Puedes retomar la revisión más tarde.'
            : rosterChangedSinceDraft
              ? 'El padrón cambió desde el último guardado. Revisa las decisiones antes de guardar nuevamente.'
              : 'Hay cambios pendientes de guardar en este borrador.'}
        </p>
      ) : null}
      {!sourceOptions.length ? (
        <EmptyState
          description="Activa un curso dentro del año vigente para preparar su matrícula de destino."
          title="No hay cursos activos para avanzar"
        />
      ) : null}
      {sourceCourse && !eligibleTargetYears.length ? (
        <EmptyState
          description="Crea un año académico posterior y sus cursos para preparar el avance. Los destinos se eligen explícitamente; no se deducen del nombre del curso."
          title="Falta preparar el año de destino"
        />
      ) : null}
      {rosterLoading ? (
        <p aria-live="polite" className="table-muted" role="status">
          Cargando la matrícula vigente…
        </p>
      ) : null}
      {rosterError ? (
        <Alert title="No se pudo cargar la matrícula" tone="error">
          {rosterError}{' '}
          <Button onClick={refreshRoster} variant="secondary">
            Volver a cargar
          </Button>
        </Alert>
      ) : null}

      {hasCurrentRoster &&
      rosterSummary?.totalCount === 0 &&
      !rosterLoading &&
      !rosterError ? (
        <EmptyState
          description="Este curso no tiene alumnos activos en su matrícula."
          title="No hay alumnos para avanzar"
        />
      ) : null}
      {hasCurrentRoster && rosterSummary && !rosterSummary.operationAllowed ? (
        <Alert
          title="El curso supera el límite de avance por operación"
          tone="warning"
        >
          Este flujo permite hasta{' '}
          {rosterSummary.maxRosterCount.toLocaleString('es-CL')} matrículas
          activas por operación. Hay{' '}
          {rosterSummary.totalCount.toLocaleString('es-CL')} en este curso; no
          se aplicó ningún cambio.
        </Alert>
      ) : null}
      {hasCurrentRoster &&
      overrideChoices.length > courseEnrollmentPromotionOverrideLimit ? (
        <Alert title="Hay demasiadas excepciones" tone="warning">
          Mantén hasta {courseEnrollmentPromotionOverrideLimit} excepciones por
          operación. Puedes procesar las decisiones estándar en bloque y
          resolver estas excepciones después.
        </Alert>
      ) : null}

      {hasCurrentRoster && roster.length > 0 ? (
        <>
          <dl
            className="rollover-summary"
            aria-label="Resumen del curso completo"
          >
            <div>
              <dt>Con destino</dt>
              <dd>{counts.promoted + counts.repeated + counts.transferred}</dd>
            </div>
            <div>
              <dt>Pendientes</dt>
              <dd>{counts.deferred}</dd>
            </div>
            <div>
              <dt>No continúan</dt>
              <dd>{nonContinuingCount}</dd>
            </div>
          </dl>
          {counts.sourceManaged > 0 ? (
            <Alert
              title="Hay matrículas administradas por sincronización"
              tone="warning"
            >
              Esas matrículas permanecen sin cambios en este corte. Su origen
              debe migrarse antes de poder avanzarlas desde Académico.
            </Alert>
          ) : null}
          <div className="rollover-roster-tools">
            <Input
              id="rollover-roster-search"
              label="Buscar en esta página"
              type="search"
              value={rosterSearch}
              onChange={(event) => setRosterSearch(event.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={exceptionsOnly}
                onChange={(event) => setExceptionsOnly(event.target.checked)}
              />
              Solo decisiones especiales
            </label>
          </div>
          {rosterSearch || exceptionsOnly ? (
            <p className="table-muted" role="status">
              {visibleRoster.length} de {roster.length} alumnos en esta página.
            </p>
          ) : null}
          {rosterSummary && rosterSummary.totalCount > 50 ? (
            <div className="pagination-bar">
              <span className="pagination-info">
                Página {rosterPageIndex + 1} de{' '}
                {Math.ceil(rosterSummary.totalCount / 50)} ·{' '}
                {rosterSummary.totalCount.toLocaleString('es-CL')} alumnos
              </span>
              <div className="provisioning-actions">
                <Button
                  disabled={
                    rosterPageIndex === 0 || rosterPageLoading || saving
                  }
                  loading={rosterPageLoading && rosterPageIndex > 0}
                  onClick={() => changeRosterPage('previous')}
                  variant="secondary"
                >
                  Anterior
                </Button>
                <Button
                  disabled={!rosterNextCursor || rosterPageLoading || saving}
                  loading={rosterPageLoading && Boolean(rosterNextCursor)}
                  onClick={() => changeRosterPage('next')}
                  variant="secondary"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Alumno</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Decisión</th>
                </tr>
              </thead>
              <tbody>
                {visibleRoster.map((item) => {
                  const choice = choiceFor(item);
                  const name = `${item.student.firstName} ${item.student.lastName}`;
                  const isDefault =
                    choice.targetCourseId === selectedDefaultTargetId;
                  return (
                    <tr key={item.enrollmentId}>
                      <td data-label="Alumno">
                        <strong>{name}</strong>
                        {item.sourceManaged ? (
                          <small>
                            {' '}
                            · Matrícula administrada por sincronización
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Destino">
                        <Select
                          disabled={
                            item.sourceManaged ||
                            saving ||
                            !hasLoadedDraft ||
                            !targetCourses.length
                          }
                          id={`promotion-target-${item.enrollmentId}`}
                          label={`Destino de ${name}`}
                          value={choice.targetCourseId ?? ''}
                          onChange={(event) => {
                            const value = event.target.value || null;
                            editChoice(item, {
                              targetCourseId: value,
                              decision: value
                                ? value === selectedDefaultTargetId
                                  ? 'PROMOTE'
                                  : 'TRANSFER'
                                : 'DEFER',
                            });
                          }}
                        >
                          <option value="">Sin destino</option>
                          {targetCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.label}
                              {course.id === selectedDefaultTargetId
                                ? ' · Principal'
                                : ''}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td data-label="Decisión">
                        <Select
                          disabled={
                            item.sourceManaged || saving || !hasLoadedDraft
                          }
                          id={`promotion-decision-${item.enrollmentId}`}
                          label={`Decisión para ${name}`}
                          value={choice.decision}
                          onChange={(event) => {
                            const decision = event.target.value as Decision;
                            editChoice(item, {
                              targetCourseId:
                                decision === 'DEFER' ||
                                decision === 'NO_CONTINUE'
                                  ? null
                                  : (choice.targetCourseId ??
                                    selectedDefaultTargetId),
                              decision,
                            });
                          }}
                        >
                          {item.sourceManaged ? (
                            <option value="SOURCE_MANAGED">
                              Gestionada por sincronización
                            </option>
                          ) : (
                            <>
                              {isDefault ||
                              (!choice.targetCourseId &&
                                selectedDefaultTargetId) ? (
                                <option value="PROMOTE">
                                  Avanza al curso principal
                                </option>
                              ) : null}
                              {choice.targetCourseId ? (
                                <option value="REPEAT">Repite curso</option>
                              ) : null}
                              {choice.targetCourseId && !isDefault ? (
                                <option value="TRANSFER">
                                  Cambio de curso
                                </option>
                              ) : null}
                              <option value="DEFER">
                                Pendiente de asignación
                              </option>
                              <option value="NO_CONTINUE">No continúa</option>
                            </>
                          )}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleRoster.length === 0 ? (
              <p className="table-muted">
                No hay alumnos que coincidan en esta página.
              </p>
            ) : null}
          </div>
          <div className="rollover-footer">
            <p className="table-muted" role="status">
              {prepared
                ? 'Ya puedes seguir con el siguiente curso o revisar el padrón en Pagos.'
                : savedMatches
                  ? 'El borrador está guardado. Prepara las matrículas confirmadas para que aparezcan en Pagos.'
                  : selectedDefaultTargetId
                    ? 'Guarda la revisión antes de preparar las matrículas para Pagos.'
                    : 'Elige un curso de destino para guardar el borrador.'}
            </p>
            <div className="provisioning-actions">
              <Button
                variant={savedMatches ? 'secondary' : 'primary'}
                disabled={cannotSave || savedMatches}
                onClick={() => void saveDraft()}
              >
                Guardar borrador
              </Button>
              <Button
                disabled={cannotSubmit || prepared}
                variant={savedMatches && !prepared ? 'primary' : 'secondary'}
                onClick={() => {
                  setCommandKey(null);
                  setOperationError('');
                  setPrepareOnly(true);
                  setShowConfirmation(true);
                }}
              >
                Preparar matrículas para Pagos
              </Button>
            </div>
          </div>
          <details className="rollover-year-close">
            <summary>Cierre del año de origen</summary>
            <p className="table-muted">
              Al terminar el año operativo puedes aplicar el avance e inactivar
              las matrículas de origen de quienes avanzan.
            </p>
            <Button
              disabled={cannotSubmit}
              variant="secondary"
              onClick={() => {
                setCommandKey(null);
                setOperationError('');
                setPrepareOnly(false);
                setShowConfirmation(true);
              }}
            >
              Aplicar avance al cierre
            </Button>
          </details>
        </>
      ) : null}

      <Dialog
        description="Confirma el año y el resultado por alumno antes de cambiar las matrículas."
        onOpenChange={(open) => !open && !saving && setShowConfirmation(false)}
        open={showConfirmation}
        title={
          prepareOnly
            ? 'Preparar matrículas para Pagos'
            : 'Aplicar avance al cierre'
        }
      >
        <div className="academic-form">
          <p>
            {sourceCourse?.label} · {sourceYear?.label} → {targetYear?.label} ·{' '}
            {targetCourses.find(
              (course) => course.id === selectedDefaultTargetId,
            )?.label ?? 'Sin destino principal'}
          </p>
          <p>
            {counts.promoted} avanzan, {counts.repeated} repiten,{' '}
            {counts.transferred} cambian de curso, {counts.deferred} quedan
            pendientes, {nonContinuingCount} no continúan y{' '}
            {counts.sourceManaged} no se modifican.
          </p>
          <p>
            {prepareOnly
              ? 'Pagos recibirá las matrículas de destino. El año vigente sigue operativo y las cuotas se configuran en Pagos.'
              : 'Esta acción inactiva de inmediato las matrículas de origen de quienes avanzan. Úsala al terminar el año operativo.'}
          </p>
          {operationError ? (
            <Alert title="No se confirmó el avance" tone="error">
              {operationError}
              {requiresRosterRefresh ? (
                <div className="provisioning-actions">
                  <Button
                    onClick={() => {
                      setShowConfirmation(false);
                      refreshRoster();
                    }}
                    variant="secondary"
                  >
                    Actualizar padrón
                  </Button>
                </div>
              ) : null}
              {requiresDraftReload ? (
                <Button
                  onClick={() => requestScopeChange({ field: 'reload' })}
                  variant="secondary"
                >
                  Abrir último borrador guardado
                </Button>
              ) : null}
              {obsoleteOverrides.length ? (
                <Button onClick={clearObsoleteOverrides} variant="secondary">
                  Quitar decisiones de alumnos fuera del padrón
                </Button>
              ) : null}
            </Alert>
          ) : null}
          <div className="provisioning-actions">
            <Button
              disabled={saving}
              onClick={() => setShowConfirmation(false)}
              variant="secondary"
            >
              Volver a revisar
            </Button>
            <Button
              disabled={
                cannotSubmit ||
                requiresRosterRefresh ||
                requiresDraftReload ||
                obsoleteOverrides.length > 0
              }
              loading={saving}
              onClick={() => void confirmPromotion()}
            >
              {prepareOnly ? 'Confirmar preparación' : 'Confirmar avance'}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={scopeChange !== null}
        onOpenChange={(open) => {
          if (!open) setScopeChange(null);
        }}
        title="Tienes decisiones sin guardar"
        description="Para conservarlas, vuelve a la revisión y guarda el borrador de este curso."
      >
        <div className="provisioning-actions">
          <Button onClick={() => setScopeChange(null)}>Volver a revisar</Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (scopeChange) changeReviewScope(scopeChange);
            }}
          >
            Continuar sin guardar
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
