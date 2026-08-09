'use client';

import { Alert, Badge, Button, Card } from '@edupay/ui';
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

export function TeacherAttachmentManager({ api, item }: { api: AcademicApiClient; item: LearningItem }) {
  const category = categoryFor(item);
  const [attachments, setAttachments] = useState<StorageFile[]>([]);
  const [policy, setPolicy] = useState<StoragePolicy | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
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
      setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos cargar los archivos de esta actividad.');
    } finally {
      setLoading(false);
    }
  }, [api, item.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

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

  if (!category) return null;
  const uploadsBlocked = usage?.state === 'FULL';
  return <Card className="attachment-manager" aria-labelledby={`attachments-title-${item.id}`}>
    <div className="section-heading"><div><h3 id={`attachments-title-${item.id}`}>Archivos adjuntos</h3><p>Los archivos se guardan como referencias autorizadas de este contenido.</p></div><Badge tone={uploadsBlocked ? 'warning' : 'info'}>{attachments.length} archivo{attachments.length === 1 ? '' : 's'}</Badge></div>
    {usage && usage.state !== 'NORMAL' ? <Alert title={quotaLabel(usage.state)} tone={usage.state === 'FULL' || usage.state === 'CRITICAL' ? 'warning' : 'info'}>{uploadsBlocked ? 'No se pueden subir archivos nuevos. Los archivos existentes siguen disponibles para descarga.' : `${usage.remainingPercentage}% de capacidad disponible para nuevas cargas.`}</Alert> : null}
    {error ? <Alert action={<Button onClick={() => void load()} variant="secondary">Reintentar</Button>} title="No pudimos cargar los adjuntos" tone="error">{error}</Alert> : null}
    {loading ? <div aria-label="Cargando archivos adjuntos" className="academic-loading"><div className="ui-skeleton" /></div> : null}
    {!loading && attachments.length ? <div className="attachment-list">{attachments.map((file) => <div className="attachment-row" key={file.id}><Icon name="paperclip" /><span><strong>{file.originalFilename}</strong><small>{formatFileSize(file.sizeBytes)} · {file.detectedMime}</small></span><Button aria-label={`Descargar ${file.originalFilename}`} onClick={() => void download(file)} size="icon" title="Descargar" variant="ghost"><Icon name="download" /></Button></div>)}</div> : null}
    {!loading && !attachments.length ? <p className="attachment-empty">Aún no hay archivos adjuntos.</p> : null}
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
  </Card>;
}
