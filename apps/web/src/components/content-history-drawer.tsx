'use client';

import { Alert, Badge, Button, Dialog, Skeleton } from '@edupay/ui';
import type { ContentRevision } from '@edupay/contracts';
import { useCallback, useEffect, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/markdown-renderer';

function operationMeta(operation: ContentRevision['operation']) {
  switch (operation) {
    case 'CREATED':
      return { label: 'Creación inicial', tone: 'neutral' as const };
    case 'UPDATED':
      return { label: 'Contenido actualizado', tone: 'info' as const };
    case 'SENSITIVE_CHANGE_CONFIRMED':
      return { label: 'Cambio sensible confirmado', tone: 'warning' as const };
    case 'SCHEDULED':
      return { label: 'Programado', tone: 'info' as const };
    case 'PUBLISHED':
      return { label: 'Publicado', tone: 'success' as const };
    case 'UNPUBLISHED':
      return { label: 'Publicación retirada', tone: 'warning' as const };
    case 'ARCHIVED':
      return { label: 'Archivado', tone: 'neutral' as const };
    case 'REORDERED':
      return { label: 'Reordenado', tone: 'neutral' as const };
    case 'MOVED':
      return { label: 'Movido de unidad', tone: 'info' as const };
    case 'DUPLICATED':
      return { label: 'Duplicado', tone: 'neutral' as const };
    case 'DRAFT_SAVED':
      return { label: 'Borrador guardado', tone: 'info' as const };
    case 'DRAFT_DISCARDED':
      return { label: 'Borrador descartado', tone: 'neutral' as const };
    case 'DRAFT_PUBLISHED':
      return { label: 'Borrador publicado', tone: 'success' as const };
    case 'RESTORED':
      return { label: 'Versión restaurada', tone: 'success' as const };
    default:
      return { label: operation, tone: 'neutral' as const };
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
      const sorted = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
      setHistory(sorted);
      setSelectedRevision(sorted[0] ?? null);
    } catch (err) {
      setError(err instanceof AcademicApiError ? err.message : 'No pudimos cargar el historial de versiones.');
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
        await api.restoreLearningUnitRevision(entityId, revision.revisionNumber);
      } else {
        await api.restoreLearningItemRevision(entityId, revision.revisionNumber);
      }
      setRestoreSuccess(`Versión ${revision.revisionNumber} restaurada exitosamente.`);
      await loadHistory();
      onRestored?.();
    } catch (err) {
      setRestoreError(err instanceof AcademicApiError ? err.message : 'No pudimos restaurar esta versión.');
    } finally {
      setRestoring(false);
    }
  }

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
        {error ? (
          <Alert action={<Button onClick={() => void loadHistory()} variant="secondary">Reintentar</Button>} title="Error" tone="error">
            {error}
          </Alert>
        ) : null}

        {restoreError ? <Alert title="No se pudo restaurar" tone="error">{restoreError}</Alert> : null}
        {restoreSuccess ? <Alert title="Restauración completada" tone="success">{restoreSuccess}</Alert> : null}

        {loading ? (
          <div aria-label="Cargando historial" className="academic-loading">
            <Skeleton /><Skeleton /><Skeleton />
          </div>
        ) : (
          <div className="history-split-view">
            <div className="history-timeline">
              <span className="history-timeline__header">
                <strong>{history.length} {history.length === 1 ? 'versión registrada' : 'versiones registradas'}</strong>
              </span>

              <div className="history-revisions-list">
                {history.map((rev) => {
                  const meta = operationMeta(rev.operation);
                  const isCurrent = currentVersion === rev.revisionNumber;
                  const isSelected = selectedRevision?.id === rev.id;

                  return (
                    <button
                      className={`history-revision-card ${isSelected ? 'history-revision-card--selected' : ''}`}
                      key={rev.id}
                      onClick={() => {
                        setSelectedRevision(rev);
                        setRestoreError('');
                        setRestoreSuccess('');
                      }}
                      type="button"
                    >
                      <div className="history-revision-head">
                        <span className="history-version-badge">v{rev.revisionNumber}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {isCurrent ? <span className="history-current-tag">Actual</span> : null}
                      </div>
                      <div className="history-revision-meta">
                        <span>{formatDate(rev.createdAt)}</span>
                        {rev.restoredFromRevision ? (
                          <small>Restaurado desde v{rev.restoredFromRevision}</small>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="history-snapshot-panel">
              {selectedRevision ? (
                <>
                  <div className="snapshot-header">
                    <div>
                      <h4>Versión {selectedRevision.revisionNumber}</h4>
                      <p>{operationMeta(selectedRevision.operation).label} · {formatDate(selectedRevision.createdAt)}</p>
                    </div>

                    <Button
                      disabled={restoring || currentVersion === selectedRevision.revisionNumber}
                      loading={restoring}
                      onClick={() => void handleRestore(selectedRevision)}
                      size="sm"
                      variant="secondary"
                    >
                      <Icon name="history" />
                      Restaurar esta versión
                    </Button>
                  </div>

                  <p className="integration-note">
                    <Icon name="layers" />
                    Restaurar no elimina cambios posteriores. Se creará una nueva versión con los datos de esta captura.
                  </p>

                  <div className="snapshot-content">
                    {selectedRevision.snapshot.title ? (
                      <div className="snapshot-field">
                        <strong>Título</strong>
                        <p>{String(selectedRevision.snapshot.title)}</p>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.description ? (
                      <div className="snapshot-field">
                        <strong>Descripción</strong>
                        <p>{String(selectedRevision.snapshot.description)}</p>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.content ? (
                      <div className="snapshot-field">
                        <strong>Contenido</strong>
                        <div className="snapshot-markdown">
                          <MarkdownRenderer content={String(selectedRevision.snapshot.content)} />
                        </div>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.instructions ? (
                      <div className="snapshot-field">
                        <strong>Instrucciones</strong>
                        <div className="snapshot-markdown">
                          <MarkdownRenderer content={String(selectedRevision.snapshot.instructions)} />
                        </div>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.body ? (
                      <div className="snapshot-field">
                        <strong>Mensaje</strong>
                        <div className="snapshot-markdown">
                          <MarkdownRenderer content={String(selectedRevision.snapshot.body)} />
                        </div>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.dueAt ? (
                      <div className="snapshot-field">
                        <strong>Fecha de entrega</strong>
                        <p>{formatDate(String(selectedRevision.snapshot.dueAt))}</p>
                      </div>
                    ) : null}

                    {selectedRevision.snapshot.startAt || selectedRevision.snapshot.endAt ? (
                      <div className="snapshot-field">
                        <strong>Disponibilidad</strong>
                        <p>
                          {selectedRevision.snapshot.startAt ? `Desde ${formatDate(String(selectedRevision.snapshot.startAt))}` : ''}
                          {selectedRevision.snapshot.endAt ? ` hasta ${formatDate(String(selectedRevision.snapshot.endAt))}` : ''}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="history-empty-snapshot">
                  <p>Selecciona una versión para ver su contenido.</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="showcase-dialog-actions">
          <Button onClick={onClose} type="button" variant="secondary">
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
