'use client';

import { Alert, Badge, Button, Dialog, Skeleton } from '@edupay/ui';
import {
  learningBodyDocumentSchema,
  type ContentRevision,
} from '@edupay/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { BodyDocumentRenderer } from '@/components/body-document';
import { Icon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ScrollableTabsBar } from '@/components/scrollable-tabs-bar';

function operationMeta(operation: ContentRevision['operation']) {
  switch (operation) {
    case 'CREATED':
      return { icon: 'plus' as const, label: 'Creación inicial', tone: 'neutral' as const };
    case 'UPDATED':
      return { icon: 'edit' as const, label: 'Contenido actualizado', tone: 'info' as const };
    case 'SENSITIVE_CHANGE_CONFIRMED':
      return { icon: 'alert-triangle' as const, label: 'Cambio sensible confirmado', tone: 'warning' as const };
    case 'SCHEDULED':
      return { icon: 'calendar' as const, label: 'Programado', tone: 'info' as const };
    case 'PUBLISHED':
      return { icon: 'check' as const, label: 'Publicado', tone: 'success' as const };
    case 'UNPUBLISHED':
      return { icon: 'eye' as const, label: 'Publicación retirada', tone: 'warning' as const };
    case 'ARCHIVED':
      return { icon: 'archive' as const, label: 'Archivado', tone: 'neutral' as const };
    case 'REORDERED':
      return { icon: 'move' as const, label: 'Reordenado', tone: 'neutral' as const };
    case 'MOVED':
      return { icon: 'layers' as const, label: 'Movido de unidad', tone: 'info' as const };
    case 'DUPLICATED':
      return { icon: 'copy' as const, label: 'Duplicado', tone: 'neutral' as const };
    case 'DRAFT_SAVED':
      return { icon: 'clipboard' as const, label: 'Borrador guardado', tone: 'info' as const };
    case 'DRAFT_DISCARDED':
      return { icon: 'trash' as const, label: 'Borrador descartado', tone: 'neutral' as const };
    case 'DRAFT_PUBLISHED':
      return { icon: 'check-circle' as const, label: 'Borrador publicado', tone: 'success' as const };
    case 'RESTORED':
      return { icon: 'history' as const, label: 'Versión restaurada', tone: 'success' as const };
    default:
      return { icon: 'layers' as const, label: operation, tone: 'neutral' as const };
  }
}

function formatDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function snapshotBodyDocument(revision: ContentRevision) {
  const parsed = learningBodyDocumentSchema.safeParse(
    revision.snapshot.bodyDocument,
  );
  return parsed.success ? parsed.data : null;
}

interface ContentHistoryDrawerProps {
  api: AcademicApiClient;
  entityType: 'LEARNING_UNIT' | 'LEARNING_ITEM';
  entityId: string;
  entityTitle: string;
  currentVersion?: number;
  open: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export function ContentHistoryDrawer({
  api,
  currentVersion,
  entityId,
  entityTitle,
  entityType,
  onClose,
  onRestored,
  open,
}: ContentHistoryDrawerProps) {
  const [history, setHistory] = useState<ContentRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRevision, setSelectedRevision] = useState<ContentRevision | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [mobileTab, setMobileTab] = useState<'timeline' | 'preview'>('timeline');
  const [operationFilter, setOperationFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT' | 'RESTORED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedBodyDocument = selectedRevision
    ? snapshotBodyDocument(selectedRevision)
    : null;

  const loadHistory = useCallback(async () => {
    if (!entityId || !open) return;
    setLoading(true);
    setError('');
    try {
      const revisions =
        entityType === 'LEARNING_UNIT'
          ? await api.getLearningUnitHistory(entityId)
          : await api.getLearningItemHistory(entityId);
      // Sort newest to oldest
      const sorted = [...revisions].sort(
        (a, b) => b.revisionNumber - a.revisionNumber,
      );
      setHistory(sorted);
      setSelectedRevision(sorted[0] ?? null);
    } catch (err) {
      setError(
        err instanceof AcademicApiError
          ? err.message
          : 'No pudimos cargar el historial de versiones.',
      );
    } finally {
      setLoading(false);
    }
  }, [api, entityId, entityType, open]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => void loadHistory(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, loadHistory]);

  async function handleRestore(revision: ContentRevision) {
    setRestoring(true);
    setRestoreError('');
    setRestoreSuccess('');
    try {
      if (entityType === 'LEARNING_UNIT') {
        await api.restoreLearningUnitRevision(
          entityId,
          revision.revisionNumber,
        );
      } else {
        await api.restoreLearningItemRevision(
          entityId,
          revision.revisionNumber,
        );
      }
      setRestoreSuccess(
        `Versión ${revision.revisionNumber} restaurada exitosamente.`,
      );
      await loadHistory();
      onRestored?.();
    } catch (err) {
      setRestoreError(
        err instanceof AcademicApiError
          ? err.message
          : 'No pudimos restaurar esta versión.',
      );
    } finally {
      setRestoring(false);
    }
  }

  // Filtered Revisions
  const filteredHistory = useMemo(() => {
    return history.filter((rev) => {
      // Operation filter
      if (operationFilter === 'PUBLISHED') {
        if (rev.operation !== 'PUBLISHED' && rev.operation !== 'DRAFT_PUBLISHED') return false;
      } else if (operationFilter === 'DRAFT') {
        if (rev.operation !== 'DRAFT_SAVED' && rev.operation !== 'DRAFT_DISCARDED') return false;
      } else if (operationFilter === 'RESTORED') {
        if (rev.operation !== 'RESTORED') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesVersion = `v${rev.revisionNumber}`.includes(q) || String(rev.revisionNumber).includes(q);
        const matchesOp = operationMeta(rev.operation).label.toLowerCase().includes(q);
        const matchesTitle = rev.snapshot.title ? String(rev.snapshot.title).toLowerCase().includes(q) : false;
        if (!matchesVersion && !matchesOp && !matchesTitle) return false;
      }

      return true;
    });
  }, [history, operationFilter, searchQuery]);

  const counts = useMemo(() => {
    let published = 0;
    let drafts = 0;
    let restored = 0;
    for (const rev of history) {
      if (rev.operation === 'PUBLISHED' || rev.operation === 'DRAFT_PUBLISHED') published++;
      if (rev.operation === 'DRAFT_SAVED' || rev.operation === 'DRAFT_DISCARDED') drafts++;
      if (rev.operation === 'RESTORED') restored++;
    }
    return { all: history.length, drafts, published, restored };
  }, [history]);

  if (!open) return null;

  return (
    <Dialog
      description={`Historial inmutable de cambios y versiones para «${entityTitle}».`}
      onOpenChange={(isOpen) => {
        if (!isOpen && !restoring) onClose();
      }}
      open
      title="Historial de versiones"
    >
      <div className="history-modal-layout">
        {/* Top Context Banner */}
        <div className="history-context-banner">
          <div className="history-context-banner__info">
            <span className="history-context-banner__chip">
              <Icon name={entityType === 'LEARNING_UNIT' ? 'layers' : 'file-text'} />
              <span>{entityType === 'LEARNING_UNIT' ? 'Unidad de aprendizaje' : 'Contenido'}</span>
            </span>
            <h3 className="history-context-banner__title">{entityTitle}</h3>
          </div>
          <div className="history-context-banner__tags">
            {currentVersion ? (
              <Badge tone="success">
                <Icon name="check-circle" />
                Versión activa: v{currentVersion}
              </Badge>
            ) : null}
            <span className="history-stat-badge">
              {history.length} {history.length === 1 ? 'versión registrada' : 'versiones registradas'}
            </span>
          </div>
        </div>

        {error ? (
          <Alert
            action={
              <Button onClick={() => void loadHistory()} variant="secondary">
                Reintentar
              </Button>
            }
            title="Error al cargar historial"
            tone="error"
          >
            {error}
          </Alert>
        ) : null}

        {restoreError ? (
          <Alert title="No se pudo restaurar" tone="error">
            {restoreError}
          </Alert>
        ) : null}

        {restoreSuccess ? (
          <Alert title="Restauración completada" tone="success">
            {restoreSuccess}
          </Alert>
        ) : null}

        {loading ? (
          <div aria-label="Cargando historial" className="academic-loading history-loading-box">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : (
          <>
            {/* Mobile Tab Switcher (< 860px) */}
            <ScrollableTabsBar
              ariaLabel="Pestañas de vista del historial de versiones"
              className="history-mobile-tabs-scroll-bar"
            >
              <div className="history-mobile-tabs" role="tablist">
                <button
                  aria-selected={mobileTab === 'timeline'}
                  className={`history-mobile-tab ${mobileTab === 'timeline' ? 'history-mobile-tab--active' : ''}`}
                  onClick={() => setMobileTab('timeline')}
                  role="tab"
                  type="button"
                >
                  <Icon name="history" />
                  <span>Línea de tiempo</span>
                  <span className="history-mobile-tab__badge">{history.length}</span>
                </button>
                <button
                  aria-selected={mobileTab === 'preview'}
                  className={`history-mobile-tab ${mobileTab === 'preview' ? 'history-mobile-tab--active' : ''}`}
                  onClick={() => setMobileTab('preview')}
                  role="tab"
                  type="button"
                >
                  <Icon name="eye" />
                  <span>Vista previa {selectedRevision ? `(v${selectedRevision.revisionNumber})` : ''}</span>
                </button>
              </div>
            </ScrollableTabsBar>

            <div className={`history-split-view history-split-view--${mobileTab}`}>
              {/* LEFT COLUMN: TIMELINE LIST */}
              <div className="history-timeline">
                {/* Search & Filter Bar */}
                <div className="history-timeline__toolbar">
                  <div className="history-timeline__search">
                    <Icon name="search" />
                    <input
                      aria-label="Buscar versión"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrar por versión o título…"
                      type="search"
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <button
                        aria-label="Limpiar búsqueda"
                        className="history-timeline__clear-search"
                        onClick={() => setSearchQuery('')}
                        type="button"
                      >
                        <Icon name="close" />
                      </button>
                    ) : null}
                  </div>

                  {/* Operation Filter Chips */}
                  <ScrollableTabsBar
                    ariaLabel="Filtros de versiones por tipo de operación"
                    className="history-filter-chips-scroll-bar"
                  >
                    <div className="history-filter-chips" role="tablist">
                      <button
                        className={`history-filter-chip ${operationFilter === 'ALL' ? 'history-filter-chip--active' : ''}`}
                        onClick={() => setOperationFilter('ALL')}
                        type="button"
                      >
                        Todas ({counts.all})
                      </button>
                      {counts.published > 0 ? (
                        <button
                          className={`history-filter-chip ${operationFilter === 'PUBLISHED' ? 'history-filter-chip--active' : ''}`}
                          onClick={() => setOperationFilter('PUBLISHED')}
                          type="button"
                        >
                          Publicadas ({counts.published})
                        </button>
                      ) : null}
                      {counts.drafts > 0 ? (
                        <button
                          className={`history-filter-chip ${operationFilter === 'DRAFT' ? 'history-filter-chip--active' : ''}`}
                          onClick={() => setOperationFilter('DRAFT')}
                          type="button"
                        >
                          Borradores ({counts.drafts})
                        </button>
                      ) : null}
                      {counts.restored > 0 ? (
                        <button
                          className={`history-filter-chip ${operationFilter === 'RESTORED' ? 'history-filter-chip--active' : ''}`}
                          onClick={() => setOperationFilter('RESTORED')}
                          type="button"
                        >
                          Restauradas ({counts.restored})
                        </button>
                      ) : null}
                    </div>
                  </ScrollableTabsBar>
                </div>

                <div className="history-revisions-list">
                  {filteredHistory.length ? (
                    filteredHistory.map((rev) => {
                      const meta = operationMeta(rev.operation);
                      const isCurrent = currentVersion === rev.revisionNumber;
                      const isSelected = selectedRevision?.id === rev.id;

                      return (
                        <button
                          className={`history-revision-card ${
                            isSelected ? 'history-revision-card--selected' : ''
                          } ${isCurrent ? 'history-revision-card--current' : ''}`}
                          key={rev.id}
                          onClick={() => {
                            setSelectedRevision(rev);
                            setRestoreError('');
                            setRestoreSuccess('');
                            setMobileTab('preview');
                          }}
                          type="button"
                        >
                          <div className="history-revision-head">
                            <span className="history-version-badge">
                              v{rev.revisionNumber}
                            </span>
                            <Badge tone={meta.tone}>
                              <Icon name={meta.icon} />
                              {meta.label}
                            </Badge>
                            {isCurrent ? (
                              <span className="history-current-tag">Actual</span>
                            ) : null}
                          </div>

                          {rev.snapshot.title && rev.snapshot.title !== entityTitle ? (
                            <p className="history-revision-title-preview">
                              «{String(rev.snapshot.title)}»
                            </p>
                          ) : null}

                          <div className="history-revision-meta">
                            <span className="history-revision-date">
                              <Icon name="clock" />
                              {formatDate(rev.createdAt)}
                            </span>
                            {rev.restoredFromRevision ? (
                              <span className="history-restored-pill">
                                Restaurado desde v{rev.restoredFromRevision}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="history-revisions-empty">
                      <Icon name="search" />
                      <p>No hay versiones que coincidan con los filtros aplicados.</p>
                      <Button
                        onClick={() => {
                          setSearchQuery('');
                          setOperationFilter('ALL');
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Restablecer filtros
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: SNAPSHOT INSPECTOR */}
              <div className="history-snapshot-panel">
                {selectedRevision ? (
                  <>
                    {/* Mobile Back to Timeline button */}
                    <div className="history-mobile-back-row">
                      <Button
                        onClick={() => setMobileTab('timeline')}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Icon name="arrow-left" />
                        <span>Volver a versiones</span>
                      </Button>
                    </div>

                    <div className="snapshot-header">
                      <div className="snapshot-header__title-box">
                        <div className="snapshot-header__pill-row">
                          <span className="snapshot-version-tag">
                            Versión {selectedRevision.revisionNumber}
                          </span>
                          <Badge tone={operationMeta(selectedRevision.operation).tone}>
                            <Icon name={operationMeta(selectedRevision.operation).icon} />
                            {operationMeta(selectedRevision.operation).label}
                          </Badge>
                          {currentVersion === selectedRevision.revisionNumber ? (
                            <span className="history-current-tag">Activa ahora</span>
                          ) : null}
                        </div>
                        <p className="snapshot-header__timestamp">
                          Registrada el {formatDate(selectedRevision.createdAt)}
                          {selectedRevision.actorIdentityUserId
                            ? ` · Por ${selectedRevision.actorIdentityUserId}`
                            : ''}
                        </p>
                      </div>

                      <div className="snapshot-header__actions">
                        {currentVersion === selectedRevision.revisionNumber ? (
                          <div className="snapshot-current-indicator">
                            <Icon name="check-circle" />
                            <span>Versión actual en uso</span>
                          </div>
                        ) : (
                          <Button
                            className="history-restore-btn"
                            disabled={restoring}
                            loading={restoring}
                            onClick={() => void handleRestore(selectedRevision)}
                            size="sm"
                            variant="primary"
                          >
                            <Icon name="history" />
                            <span>Restaurar esta versión</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {currentVersion !== selectedRevision.revisionNumber ? (
                      <div className="history-restore-notice">
                        <Icon name="alert-circle" />
                        <div>
                          <strong>Restauración segura e inmutable</strong>
                          <p>
                            Al restaurar esta versión, se creará una nueva versión activa con estos datos exactos. Tus cambios posteriores no se perderán y permanecerán registrados en este historial.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="snapshot-content">
                      {selectedRevision.snapshot.title ? (
                        <div className="snapshot-field">
                          <strong>Título</strong>
                          <p className="snapshot-field__title-value">
                            {String(selectedRevision.snapshot.title)}
                          </p>
                        </div>
                      ) : null}

                      {selectedRevision.snapshot.description ? (
                        <div className="snapshot-field">
                          <strong>Descripción</strong>
                          <p>{String(selectedRevision.snapshot.description)}</p>
                        </div>
                      ) : null}

                      {selectedBodyDocument ? (
                        <div className="snapshot-field">
                          <strong>Contenido estructurado en bloques</strong>
                          <div className="snapshot-document-box">
                            <BodyDocumentRenderer document={selectedBodyDocument} />
                          </div>
                        </div>
                      ) : null}

                      {!selectedBodyDocument && selectedRevision.snapshot.content ? (
                        <div className="snapshot-field">
                          <strong>Contenido</strong>
                          <div className="snapshot-markdown">
                            <MarkdownRenderer
                              content={String(selectedRevision.snapshot.content)}
                            />
                          </div>
                        </div>
                      ) : null}

                      {!selectedBodyDocument && selectedRevision.snapshot.instructions ? (
                        <div className="snapshot-field">
                          <strong>Instrucciones para estudiantes</strong>
                          <div className="snapshot-markdown">
                            <MarkdownRenderer
                              content={String(
                                selectedRevision.snapshot.instructions,
                              )}
                            />
                          </div>
                        </div>
                      ) : null}

                      {!selectedBodyDocument && selectedRevision.snapshot.body ? (
                        <div className="snapshot-field">
                          <strong>Mensaje / Anuncio</strong>
                          <div className="snapshot-markdown">
                            <MarkdownRenderer
                              content={String(selectedRevision.snapshot.body)}
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedRevision.snapshot.dueAt ? (
                        <div className="snapshot-field">
                          <strong>Plazo de entrega</strong>
                          <div className="snapshot-pill-data">
                            <Icon name="clock" />
                            <span>{formatDate(String(selectedRevision.snapshot.dueAt))}</span>
                          </div>
                        </div>
                      ) : null}

                      {selectedRevision.snapshot.startAt || selectedRevision.snapshot.endAt ? (
                        <div className="snapshot-field">
                          <strong>Vigencia y disponibilidad</strong>
                          <div className="snapshot-pill-data">
                            <Icon name="calendar" />
                            <span>
                              {selectedRevision.snapshot.startAt
                                ? `Desde ${formatDate(String(selectedRevision.snapshot.startAt))}`
                                : ''}
                              {selectedRevision.snapshot.endAt
                                ? ` hasta ${formatDate(String(selectedRevision.snapshot.endAt))}`
                                : ''}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="history-empty-snapshot">
                    <Icon name="history" />
                    <h4>Selecciona una versión</h4>
                    <p>Haz clic en cualquier versión de la línea de tiempo para inspeccionar su captura y contenido.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="showcase-dialog-actions history-dialog-footer">
          <Button onClick={onClose} size="md" type="button" variant="secondary">
            Cerrar historial
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
