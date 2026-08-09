'use client';

import { Alert, Button } from '@edupay/ui';
import type { StorageFile } from '@edupay/contracts';
import { useCallback, useEffect, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { formatFileSize } from '@/components/file-upload-queue';
import { Icon } from '@/components/icons';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadError(error: unknown): string {
  if (error instanceof AcademicApiError && error.status === 403) {
    return 'No tienes autorización para descargar este archivo.';
  }
  if (error instanceof AcademicApiError && error.status === 404) {
    return 'El archivo ya no está disponible.';
  }
  return 'No pudimos descargar este archivo. Inténtalo nuevamente.';
}

export function LearningAttachmentList({
  api,
  learningItemId,
}: {
  api: AcademicApiClient;
  learningItemId: string;
}) {
  const supported = typeof api.listLearningAttachments === 'function';
  const [attachments, setAttachments] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState('');
  const [downloadErrorMessage, setDownloadErrorMessage] = useState('');

  const load = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError('');
    try {
      setAttachments(await api.listLearningAttachments(learningItemId));
    } catch (nextError) {
      setError(nextError instanceof AcademicApiError && nextError.status === 403
        ? 'Los archivos adjuntos no están disponibles para esta sesión.'
        : 'No pudimos cargar los archivos adjuntos.');
    } finally {
      setLoading(false);
    }
  }, [api, learningItemId, supported]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function download(file: StorageFile) {
    setDownloadErrorMessage('');
    try {
      const response = await api.downloadFile(file.id);
      downloadBlob(response.blob, response.filename ?? file.originalFilename);
    } catch (nextError) {
      setDownloadErrorMessage(downloadError(nextError));
    }
  }

  if (!supported || (!loading && !error && attachments.length === 0)) return null;

  return <section aria-labelledby={`learning-attachments-title-${learningItemId}`} className="learning-attachments">
    <div className="section-heading">
      <div>
        <h2 id={`learning-attachments-title-${learningItemId}`}>Archivos adjuntos</h2>
        <p>Descarga los materiales autorizados por tu docente.</p>
      </div>
    </div>
    {error ? <Alert action={<Button onClick={() => void load()} variant="secondary">Reintentar</Button>} title="No pudimos cargar los adjuntos" tone="error">{error}</Alert> : null}
    {downloadErrorMessage ? <Alert title="No se pudo descargar el archivo" tone="error">{downloadErrorMessage}</Alert> : null}
    {loading ? <div aria-label="Cargando archivos adjuntos" className="academic-loading"><div className="ui-skeleton" /></div> : null}
    {!loading && attachments.length ? <div className="attachment-list">{attachments.map((file) => <div className="attachment-row" key={file.id}>
      <Icon name="paperclip" />
      <span><strong>{file.originalFilename}</strong><small>{formatFileSize(file.sizeBytes)} · {file.detectedMime}</small></span>
      <Button aria-label={`Descargar ${file.originalFilename}`} onClick={() => void download(file)} size="icon" title="Descargar" variant="ghost"><Icon name="download" /></Button>
    </div>)}</div> : null}
  </section>;
}
