'use client';

import { Button, Input, Select, Textarea } from '@edupay/ui';
import type {
  LearningBodyDocument,
  LearningContentBlock,
  StorageFile,
} from '@edupay/contracts';
import { useEffect, useMemo, useState } from 'react';

import { Icon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/markdown-renderer';

export function legacyTextToBodyDocument(
  text: string | null | undefined,
): LearningBodyDocument | null {
  if (!text?.trim()) return null;
  return {
    schemaVersion: 1,
    blocks: [{ id: 'legacy-body', type: 'TEXT', text }],
  };
}

export function bodyDocumentToLegacyText(
  document: LearningBodyDocument | null | undefined,
): string {
  if (!document) return '';
  return document.blocks
    .flatMap((block) => {
      switch (block.type) {
        case 'TEXT':
          return block.text;
        case 'CALLOUT':
          return [block.title, block.body].filter(Boolean).join('\n\n');
        case 'RESOURCE':
          return block.label;
        case 'LINK':
          return `[${block.label}](${block.url})`;
        case 'IMAGE':
          return [block.altText, block.caption].filter(Boolean).join('\n');
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

function safeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim(), 'https://edupay.invalid');
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return rawUrl.trim();
    }
  } catch {
    // The contract already rejects this; the renderer fails closed as well.
  }
  return '#';
}

function blockDocument(
  document: LearningBodyDocument | null | undefined,
  fallbackText?: string | null,
): LearningBodyDocument | null {
  return document ?? legacyTextToBodyDocument(fallbackText);
}

export function BodyDocumentRenderer({
  className = '',
  document,
  fallbackText,
  onOpenFile,
}: {
  className?: string | undefined;
  document?: LearningBodyDocument | null | undefined;
  fallbackText?: string | null | undefined;
  onOpenFile?: ((fileObjectId: string) => void) | undefined;
}) {
  const resolved = blockDocument(document, fallbackText);
  if (!resolved?.blocks.length) return null;

  return (
    <div className={`body-document ${className}`.trim()}>
      {resolved.blocks.map((block) => (
        <BodyDocumentBlock
          block={block}
          key={block.id}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function BodyDocumentBlock({
  block,
  onOpenFile,
}: {
  block: LearningContentBlock;
  onOpenFile?: ((fileObjectId: string) => void) | undefined;
}) {
  switch (block.type) {
    case 'TEXT':
      return (
        <section className="body-document-block body-document-block--text">
          <MarkdownRenderer content={block.text} />
        </section>
      );
    case 'CALLOUT':
      return (
        <aside
          className={`body-document-block body-document-callout body-document-callout--${block.tone.toLowerCase()}`}
        >
          <div className="body-document-callout__marker" aria-hidden="true">
            <Icon name="layers" />
          </div>
          <div>
            {block.title ? <h3>{block.title}</h3> : null}
            <MarkdownRenderer content={block.body} />
          </div>
        </aside>
      );
    case 'LINK':
      return (
        <p className="body-document-block body-document-link-block">
          <Icon name="link" />
          <a
            href={safeUrl(block.url)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {block.label}
          </a>
        </p>
      );
    case 'RESOURCE':
      return (
        <div className="body-document-block body-document-resource">
          <Icon name="paperclip" />
          <div>
            <strong>{block.label}</strong>
            {block.description ? <p>{block.description}</p> : null}
          </div>
          {onOpenFile ? (
            <Button
              aria-label={`Abrir recurso ${block.label}`}
              onClick={() => onOpenFile(block.fileObjectId)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Abrir
            </Button>
          ) : null}
        </div>
      );
    case 'IMAGE':
      return (
        <figure className="body-document-block body-document-image">
          <button
            aria-label={`Abrir imagen ${block.altText}`}
            className="body-document-image__preview"
            onClick={() => onOpenFile?.(block.fileObjectId)}
            type="button"
          >
            <Icon name="image" />
            <span>{block.altText}</span>
          </button>
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
  }
}

export function BlockBodyEditor({
  api,
  id,
  label,
  legacyText,
  learningItemId,
  onChange,
  value,
}: {
  api?:
    | {
        listLearningAttachments: (
          learningItemId: string,
        ) => Promise<StorageFile[]>;
      }
    | undefined;
  id: string;
  label: string;
  legacyText?: string | null | undefined;
  learningItemId?: string | undefined;
  onChange: (value: LearningBodyDocument | null) => void;
  value?: LearningBodyDocument | null | undefined;
}) {
  const resolved = useMemo(
    () => (value === undefined ? blockDocument(undefined, legacyText) : value),
    [legacyText, value],
  );
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [attachments, setAttachments] = useState<StorageFile[]>([]);
  const [attachmentsError, setAttachmentsError] = useState('');

  useEffect(() => {
    if (
      !api ||
      !learningItemId ||
      typeof api.listLearningAttachments !== 'function'
    )
      return;
    let active = true;
    void api
      .listLearningAttachments(learningItemId)
      .then((files) => {
        if (active) setAttachments(files);
      })
      .catch(() => {
        if (active)
          setAttachmentsError(
            'No pudimos cargar los adjuntos para insertar un recurso.',
          );
      });
    return () => {
      active = false;
    };
  }, [api, learningItemId]);

  function updateBlocks(blocks: LearningContentBlock[]) {
    onChange(blocks.length ? { schemaVersion: 1, blocks } : null);
  }

  function addBlock(type: LearningContentBlock['type']) {
    const idSuffix =
      globalThis.crypto?.randomUUID?.().slice(0, 8) ??
      `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const nextBlock: LearningContentBlock | null =
      type === 'TEXT'
        ? { id: `text-${idSuffix}`, type, text: '' }
        : type === 'CALLOUT'
          ? { id: `callout-${idSuffix}`, type, tone: 'INFO', body: '' }
          : type === 'LINK'
            ? {
                id: `link-${idSuffix}`,
                type,
                label: 'Nuevo enlace',
                url: 'https://',
              }
            : attachments[0]
              ? type === 'RESOURCE'
                ? {
                    id: `resource-${idSuffix}`,
                    type,
                    fileObjectId: attachments[0].id,
                    label: attachments[0].originalFilename,
                  }
                : {
                    id: `image-${idSuffix}`,
                    type,
                    fileObjectId: attachments[0].id,
                    altText: attachments[0].originalFilename,
                  }
              : null;
    if (!nextBlock) return;
    updateBlocks([...(resolved?.blocks ?? []), nextBlock]);
  }

  function updateBlock(
    idToUpdate: string,
    updates: Partial<LearningContentBlock>,
  ) {
    updateBlocks(
      (resolved?.blocks ?? []).map((block) =>
        block.id === idToUpdate
          ? ({ ...block, ...updates } as LearningContentBlock)
          : block,
      ),
    );
  }

  function removeBlock(idToRemove: string) {
    updateBlocks(
      (resolved?.blocks ?? []).filter((block) => block.id !== idToRemove),
    );
  }

  function moveBlock(idToMove: string, direction: -1 | 1) {
    const blocks = [...(resolved?.blocks ?? [])];
    const index = blocks.findIndex((block) => block.id === idToMove);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
    updateBlocks(blocks);
  }

  return (
    <div className="block-body-editor" id={id}>
      <div className="block-body-editor__header">
        <div>
          <label className="ui-label" htmlFor={`${id}-add-type`}>
            {label}
          </label>
          <p className="ui-field-hint">
            Usa bloques acotados; el contenido publicado conserva la versión
            Markdown como respaldo.
          </p>
        </div>
        <div
          className="block-body-editor__tabs"
          role="tablist"
          aria-label="Editor de contenido"
        >
          <button
            aria-selected={tab === 'edit'}
            className={`rich-text-tab ${tab === 'edit' ? 'rich-text-tab--active' : ''}`}
            onClick={() => setTab('edit')}
            role="tab"
            type="button"
          >
            Editar
          </button>
          <button
            aria-selected={tab === 'preview'}
            className={`rich-text-tab ${tab === 'preview' ? 'rich-text-tab--active' : ''}`}
            onClick={() => setTab('preview')}
            role="tab"
            type="button"
          >
            Vista previa
          </button>
        </div>
      </div>

      {tab === 'preview' ? (
        <div className="block-body-editor__preview" role="tabpanel">
          <BodyDocumentRenderer document={resolved} fallbackText={legacyText} />
          {!resolved ? (
            <p className="body-document-empty">
              Aún no hay bloques para previsualizar.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="block-body-editor__workspace" role="tabpanel">
          <div className="block-body-editor__add-row">
            <Select
              id={`${id}-add-type`}
              label="Agregar bloque"
              defaultValue="TEXT"
            >
              <option value="TEXT">Texto</option>
              <option value="CALLOUT">Aviso destacado</option>
              <option value="LINK">Enlace</option>
              {attachments.length ? (
                <option value="RESOURCE">Recurso adjunto</option>
              ) : null}
              {attachments.length ? (
                <option value="IMAGE">Imagen adjunta</option>
              ) : null}
            </Select>
            <Button
              onClick={() => {
                const select = document.getElementById(
                  `${id}-add-type`,
                ) as HTMLSelectElement | null;
                addBlock(
                  (select?.value as LearningContentBlock['type'] | undefined) ??
                    'TEXT',
                );
              }}
              type="button"
              variant="secondary"
            >
              <Icon name="plus" /> Añadir bloque
            </Button>
          </div>

          {attachmentsError ? (
            <p className="ui-field-error" role="alert">
              {attachmentsError}
            </p>
          ) : null}
          {!resolved?.blocks.length ? (
            <p className="body-document-empty">
              Agrega un bloque de texto, aviso o enlace para comenzar.
            </p>
          ) : (
            <div className="body-document-editor-list">
              {resolved.blocks.map((block, index) => (
                <EditableBodyBlock
                  attachments={attachments}
                  block={block}
                  first={index === 0}
                  key={block.id}
                  last={index === resolved.blocks.length - 1}
                  onChange={(updates) => updateBlock(block.id, updates)}
                  onMove={(direction) => moveBlock(block.id, direction)}
                  onRemove={() => removeBlock(block.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditableBodyBlock({
  attachments,
  block,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  attachments: StorageFile[];
  block: LearningContentBlock;
  first: boolean;
  last: boolean;
  onChange: (updates: Partial<LearningContentBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <article className="body-document-editor-block">
      <div className="body-document-editor-block__header">
        <strong>
          {block.type === 'TEXT'
            ? 'Texto'
            : block.type === 'CALLOUT'
              ? 'Aviso destacado'
              : block.type === 'RESOURCE'
                ? 'Recurso adjunto'
                : block.type === 'IMAGE'
                  ? 'Imagen adjunta'
                  : 'Enlace'}
        </strong>
        <div className="body-document-editor-block__actions">
          <Button
            aria-label="Mover bloque hacia arriba"
            disabled={first}
            onClick={() => onMove(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="arrow-up" />
          </Button>
          <Button
            aria-label="Mover bloque hacia abajo"
            disabled={last}
            onClick={() => onMove(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="arrow-down" />
          </Button>
          <Button
            aria-label="Eliminar bloque"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Icon name="trash" />
          </Button>
        </div>
      </div>
      {block.type === 'TEXT' ? (
        <Textarea
          id={`body-block-${block.id}`}
          label="Texto del bloque"
          onChange={(event) => onChange({ text: event.target.value })}
          value={block.text}
        />
      ) : null}
      {block.type === 'CALLOUT' ? (
        <div className="body-document-editor-grid">
          <Select
            id={`body-block-${block.id}-tone`}
            label="Tono"
            onChange={(event) =>
              onChange({ tone: event.target.value as typeof block.tone })
            }
            value={block.tone}
          >
            <option value="INFO">Información</option>
            <option value="SUCCESS">Logro</option>
            <option value="WARNING">Atención</option>
            <option value="TIP">Sugerencia</option>
          </Select>
          <Input
            id={`body-block-${block.id}-title`}
            label="Título (opcional)"
            onChange={(event) => onChange({ title: event.target.value })}
            value={block.title ?? ''}
          />
          <Textarea
            id={`body-block-${block.id}-body`}
            label="Mensaje"
            onChange={(event) => onChange({ body: event.target.value })}
            value={block.body}
          />
        </div>
      ) : null}
      {block.type === 'LINK' ? (
        <div className="body-document-editor-grid">
          <Input
            id={`body-block-${block.id}-label`}
            label="Texto del enlace"
            onChange={(event) => onChange({ label: event.target.value })}
            value={block.label}
          />
          <Input
            id={`body-block-${block.id}-url`}
            label="URL segura (https://)"
            onChange={(event) => onChange({ url: event.target.value })}
            value={block.url}
          />
        </div>
      ) : null}
      {block.type === 'RESOURCE' ? (
        <div className="body-document-editor-grid">
          <Select
            id={`body-block-${block.id}-file`}
            label="Archivo"
            onChange={(event) => onChange({ fileObjectId: event.target.value })}
            value={block.fileObjectId}
          >
            {attachments.map((file) => (
              <option key={file.id} value={file.id}>
                {file.originalFilename}
              </option>
            ))}
          </Select>
          <Input
            id={`body-block-${block.id}-label`}
            label="Nombre visible"
            onChange={(event) => onChange({ label: event.target.value })}
            value={block.label}
          />
          <Textarea
            id={`body-block-${block.id}-description`}
            label="Descripción (opcional)"
            onChange={(event) => onChange({ description: event.target.value })}
            value={block.description ?? ''}
          />
        </div>
      ) : null}
      {block.type === 'IMAGE' ? (
        <div className="body-document-editor-grid">
          <Select
            id={`body-block-${block.id}-file`}
            label="Archivo de imagen"
            onChange={(event) => onChange({ fileObjectId: event.target.value })}
            value={block.fileObjectId}
          >
            {attachments.map((file) => (
              <option key={file.id} value={file.id}>
                {file.originalFilename}
              </option>
            ))}
          </Select>
          <Input
            id={`body-block-${block.id}-alt`}
            label="Texto alternativo"
            onChange={(event) => onChange({ altText: event.target.value })}
            value={block.altText}
          />
          <Input
            id={`body-block-${block.id}-caption`}
            label="Pie de imagen (opcional)"
            onChange={(event) => onChange({ caption: event.target.value })}
            value={block.caption ?? ''}
          />
        </div>
      ) : null}
    </article>
  );
}
