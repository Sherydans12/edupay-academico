'use client';

import { Alert, Badge, Button, Textarea } from '@edupay/ui';
import type { LearningItem, StoragePolicy, Submission, SubmissionRevision } from '@edupay/contracts';
import { useCallback, useEffect, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';
import { formatFileSize, submissionErrorMessage, UploadQueueView, useFileUploadQueue } from '@/components/file-upload-queue';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusMeta(status: Submission['status'] | 'PENDING') {
  if (status === 'CHANGES_REQUESTED') return { label: 'Cambios solicitados', tone: 'warning' as const };
  if (status === 'REVIEWED') return { label: 'Revisada', tone: 'success' as const };
  if (status === 'SUBMITTED') return { label: 'Enviada', tone: 'info' as const };
  return { label: 'Pendiente', tone: 'neutral' as const };
}

function reviewLabel(action: SubmissionRevision['reviews'][number]['action']): string {
  if (action === 'REVIEWED') return 'Revisión completada';
  if (action === 'CHANGES_REQUESTED') return 'Cambios solicitados';
  return 'Comentario del docente';
}

function isNotFound(error: unknown): boolean {
  return error instanceof AcademicApiError && error.status === 404;
}

function latestRevision(submission: Submission | null): SubmissionRevision | undefined {
  return submission?.revisions[submission.revisions.length - 1];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StudentSubmissionWorkflow({
  api,
  item,
}: {
  api: AcademicApiClient;
  item: LearningItem;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [policy, setPolicy] = useState<StoragePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const queue = useFileUploadQueue({ api, category: 'STUDENT_SUBMISSION', parentId: item.id, policy, maxFiles: 20 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const getSubmission = typeof api.getOwnSubmission === 'function'
        ? api.getOwnSubmission(item.id).catch((nextError) => isNotFound(nextError) ? null : Promise.reject(nextError))
        : Promise.resolve(null);
      const getPolicy = typeof api.getStoragePolicy === 'function'
        ? api.getStoragePolicy().catch((nextError) => nextError instanceof AcademicApiError && nextError.status === 403 ? null : Promise.reject(nextError))
        : Promise.resolve(null);
      const [nextSubmission, nextPolicy] = await Promise.all([getSubmission, getPolicy]);
      setSubmission(nextSubmission);
      setPolicy(nextPolicy);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, item.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const status = submission?.status ?? 'PENDING';
  const meta = statusMeta(status);
  const latest = latestRevision(submission);
  const canSubmit = status === 'PENDING' || status === 'CHANGES_REQUESTED';
  const revisionVerb = status === 'CHANGES_REQUESTED' ? 'Enviar nueva revisión' : 'Enviar trabajo';

  async function submit() {
    setActionError('');
    setSuccess('');
    if (!queue.rows.length) {
      setActionError('Selecciona al menos un archivo para continuar.');
      return;
    }
    setSaving(true);
    try {
      if (queue.hasWaiting && !(await queue.uploadPending())) {
        setActionError('Uno o más archivos no se pudieron finalizar. Revisa cada error y reintenta antes de enviar.');
        return;
      }
      if (queue.hasFailed) {
        setActionError('Revisa los archivos con error antes de enviar el trabajo.');
        return;
      }
      const fileObjectIds = queue.getCompletedFileIds();
      if (fileObjectIds.length === 0) {
        setActionError('No hay archivos finalizados para enviar. Revisa la lista e inténtalo nuevamente.');
        return;
      }
      const input = { fileObjectIds, studentComment: comment.trim() || undefined };
      const nextSubmission = status === 'CHANGES_REQUESTED' && submission
        ? await api.submitSubmissionRevision(submission.id, input)
        : await api.submitLearningItem(item.id, input);
      setSubmission(nextSubmission);
      setComment('');
      queue.clear();
      setSuccess(status === 'CHANGES_REQUESTED' ? 'La nueva revisión quedó registrada.' : 'Tu trabajo quedó enviado correctamente.');
    } catch (nextError) {
      setActionError(submissionErrorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function download(fileObjectId: string, originalFilename: string) {
    setActionError('');
    try {
      const downloaded = await api.downloadFile(fileObjectId);
      downloadBlob(downloaded.blob, downloaded.filename ?? originalFilename);
    } catch (nextError) {
      setActionError(nextError instanceof AcademicApiError && nextError.status === 404 ? 'El archivo ya no está disponible.' : 'No pudimos descargar este archivo. Inténtalo nuevamente.');
    }
  }

  const latestChangeRequest = latest?.reviews.filter((review) => review.action === 'CHANGES_REQUESTED').at(-1);

  if (loading) return <section aria-label="Cargando entrega" className="upload-panel submission-seam"><div className="academic-loading"><div className="ui-skeleton" /><div className="ui-skeleton" /></div></section>;
  if (error) return <section className="upload-panel submission-seam"><Alert action={<Button onClick={() => void load()} variant="secondary">Reintentar</Button>} title="No pudimos cargar tu entrega" tone="error">{error instanceof AcademicApiError ? error.message : 'Inténtalo nuevamente.'}</Alert></section>;

  return <section aria-labelledby="submission-title" className="upload-panel submission-seam">
    <div className="upload-panel__heading">
      <div><h2 id="submission-title">Tu entrega</h2><p>Una entrega puede tener hasta 20 archivos. Cada archivo se valida y finaliza por separado.</p></div>
      <Badge tone={meta.tone}><Icon name={status === 'REVIEWED' ? 'check' : status === 'CHANGES_REQUESTED' ? 'review' : 'document'} />{meta.label}</Badge>
    </div>

    {status === 'CHANGES_REQUESTED' && <Alert title="Tu docente solicitó cambios" tone="warning">Corrige el trabajo y envía una nueva revisión. Las revisiones anteriores permanecerán en el historial.{latestChangeRequest?.comment ? ` Comentario: ${latestChangeRequest.comment}` : ''}</Alert>}
    {status === 'SUBMITTED' && <Alert title="Trabajo enviado" tone="info">Tu docente aún no termina la revisión. No puedes crear otra revisión mientras la entrega esté en este estado.</Alert>}
    {status === 'REVIEWED' && <Alert title="Revisión completada" tone="success">Esta entrega ya fue revisada. El MVP no permite un envío libre posterior.</Alert>}
    {success ? <Alert title="Cambios guardados" tone="success">{success}</Alert> : null}
    {actionError ? <Alert title="No se pudo completar la entrega" tone="error">{actionError}</Alert> : null}

    {canSubmit ? <>
      <UploadQueueView
        action={() => void submit()}
        actionDisabled={queue.hasFailed || !queue.rows.length}
        actionLabel={revisionVerb}
        actionLoading={saving}
        id={`submission-files-${item.id}`}
        maxFiles={20}
        queue={queue}
        subtitle={`${policy ? `Máximo ${formatFileSize(policy.maxFileSizeBytes)} por archivo` : 'Máximo 25 MB por archivo'} · ${queue.accept.replaceAll(',', ', ')}`}
      />
      <Textarea id={`submission-comment-${item.id}`} label="Comentario opcional" maxLength={20_000} onChange={(event) => setComment(event.target.value)} placeholder="Agrega una nota breve para tu docente…" value={comment} />
      <p className="integration-note"><Icon name="layers" />Los archivos se conservan mientras eliges qué enviar; después de finalizar ya no se guardan bytes en el navegador.</p>
    </> : null}

    {submission?.revisions.length ? <section aria-labelledby="revision-history-title" className="revision-history">
      <div className="section-heading"><div><h3 id="revision-history-title">Historial de revisiones</h3><p>Las fechas de atraso y plazo efectivo son snapshots entregados por el servidor.</p></div></div>
      <div className="revision-list">
        {submission.revisions.map((revision) => <article className={`revision-card${revision.isLate ? ' revision-card--late' : ''}`} key={revision.id}>
          <header><div><h4>Revisión {revision.revisionNumber}</h4><p>Enviada {formatDate(revision.submittedAt)} · plazo efectivo {formatDate(revision.effectiveDueAt)}</p></div><Badge tone={revision.isLate ? 'warning' : 'success'}><Icon name={revision.isLate ? 'clock' : 'check'} />{revision.isLate ? 'Enviada con atraso' : 'Enviada a tiempo'}</Badge></header>
          {revision.studentComment ? <p className="revision-comment"><strong>Tu comentario</strong>{revision.studentComment}</p> : null}
          <div className="revision-files"><strong>Archivos ({revision.files.length})</strong>{revision.files.map((file) => <Button aria-label={`Descargar ${file.originalFilename}`} key={file.id} onClick={() => void download(file.id, file.originalFilename)} variant="secondary"><Icon name="download" /><span>{file.originalFilename}</span><small>{formatFileSize(file.sizeBytes)}</small></Button>)}</div>
          {revision.reviews.length ? <div className="revision-reviews"><strong>Comentarios y revisión</strong>{revision.reviews.map((review) => <div className="review-entry" key={review.id}><Badge tone={review.action === 'CHANGES_REQUESTED' ? 'warning' : review.action === 'REVIEWED' ? 'success' : 'info'}>{reviewLabel(review.action)}</Badge><span>{review.comment ?? 'Sin comentario adicional.'}</span><small>{formatDate(review.createdAt)}</small></div>)}</div> : null}
        </article>)}
      </div>
    </section> : <div className="submission-empty"><Icon name="upload" /><strong>Aún no has enviado este trabajo</strong><span>Selecciona tus archivos y envíalos cuando estén listos.</span></div>}
  </section>;
}
