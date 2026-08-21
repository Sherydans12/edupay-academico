'use client';

import { Alert, Badge, Button, EmptyState, Skeleton, Textarea } from '@edupay/ui';
import type { LearningItem, Submission, SubmissionRevision } from '@edupay/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { formatFileSize } from '@/components/file-upload-queue';
import { Icon } from '@/components/icons';

type Roster = Awaited<ReturnType<AcademicApiClient['getTeacherCourseSubjectRoster']>>;

function getTeacherRoster(api: AcademicApiClient, courseSubjectId: string): Promise<Roster> {
  return typeof api.getTeacherCourseSubjectRoster === 'function'
    ? api.getTeacherCourseSubjectRoster(courseSubjectId)
    : Promise.resolve([]);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function submissionStatus(status: Submission['status']) {
  if (status === 'CHANGES_REQUESTED') return { label: 'Cambios solicitados', tone: 'warning' as const };
  if (status === 'REVIEWED') return { label: 'Revisada', tone: 'success' as const };
  if (status === 'SUBMITTED') return { label: 'Enviada', tone: 'info' as const };
  return { label: 'Pendiente', tone: 'neutral' as const };
}

function studentName(studentId: string, roster: Roster): string {
  const student = roster.find((entry) => entry.student.id === studentId)?.student;
  return student ? `${student.firstName} ${student.lastName}` : `Estudiante ${studentId.slice(0, 8)}`;
}

function latestRevision(submission: Submission): SubmissionRevision | undefined {
  return submission.revisions[submission.revisions.length - 1];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TeacherSubmissionList({
  api,
  item,
  roster,
}: {
  api: AcademicApiClient;
  item: LearningItem;
  roster: Roster;
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSubmissions(await api.listSubmissions(item.id)); }
    catch (nextError) { setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos cargar las entregas.'); }
    finally { setLoading(false); }
  }, [api, item.id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return <section aria-labelledby={`submissions-${item.id}`} className="submission-list submission-list--panel">
    <div className="submission-list__heading"><div><h3 id={`submissions-${item.id}`}>{item.title}</h3><p>Vista de entregas autorizadas para este contenido.</p></div><Badge tone="info">{submissions.length} entrega{submissions.length === 1 ? '' : 's'}</Badge></div>
    {loading ? <div className="academic-loading"><Skeleton /><Skeleton /></div> : error ? <Alert action={<Button onClick={() => void load()} variant="secondary">Reintentar</Button>} title="No pudimos cargar las entregas" tone="error">{error}</Alert> : submissions.length ? <div>{submissions.map((submission) => {
      const latest = latestRevision(submission);
      const status = submissionStatus(submission.status);
      return <Link className="submission-row" href={`/docente/revisiones/${submission.id}`} key={submission.id}>
        <span className="submission-row__icon"><Icon name="people" /></span>
        <span><strong>{studentName(submission.studentId, roster)}</strong><small>Revisión {latest?.revisionNumber ?? '—'} · {latest ? formatDate(latest.submittedAt) : 'Sin envío'}</small></span>
        <span className="submission-time">{latest?.isLate ? <Badge tone="warning"><Icon name="clock" />Atrasada</Badge> : <small>A tiempo</small>}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
        <Icon name="chevron-right" />
      </Link>;
    })}</div> : <EmptyState icon={<Icon name="review" />} title="Sin entregas todavía" description="Las entregas de estudiantes aparecerán aquí cuando sean enviadas." />}
  </section>;
}

export function TeacherSubmissionQueue({
  api,
  items,
  courseSubjectId,
}: {
  api: AcademicApiClient;
  items: LearningItem[];
  courseSubjectId: string;
}) {
  const [roster, setRoster] = useState<Roster>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      setError('');
      setLoading(true);
      void getTeacherRoster(api, courseSubjectId).then((nextRoster) => { if (mounted) setRoster(nextRoster); }).catch((nextError) => { if (mounted) { setRoster([]); setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos cargar la lista de estudiantes.'); } }).finally(() => { if (mounted) setLoading(false); });
    }, 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [api, courseSubjectId]);
  if (!items.length) return <EmptyState icon={<Icon name="review" />} title="No hay actividades para revisar" description="Publica una actividad o evaluación para recibir entregas." />;
  if (loading) return <div aria-label="Cargando estudiantes autorizados" className="academic-loading"><Skeleton /><Skeleton /></div>;
  if (error) return <Alert title="No pudimos cargar la lista de estudiantes" tone="error">{error}</Alert>;
  return <div className="teacher-submissions-stack">{items.map((item) => <TeacherSubmissionList api={api} item={item} key={item.id} roster={roster} />)}</div>;
}

function reviewLabel(action: SubmissionRevision['reviews'][number]['action']): string {
  if (action === 'REVIEWED') return 'Revisión completada';
  if (action === 'CHANGES_REQUESTED') return 'Cambios solicitados';
  return 'Comentario';
}

export function TeacherSubmissionDetail({ api, submissionId }: { api: AcademicApiClient; submissionId: string | undefined }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [item, setItem] = useState<LearningItem | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!submissionId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const nextSubmission = await api.getSubmission(submissionId);
      const nextItem = await api.getLearningItem(nextSubmission.learningItemId);
      const nextRoster = await getTeacherRoster(api, nextItem.courseSubjectId).catch(() => []);
      setSubmission(nextSubmission);
      setItem(nextItem);
      setRoster(nextRoster);
      setSelectedRevisionId((current) => current || nextSubmission.revisions[nextSubmission.revisions.length - 1]?.id || '');
    } catch (nextError) {
      setError(nextError instanceof AcademicApiError && nextError.status === 404 ? 'La entrega no está disponible para tu sesión.' : 'No pudimos cargar esta entrega.');
    } finally { setLoading(false); }
  }, [api, submissionId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function review(action: 'COMMENTED' | 'REVIEWED' | 'CHANGES_REQUESTED') {
    if (!selectedRevisionId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const nextSubmission = await api.reviewSubmissionRevision(selectedRevisionId, { action, comment: comment.trim() || undefined });
      setSubmission(nextSubmission);
      setComment('');
      setSuccess(action === 'COMMENTED' ? 'Comentario agregado sin cambiar el estado de la entrega.' : action === 'REVIEWED' ? 'La revisión quedó marcada como completada.' : 'Se solicitaron cambios al estudiante.');
    } catch (nextError) {
      setError(nextError instanceof AcademicApiError ? nextError.message : 'No pudimos guardar la revisión.');
    } finally { setSaving(false); }
  }

  async function download(fileId: string, filename: string) {
    try {
      const response = await api.downloadFile(fileId);
      downloadBlob(response.blob, response.filename ?? filename);
    } catch { setError('No pudimos descargar este archivo. Inténtalo nuevamente.'); }
  }

  const selectedRevision = submission ? submission.revisions.find((revision) => revision.id === selectedRevisionId) ?? latestRevision(submission) : undefined;
  const status = submission ? submissionStatus(submission.status) : null;
  if (loading) return <div aria-label="Cargando entrega" className="academic-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (!submissionId || !submission || !item) return <EmptyState icon={<Icon name="review" />} title="Entrega no disponible" description={error || 'Selecciona una entrega autorizada para revisar.'} />;

  return <>
    <div className="review-layout">
      <section className="review-history-panel"><div className="section-heading"><div><h2>Historial completo</h2><p>{item.title} · {studentName(submission.studentId, roster)}</p></div><Badge tone={status?.tone ?? 'info'}>{status?.label}</Badge></div>
        {error ? <Alert title="No se pudo completar la acción" tone="error">{error}</Alert> : null}
        {success ? <Alert title="Revisión guardada" tone="success">{success}</Alert> : null}
        <div className="revision-list">{submission.revisions.map((revision) => <article className={`revision-card${revision.id === selectedRevision?.id ? ' revision-card--selected' : ''}${revision.isLate ? ' revision-card--late' : ''}`} key={revision.id}>
          <header><button className="revision-select" onClick={() => setSelectedRevisionId(revision.id)} type="button"><strong>Revisión {revision.revisionNumber}</strong><span>Enviada {formatDate(revision.submittedAt)} · plazo efectivo {formatDate(revision.effectiveDueAt)}</span></button><Badge tone={revision.isLate ? 'warning' : 'success'}><Icon name={revision.isLate ? 'clock' : 'check'} />{revision.isLate ? 'Atrasada' : 'A tiempo'}</Badge></header>
          {revision.studentComment ? <p className="revision-comment"><strong>Comentario del estudiante</strong>{revision.studentComment}</p> : null}
          <div className="revision-files"><strong>Archivos ({revision.files.length})</strong>{revision.files.map((file) => <Button aria-label={`Descargar ${file.originalFilename}`} key={file.id} onClick={() => void download(file.id, file.originalFilename)} variant="secondary"><Icon name="download" /><span>{file.originalFilename}</span><small>{formatFileSize(file.sizeBytes)}</small></Button>)}</div>
          {revision.reviews.length ? <div className="revision-reviews"><strong>Historial de revisión</strong>{revision.reviews.map((reviewEntry) => <div className="review-entry" key={reviewEntry.id}><Badge tone={reviewEntry.action === 'CHANGES_REQUESTED' ? 'warning' : reviewEntry.action === 'REVIEWED' ? 'success' : 'info'}>{reviewLabel(reviewEntry.action)}</Badge><span>{reviewEntry.comment ?? 'Sin comentario adicional.'}</span><small>{formatDate(reviewEntry.createdAt)}</small></div>)}</div> : null}
        </article>)}</div>
      </section>
      <aside className="review-panel"><div className="review-student"><span className="subject-hero__mark"><Icon name="people" /></span><div><h1>{studentName(submission.studentId, roster)}</h1><p>Revisión {selectedRevision?.revisionNumber ?? '—'} · {status?.label}</p></div></div><Textarea id="teacher-review-comment" label="Comentario para el estudiante" onChange={(event) => setComment(event.target.value)} placeholder="Escribe una orientación concreta…" value={comment} /><div className="review-actions"><Button disabled={!comment.trim() || saving} loading={saving} onClick={() => void review('COMMENTED')} variant="secondary"><Icon name="message" />Comentar</Button><Button disabled={submission.status !== 'SUBMITTED' || saving} loading={saving} onClick={() => void review('REVIEWED')}><Icon name="check" />Marcar revisada</Button><Button className="review-action--changes" disabled={submission.status !== 'SUBMITTED' || saving} loading={saving} onClick={() => void review('CHANGES_REQUESTED')} variant="accent"><Icon name="review" />Solicitar cambios</Button></div><p className="integration-note"><Icon name="layers" />“Marcar revisada” y “Solicitar cambios” actualizan el estado de la entrega. “Comentar” solo agrega una entrada al historial.</p></aside>
    </div>
  </>;
}
