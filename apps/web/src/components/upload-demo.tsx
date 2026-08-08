'use client';

import { Alert, Button, Textarea } from '@edupay/ui';
import { useRef, useState } from 'react';

import { Icon } from '@/components/icons';

export function UploadDemo() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<string[]>([]);

  return (
    <section aria-labelledby="upload-title" className="upload-panel">
      <div className="upload-panel__heading">
        <div>
          <h2 id="upload-title">Prepara tus archivos</h2>
          <p>Esta demostración permite visualizar la selección local. No envía archivos.</p>
        </div>
        <span className="upload-limit">Máx. 25 MB por archivo</span>
      </div>
      <input
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        id="demo-files"
        multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))}
        ref={inputRef}
        type="file"
      />
      <button className="upload-dropzone" onClick={() => inputRef.current?.click()} type="button">
        <span><Icon name="upload" /></span>
        <strong>Selecciona tus archivos</strong>
        <small>PDF, documentos, presentaciones, planillas o imágenes permitidas</small>
      </button>
      {files.length ? (
        <div aria-live="polite" className="selected-files">
          {files.map((file) => (
            <div key={file}><Icon name="document" /><span><strong>{file}</strong><small>Listo para una futura carga</small></span><Icon name="check" /></div>
          ))}
        </div>
      ) : null}
      <Textarea id="student-comment" label="Comentario opcional" placeholder="Agrega una nota breve para tu profesora…" />
      <Alert title="Integración pendiente" tone="info">
        El botón final permanece desactivado hasta que el flujo de almacenamiento y envío esté conectado y autorizado por el backend.
      </Alert>
      <div className="upload-actions">
        <Button disabled><Icon name="upload" />Enviar trabajo</Button>
        <span>Tu selección permanece solo en este dispositivo durante la demostración.</span>
      </div>
    </section>
  );
}
