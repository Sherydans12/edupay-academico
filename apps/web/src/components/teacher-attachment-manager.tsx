'use client';

import { Alert, Badge, Button, Card, Dialog } from '@edupay/ui';
import type { LearningItem, StorageFile, StoragePolicy, StorageUsage } from '@edupay/contracts';
import { useCallback, useEffect, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';
import { formatFileSize, UploadQueueView, uploadErrorMessage, useFileUploadQueue } from '@/components/file-upload-queue';

function categoryFor(item: LearningItem): 'LEARNING_MATERIAL' | 'ASSIGNMENT_SOURCE' | 'ASSESSMENT_SOURCE' | null {
  if (item.type === 'MATERIAL') return 'LEARNING_MATERIAL';
  if (item.type === 'ASSIGNMENT') return 'ASSIGNMENT_SOURCE';
  if (item.type === 'ASSESSMENT') return 'ASSESSMENT_SOURCE';
  return null;
}

function quotaLabel(state: StorageUsage['state']): string {
  if (state === 'FULL') return 'Almacenamiento lleno';
  if (state === 'CRITICAL') return 'Almacenamiento casi lleno';
  if (state === 'WARNING') return 'Almacenamiento en advertencia';
  if (state === 'INFO') return 'Uso de almacenamiento elevado';
  return 'Almacenamiento disponible';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TeacherAttachmentManager({
  api,
  item,
  onChanged,
}: {
  api: AcademicApiClient;
  item: LearningItem;
  onChanged?: (() => void) | undefined;
}) {
  const category = categoryFor(item);
  const [attachments, setAttachments] = useState<StorageFile[]>([]);
  const [policy, setPolicy] = useState<StoragePolicy | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fileToDetach, setFileToDetach] = useState<StorageFile | null>(null);
  const [detaching, setDetaching] = useState(false);

  const queue = useFileUploadQueue({ api, category: category ?? 'LEARNING_MATERIAL', parentId: item.id, policy, maxFiles: 20 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextAttachments, nextPolicy, nextUsage] = await Promise.all([
        api.listLearningAttachments(item.id),
        api.getStoragePolicy().catch(() => null),
        api.getStorageUsage().catch(() => null),
      ]);
      setAttachments(nextAttachments);
      setPolicy(nextPolicy);
      setUsage(nextUsage);
    } catch (nextError) {
      setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos cargar los archivos de este contenido.');
    } finally {
      setLoading(false);
    }
  }, [api, item.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload() {
    setUploadError('');
    if (!queue.rows.length) {
      setUploadError('Selecciona al menos un archivo.');
      return;
    }
    setUploading(true);
    try {
      if (!(await queue.uploadPending()) || queue.hasFailed) {
        setUploadError('Revisa los archivos con error y reintenta individualmente.');
        return;
      }
      await load();
      queue.clear();
      onChanged?.();
    } catch (nextError) {
      setUploadError(uploadErrorMessage(nextError));
    } finally {
      setUploading(false);
    }
  }

  async function download(file: StorageFile) {
    try {
      const response = await api.downloadFile(file.id);
      downloadBlob(response.blob, response.filename ?? file.originalFilename);
    } catch {
      setError('No pudimos descargar este archivo. Inténtalo nuevamente.');
    }
  }

  async function detach(file: StorageFile) {
    setDetaching(true);
    setError('');
    try {
      await api.detachLearningAttachment(item.id, file.id);
      setFileToDetach(null);
      await load();
      onChanged?.();
    } catch (nextError) {
      setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos quitar el archivo del contenido.');
    } finally {
      setDetaching(false);
    }
  }

  if (!category) return null;
  const uploadsBlocked = usage?.state === 'FULL';

  return (
    <Card className="attachment-manager" aria-labelledby={`attachments-title-${item.id}`}>
      <div className="section-heading">
        <div>
          <h3 id={`attachments-title-${item.id}`}>Archivos adjuntos</h3>
          <p>Agrega materiales de apoyo para este contenido.</p>
        </div>
        <Badge tone={uploadsBlocked ? 'warning' : 'info'}>
          {attachments.length} archivo{attachments.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {usage && (
        <div className="attachment-storage-info">
          <div className="storage-meter-row">
            <span className="storage-meter-label">
              <Icon name="layers" />
              <span>{quotaLabel(usage.state)}: {formatFileSize(usage.usedBytes)} usados de {formatFileSize(usage.quotaBytes)} ({usage.remainingPercentage}% libre)</span>
            </span>
          </div>
          {usage.state !== 'NORMAL' ? (
            <Alert
              title={quotaLabel(usage.state)}
              tone={usage.state === 'FULL' || usage.state === 'CRITICAL' ? 'warning' : 'info'}
            >
              {uploadsBlocked
                ? 'El almacenamiento está lleno. No se pueden subir archivos nuevos hasta liberar espacio.'
                : `${usage.remainingPercentage}% de capacidad disponible para nuevas cargas.`}
            </Alert>
          ) : null}
        </div>
      )}

      {error ? (
        <Alert action={<Button onClick={() => void load()} variant="secondary">Reintentar</Button>} title="Error" tone="error">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <div aria-label="Cargando archivos adjuntos" className="academic-loading">
          <div className="ui-skeleton" />
        </div>
      ) : null}

      {!loading && attachments.length ? (
        <div className="attachment-list">
          {attachments.map((file) => (
            <div className="attachment-row" key={file.id}>
              <Icon name="paperclip" />
              <span>
                <strong>{file.originalFilename}</strong>
                <small>{formatFileSize(file.sizeBytes)} · {file.detectedMime}</small>
              </span>
              <div className="attachment-row-actions">
                <Button
                  aria-label={`Descargar ${file.originalFilename}`}
                  onClick={() => void download(file)}
                  size="icon"
                  title="Descargar"
                  variant="ghost"
                >
                  <Icon name="download" />
                </Button>
                <Button
                  aria-label={`Quitar ${file.originalFilename}`}
                  onClick={() => setFileToDetach(file)}
                  size="icon"
                  title="Quitar del contenido"
                  variant="ghost"
                >
                  <Icon name="trash" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !attachments.length ? (
        <p className="attachment-empty">Aún no hay archivos adjuntos en este contenido.</p>
      ) : null}

      {uploadError ? <Alert title="No se pudieron subir todos los archivos" tone="error">{uploadError}</Alert> : null}

      <UploadQueueView
        action={() => void upload()}
        actionDisabled={uploadsBlocked || !queue.rows.length}
        actionLabel="Subir archivos"
        actionLoading={uploading}
        disabled={uploadsBlocked}
        id={`learning-attachments-${item.id}`}
        maxFiles={20}
        queue={queue}
        subtitle={`${policy ? `Máximo ${formatFileSize(policy.maxFileSizeBytes)}` : 'Máximo 25 MB'} por archivo · ${queue.accept.replaceAll(',', ', ')}`}
      />

      {fileToDetach ? (
        <Dialog
          description="Esta acción desvincula el archivo de este contenido."
          onOpenChange={(open) => {
            if (!open && !detaching) setFileToDetach(null);
          }}
          open
          title="Quitar archivo del contenido"
        >
          <div className="detach-dialog-content">
            <p>
              ¿Deseas quitar <strong>{fileToDetach.originalFilename}</strong> ({formatFileSize(fileToDetach.sizeBytes)})?
            </p>
            <p className="integration-note">
              <Icon name="layers" />
              Los estudiantes ya no podrán ver ni descargar este archivo adjunto.
            </p>
            <div className="showcase-dialog-actions">
              <Button disabled={detaching} onClick={() => setFileToDetach(null)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button loading={detaching} onClick={() => void detach(fileToDetach)} type="button" variant="danger">
                Quitar archivo
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

export function TeacherAttachmentDialog({
  api,
  item,
  onChanged,
  onClose,
}: {
  api: AcademicApiClient;
  item: LearningItem;
  onChanged?: (() => void) | undefined;
  onClose: () => void;
}) {
  const itemType = item.type === 'ASSIGNMENT' ? 'Actividad' : item.type === 'ASSESSMENT' ? 'Evaluación' : 'Material';

  return (
    <Dialog
      description={`${itemType}: ${item.title}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title="Archivos adjuntos"
    >
      <TeacherAttachmentManager api={api} item={item} onChanged={onChanged} />
    </Dialog>
  );
}
