'use client';

import { Alert, Button } from '@edupay/ui';
import type { StorageFile, StoragePolicy } from '@edupay/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AcademicApiClient } from '@/api/academic-client';
import { AcademicApiError } from '@/api/academic-client';
import { Icon } from '@/components/icons';

export const DEFAULT_MAX_FILE_SIZE_BYTES = 25_000_000;
export const DEFAULT_ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.zip'];

export type UploadRowStatus = 'waiting' | 'uploading' | 'validating' | 'completed' | 'failed';

export interface UploadRow {
  id: string;
  file: File | null;
  filename: string;
  sizeBytes: number;
  status: UploadRowStatus;
  progress: number;
  error: string | undefined;
  retryable: boolean;
  result: StorageFile | undefined;
}

export interface FileUploadQueue {
  rows: UploadRow[];
  accept: string;
  selectionError: string;
  hasFailed: boolean;
  hasWaiting: boolean;
  completedFileIds: string[];
  getCompletedFileIds: () => string[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  retryFile: (id: string) => Promise<boolean>;
  uploadPending: () => Promise<boolean>;
  clear: () => void;
}

function normalizedExtensions(policy?: StoragePolicy | null): string[] {
  return (policy?.allowedExtensions?.length ? policy.allowedExtensions : DEFAULT_ALLOWED_EXTENSIONS)
    .map((extension) => extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`);
}

function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_000) return `${sizeBytes} B`;
  if (sizeBytes < 1_000_000) return `${(sizeBytes / 1_000).toFixed(1)} kB`;
  return `${(sizeBytes / 1_000_000).toFixed(sizeBytes < 10_000_000 ? 1 : 0)} MB`;
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof AcademicApiError) {
    if (error.code === 'UPLOAD_INTENT_EXPIRED' || error.status === 410 || /expired|expir/i.test(error.message)) return 'La autorización de carga expiró. Reintenta este archivo para crear una nueva autorización.';
    if (error.code === 'FILE_TOO_LARGE' || error.status === 413) return 'El archivo supera el tamaño máximo permitido por el servidor.';
    if (error.code === 'FILE_TYPE_NOT_ALLOWED' || error.code === 'FILE_CONTENT_MISMATCH') return 'El tipo o el contenido del archivo no coincide con los formatos permitidos.';
    if (error.code === 'TENANT_STORAGE_QUOTA_EXCEEDED' || error.code === 'GLOBAL_STORAGE_QUOTA_EXCEEDED' || /quota|cuota|storage/i.test(error.message)) return 'El almacenamiento está lleno. No se pueden subir archivos nuevos; las descargas existentes siguen disponibles.';
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión e inténtalo nuevamente.';
    if (error.status === 403) return 'No tienes autorización para cargar este archivo en esta actividad.';
    if (error.status === 404) return 'La actividad ya no está disponible para esta carga.';
    if (error.status === 409) return 'La carga entró en conflicto con otro cambio. Revisa el estado e inténtalo nuevamente.';
    if (error.status === 400) return 'Revisa el nombre, formato y tamaño del archivo e inténtalo nuevamente.';
    if (error.status === 429) return 'Hay demasiadas cargas en curso. Espera un momento y reintenta este archivo.';
    if (error.status === 0 || error.code === 'NETWORK_ERROR') return 'No pudimos conectar con Académico. Conservamos el archivo para que puedas reintentar.';
    if (error.status >= 500) return 'El servicio de archivos no está disponible temporalmente. Reintenta este archivo.';
    return 'No pudimos completar la carga. Revisa el archivo e inténtalo nuevamente.';
  }
  return 'No pudimos completar la carga. Conservamos el archivo para que puedas reintentar.';
}

export function submissionErrorMessage(error: unknown): string {
  if (error instanceof AcademicApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión e inténtalo nuevamente.';
    if (error.status === 403) return 'No tienes autorización para enviar trabajo en esta actividad.';
    if (error.status === 404) return 'La actividad o la entrega ya no está disponible.';
    if (error.status === 409) return 'La entrega cambió mientras la enviabas. Actualiza el estado e inténtalo nuevamente.';
    if (error.status === 400) return 'Revisa que haya entre 1 y 20 archivos finalizados e inténtalo nuevamente.';
    if (error.status >= 500) return 'No pudimos registrar la entrega temporalmente. Tus archivos finalizados siguen disponibles para reintentar.';
  }
  return 'No pudimos registrar la entrega. Tus archivos finalizados siguen disponibles para reintentar.';
}

function localFileError(file: File, policy?: StoragePolicy | null): string | undefined {
  const maxSize = policy?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  if (file.size > maxSize) return `Supera el máximo de ${formatFileSize(maxSize)} por archivo.`;
  if (!normalizedExtensions(policy).includes(extensionOf(file.name))) return 'Este formato no está permitido para archivos académicos.';
  return undefined;
}

function makeRow(file: File, policy?: StoragePolicy | null): UploadRow {
  const error = localFileError(file, policy);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
    file: error ? null : file,
    filename: file.name,
    sizeBytes: file.size,
    status: error ? 'failed' : 'waiting',
    progress: 0,
    error,
    retryable: !error,
    result: undefined,
  };
}

export function useFileUploadQueue({
  api,
  category,
  maxFiles = 20,
  parentId,
  policy,
}: {
  api: AcademicApiClient;
  category: 'LEARNING_MATERIAL' | 'ASSIGNMENT_SOURCE' | 'ASSESSMENT_SOURCE' | 'STUDENT_SUBMISSION';
  maxFiles?: number;
  parentId: string;
  policy?: StoragePolicy | null;
}): FileUploadQueue {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const rowsRef = useRef(rows);
  const runningRef = useRef(new Set<string>());
  const completedFileIdsRef = useRef(new Map<string, string>());
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const updateRow = useCallback((id: string, update: Partial<UploadRow>) => {
    const next = rowsRef.current.map((row) => row.id === id ? { ...row, ...update } : row);
    rowsRef.current = next;
    setRows(next);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const selected = Array.from(files);
    setSelectionError('');
    setRows((current) => {
      const remaining = maxFiles - current.length;
      if (remaining <= 0) {
        setSelectionError(`Puedes adjuntar hasta ${maxFiles} archivos por entrega.`);
        return current;
      }
      if (selected.length > remaining) setSelectionError(`Solo se agregaron ${remaining} archivos. El máximo por entrega es ${maxFiles}.`);
      const known = new Set(current.map((row) => `${row.filename}-${row.sizeBytes}`));
      const additions = selected.slice(0, remaining).filter((file) => {
        const key = `${file.name}-${file.size}`;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      }).map((file) => makeRow(file, policy));
      if (!additions.length && selected.length) setSelectionError('Esos archivos ya están en la lista.');
      const next = [...current, ...additions];
      rowsRef.current = next;
      return next;
    });
  }, [maxFiles, policy]);

  const removeFile = useCallback((id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id || row.status === 'completed' || row.status === 'uploading' || row.status === 'validating');
      rowsRef.current = next;
      return next;
    });
  }, []);

  const uploadOne = useCallback(async (id: string): Promise<boolean> => {
    if (runningRef.current.has(id)) return false;
    const row = rowsRef.current.find((candidate) => candidate.id === id);
    if (!row?.file || row.status === 'completed') return row?.status === 'completed';
    runningRef.current.add(id);
    updateRow(id, { error: '', progress: 0, status: 'uploading' });
    try {
      const intent = await api.createUploadIntent({
        category,
        filename: row.file.name,
        mimeType: row.file.type || 'application/octet-stream',
        parentId,
        parentType: 'LEARNING_ITEM',
        sizeBytes: row.file.size,
      });
      updateRow(id, { progress: 0, status: 'validating' });
      const result = await api.completeUploadIntent(intent, row.file, (progress) => updateRow(id, { progress }), undefined);
      completedFileIdsRef.current.set(id, result.id);
      updateRow(id, { file: null, progress: 100, result, status: 'completed', retryable: false });
      return true;
    } catch (error) {
      updateRow(id, { error: uploadErrorMessage(error), status: 'failed', retryable: true });
      return false;
    } finally {
      runningRef.current.delete(id);
    }
  }, [api, category, parentId, updateRow]);

  const uploadPending = useCallback(async () => {
    const pendingIds = rowsRef.current.filter((row) => row.status === 'waiting' && row.file).map((row) => row.id);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pendingIds.length) {
        const id = pendingIds[cursor];
        cursor += 1;
        if (id) await uploadOne(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, pendingIds.length) }, () => worker()));
    return pendingIds.every((id) => rowsRef.current.find((row) => row.id === id)?.status === 'completed');
  }, [uploadOne]);

  const clear = useCallback(() => {
    setRows([]);
    rowsRef.current = [];
    completedFileIdsRef.current.clear();
    setSelectionError('');
  }, []);

  const getCompletedFileIds = useCallback(
    () => Array.from(completedFileIdsRef.current.values()),
    [],
  );

  return useMemo(() => ({
    accept: normalizedExtensions(policy).join(','),
    addFiles,
    clear,
    completedFileIds: rows.flatMap((row) => row.result?.id ? [row.result.id] : []),
    getCompletedFileIds,
    hasFailed: rows.some((row) => row.status === 'failed'),
    hasWaiting: rows.some((row) => row.status === 'waiting'),
    removeFile,
    retryFile: (id: string) => uploadOne(id),
    rows,
    selectionError,
    uploadPending,
  }), [addFiles, clear, getCompletedFileIds, policy, removeFile, rows, selectionError, uploadOne, uploadPending]);
}

function statusLabel(row: UploadRow): string {
  if (row.status === 'waiting') return 'En espera';
  if (row.status === 'uploading') return `Subiendo${row.progress ? ` · ${row.progress}%` : ''}`;
  if (row.status === 'validating') return 'Validando y finalizando';
  if (row.status === 'completed') return 'Archivo finalizado';
  return row.error ?? 'No se pudo cargar';
}

export function UploadQueueView({
  action,
  actionDisabled,
  actionLoading,
  actionLabel,
  disabled = false,
  id,
  inputLabel = 'Selecciona tus archivos',
  maxFiles = 20,
  queue,
  subtitle,
}: {
  action?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  actionLabel?: string;
  disabled?: boolean;
  id: string;
  inputLabel?: string;
  maxFiles?: number;
  queue: FileUploadQueue;
  subtitle: string;
}) {
  const busy = queue.rows.some((row) => row.status === 'uploading' || row.status === 'validating');
  const announcement = queue.rows.length
    ? queue.rows.map((row) => `${row.filename}: ${statusLabel(row)}`).join('. ')
    : '';
  return <>
    <input
      aria-label={inputLabel}
      accept={queue.accept}
      className="sr-only"
      disabled={disabled || busy || queue.rows.length >= maxFiles}
      id={id}
      multiple
      onChange={(event) => { if (event.currentTarget.files) queue.addFiles(event.currentTarget.files); event.currentTarget.value = ''; }}
      type="file"
    />
    <label aria-disabled={disabled || busy} className={`upload-dropzone${disabled || busy ? ' upload-dropzone--disabled' : ''}`} htmlFor={id}>
      <span><Icon name="upload" /></span>
      <strong>{disabled ? 'Carga no disponible' : inputLabel}</strong>
      <small>{subtitle}</small>
    </label>
    {queue.selectionError ? <Alert title="No se agregaron todos los archivos" tone="warning">{queue.selectionError}</Alert> : null}
    <div aria-live="polite" className="sr-only">{announcement}</div>
    {queue.rows.length ? <div aria-label="Archivos seleccionados" className="selected-files">
      {queue.rows.map((row) => <div className={`selected-file selected-file--${row.status}`} key={row.id}>
        <Icon name={row.status === 'completed' ? 'check' : row.status === 'failed' ? 'close' : 'document'} />
        <span><strong title={row.filename}>{row.filename}</strong><small>{formatFileSize(row.sizeBytes)} · {statusLabel(row)}</small>{row.status === 'uploading' || row.status === 'validating' ? <progress aria-label={`Progreso de ${row.filename}`} max="100" value={row.progress} /> : null}</span>
        {row.status === 'failed' && row.retryable ? <Button aria-label={`Reintentar ${row.filename}`} loading={false} onClick={() => void queue.retryFile(row.id)} size="sm" variant="secondary">Reintentar</Button> : row.status === 'waiting' || row.status === 'failed' ? <Button aria-label={`Quitar ${row.filename}`} onClick={() => queue.removeFile(row.id)} size="icon" title="Quitar" variant="ghost"><Icon name="close" /></Button> : null}
      </div>)}
    </div> : null}
    {action ? <Button disabled={Boolean(disabled || busy || actionDisabled)} loading={Boolean(actionLoading)} onClick={action} type="button"><Icon name="upload" />{actionLabel ?? 'Subir archivos'}</Button> : null}
  </>;
}
