'use client';

import { Button } from '@edupay/ui';
import { type KeyboardEvent, useRef, useState } from 'react';

import { Icon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/markdown-renderer';

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  minHeight?: string;
}

export function RichTextEditor({
  error,
  hint,
  id,
  label,
  minHeight = '14rem',
  onChange,
  placeholder = 'Escribe aquí tu contenido… Puedes usar formato Markdown.',
  required = false,
  value,
}: RichTextEditorProps) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormat = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || defaultText;
    const before = value.slice(0, start);
    const after = value.slice(end);

    const replacement = `${prefix}${selected}${suffix}`;
    const nextValue = `${before}${replacement}${after}`;
    onChange(nextValue);

    // Reposition cursor
    window.setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selected.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyFormat('**', '**', 'texto en negrita');
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      applyFormat('*', '*', 'texto en cursiva');
    }
  };

  return (
    <div className="ui-field rich-text-editor">
      <div className="rich-text-editor__header">
        <label className="ui-label" htmlFor={id}>
          {label}
          {required ? ' *' : ''}
        </label>
        <div className="rich-text-editor__tabs" role="tablist">
          <button
            aria-selected={tab === 'edit'}
            className={`rich-text-tab ${tab === 'edit' ? 'rich-text-tab--active' : ''}`}
            onClick={() => setTab('edit')}
            role="tab"
            type="button"
          >
            <Icon name="edit" />
            <span>Editor</span>
          </button>
          <button
            aria-selected={tab === 'preview'}
            className={`rich-text-tab ${tab === 'preview' ? 'rich-text-tab--active' : ''}`}
            onClick={() => setTab('preview')}
            role="tab"
            type="button"
          >
            <Icon name="eye" />
            <span>Vista previa</span>
          </button>
        </div>
      </div>

      {tab === 'edit' ? (
        <div className="rich-text-editor__container">
          <div aria-label="Herramientas de formato" className="rich-text-toolbar" role="toolbar">
            <Button
              aria-label="Encabezado"
              onClick={() => applyFormat('### ', '', 'Título de sección')}
              size="icon"
              title="Encabezado (###)"
              variant="ghost"
            >
              <span className="toolbar-text-btn">H3</span>
            </Button>
            <Button
              aria-label="Negrita (Ctrl+B)"
              onClick={() => applyFormat('**', '**', 'negrita')}
              size="icon"
              title="Negrita (Ctrl+B)"
              variant="ghost"
            >
              <Icon name="bold" />
            </Button>
            <Button
              aria-label="Cursiva (Ctrl+I)"
              onClick={() => applyFormat('*', '*', 'cursiva')}
              size="icon"
              title="Cursiva (Ctrl+I)"
              variant="ghost"
            >
              <Icon name="italic" />
            </Button>
            <span className="toolbar-divider" />
            <Button
              aria-label="Lista con viñetas"
              onClick={() => applyFormat('- ', '', 'Elemento')}
              size="icon"
              title="Lista con viñetas"
              variant="ghost"
            >
              <Icon name="list" />
            </Button>
            <Button
              aria-label="Lista numerada"
              onClick={() => applyFormat('1. ', '', 'Elemento')}
              size="icon"
              title="Lista numerada"
              variant="ghost"
            >
              <Icon name="list-ordered" />
            </Button>
            <Button
              aria-label="Cita"
              onClick={() => applyFormat('> ', '', 'Cita importante')}
              size="icon"
              title="Cita textual"
              variant="ghost"
            >
              <Icon name="quote" />
            </Button>
            <span className="toolbar-divider" />
            <Button
              aria-label="Enlace"
              onClick={() => applyFormat('[', '](https://ejemplo.cl)', 'texto del enlace')}
              size="icon"
              title="Insertar enlace"
              variant="ghost"
            >
              <Icon name="link" />
            </Button>
            <Button
              aria-label="Código"
              onClick={() => applyFormat('`', '`', 'código')}
              size="icon"
              title="Código en línea"
              variant="ghost"
            >
              <Icon name="code" />
            </Button>
            <Button
              aria-label="Tabla"
              onClick={() => applyFormat('\n| Columna 1 | Columna 2 |\n| --- | --- |\n| Dato 1 | Dato 2 |\n', '', '')}
              size="icon"
              title="Insertar tabla"
              variant="ghost"
            >
              <Icon name="table" />
            </Button>
          </div>

          <textarea
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            aria-invalid={Boolean(error)}
            className="ui-input ui-textarea rich-text-textarea"
            id={id}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={textareaRef}
            required={required}
            style={{ minHeight }}
            value={value}
          />
        </div>
      ) : (
        <div className="rich-text-preview" style={{ minHeight }}>
          {value.trim() ? (
            <MarkdownRenderer content={value} />
          ) : (
            <p className="rich-text-preview__empty">No hay contenido para previsualizar aún.</p>
          )}
        </div>
      )}

      {error ? (
        <p className="ui-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ui-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
