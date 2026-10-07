'use client';

import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { LearningItem } from '@edupay/contracts';
import { Badge, Button } from '@edupay/ui';
import { Icon } from '@/components/icons';

export interface ItemActionsMenuProps {
  item: LearningItem;
  attachmentSupported: boolean;
  onOpenAdvancedEditor: (item: LearningItem) => void;
  onManageAttachments: (item: LearningItem) => void;
  onSchedule: (item: LearningItem) => void;
  onMoveToUnit: (item: LearningItem) => void;
  onDuplicate: (item: LearningItem) => void;
  onOpenHistory: (item: LearningItem) => void;
  onArchive: (item: LearningItem) => void;
  onRestore: (item: LearningItem) => void;
  onDelete?: ((item: LearningItem) => void) | undefined;
}

export const ItemActionsMenu = memo(function ItemActionsMenu({
  attachmentSupported,
  item,
  onArchive,
  onDelete,
  onDuplicate,
  onManageAttachments,
  onMoveToUnit,
  onOpenAdvancedEditor,
  onOpenHistory,
  onRestore,
  onSchedule,
}: ItemActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const actionItemProps = isMobileViewport
    ? {}
    : { role: 'menuitem' as const, tabIndex: -1 as const };

  const calculatePlacement = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Flip upwards if less than 380px below and more room above
    if (spaceBelow < 380 && spaceAbove > spaceBelow) {
      setPlacement('up');
    } else {
      setPlacement('down');
    }
  }, []);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      calculatePlacement();
      setIsOpen(true);
    }
  };

  const handleSelect = (callback: () => void) => {
    setIsOpen(false);
    callback();
  };

  const closeAndRestoreFocus = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 768px)');
    if (!mediaQuery) return;
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateViewport);
      return () => mediaQuery.removeEventListener('change', updateViewport);
    }
    mediaQuery.addListener?.(updateViewport);
    return () => mediaQuery.removeListener?.(updateViewport);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    if (isMobileViewport) document.body.style.overflow = 'hidden';
    const initialFocus = isMobileViewport
      ? panel?.querySelector<HTMLElement>(
          '.item-actions-panel__close-icon-btn',
        )
      : panel?.querySelector<HTMLElement>('[role="menuitem"]');
    initialFocus?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        if (
          target instanceof Element &&
          target.closest('.item-actions-backdrop')
        ) return;
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePanelKeyDown = (event: KeyboardEvent) => {
      const currentPanel = panelRef.current;
      if (!currentPanel) return;
      if (!isMobileViewport && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(
          currentPanel.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        );
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowDown') {
          nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
        }
        if (event.key === 'ArrowUp') {
          nextIndex =
            currentIndex < 0
              ? items.length - 1
              : (currentIndex - 1 + items.length) % items.length;
        }
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = items.length - 1;
        if (items[nextIndex]) {
          event.preventDefault();
          items[nextIndex]?.focus();
        }
      }
      if (isMobileViewport && event.key === 'Tab') {
        const focusable = Array.from(
          currentPanel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
          ),
        ).filter((element) => {
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          currentPanel.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (!isMobileViewport && event.key === 'Tab') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleResize = () => {
      calculatePlacement();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    panel?.addEventListener('keydown', handlePanelKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      panel?.removeEventListener('keydown', handlePanelKeyDown);
      window.removeEventListener('resize', handleResize);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, isOpen, calculatePlacement]);

  const isArchived = item.publicationStatus === 'ARCHIVED';

  return (
    <div
      className={`item-actions-dropdown ${
        isOpen ? 'item-actions-dropdown--open' : ''
      } ${
        placement === 'up'
          ? 'item-actions-dropdown--up'
          : 'item-actions-dropdown--down'
      }`}
    >
      <button
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-haspopup={isMobileViewport ? 'dialog' : 'menu'}
        aria-label={`Más opciones para ${item.title}`}
        className="ui-dropdown__trigger dropdown-trigger-icon item-actions-trigger"
        onClick={handleToggle}
        ref={triggerRef}
        title="Más opciones de contenido"
        type="button"
      >
        <Icon name="more" />
      </button>

      {isOpen ? (
        <>
          {/* Mobile backdrop */}
          <div
            aria-hidden="true"
            className="item-actions-backdrop"
            onClick={closeAndRestoreFocus}
          />

          {/* Action Menu / Sheet Panel */}
          <div
            aria-label={`Opciones de contenido para ${item.title}`}
            className="item-actions-panel"
            id={panelId}
            aria-modal={isMobileViewport ? true : undefined}
            ref={panelRef}
            role={isMobileViewport ? 'dialog' : 'menu'}
            tabIndex={-1}
            onBlur={(event) => {
              if (isMobileViewport) return;
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                panelRef.current?.contains(nextTarget)
              ) return;
              setIsOpen(false);
            }}
          >
            {/* Mobile Sheet Grab Handle */}
            <div aria-hidden="true" className="item-actions-sheet__handle-bar">
              <span className="item-actions-sheet__handle" />
            </div>

            {/* Panel Header */}
            <div className="item-actions-panel__header">
              <div className="item-actions-panel__header-info">
                <span className="item-actions-panel__type-chip">
                  <Icon
                    name={
                      item.type === 'ASSESSMENT'
                        ? 'award'
                        : item.type === 'ASSIGNMENT'
                          ? 'file-text'
                          : item.type === 'MATERIAL'
                            ? 'book-open'
                            : 'message'
                    }
                  />
                  <span>
                    {item.type === 'ASSESSMENT'
                      ? 'Evaluación'
                      : item.type === 'ASSIGNMENT'
                        ? 'Actividad'
                        : item.type === 'MATERIAL'
                          ? 'Material'
                          : 'Anuncio'}
                  </span>
                </span>
                <h4 className="item-actions-panel__title" title={item.title}>
                  {item.title}
                </h4>
              </div>

              <div className="item-actions-panel__header-badges">
                <Badge
                  tone={
                    item.publicationStatus === 'PUBLISHED'
                      ? 'success'
                      : item.publicationStatus === 'SCHEDULED'
                        ? 'info'
                        : 'neutral'
                  }
                >
                  {item.publicationStatus === 'PUBLISHED'
                    ? 'Publicado'
                    : item.publicationStatus === 'SCHEDULED'
                      ? 'Programado'
                      : item.publicationStatus === 'ARCHIVED'
                        ? 'Archivado'
                        : 'Borrador'}
                </Badge>
                <button
                  aria-label="Cerrar opciones"
                  className="item-actions-panel__close-icon-btn"
                  onClick={closeAndRestoreFocus}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>

            {/* Menu Body */}
            <div className="item-actions-panel__body">
              {isArchived ? (
                /* Archived Items Menu */
                <div className="item-actions-group">
                  <span className="item-actions-group__title">
                    Opciones de archivo
                  </span>
                  <button
                    className="item-action-btn"
                    onClick={() => handleSelect(() => onRestore(item))}
                    {...actionItemProps}
                    type="button"
                  >
                    <span className="item-action-btn__icon item-action-btn__icon--primary">
                      <Icon name="history" />
                    </span>
                    <div className="item-action-btn__copy">
                      <strong className="item-action-btn__title">
                        Restaurar a borrador
                      </strong>
                      <small className="item-action-btn__desc">
                        Reactivar contenido para editar y publicar
                      </small>
                    </div>
                  </button>

                  <button
                    className="item-action-btn"
                    onClick={() => handleSelect(() => onOpenHistory(item))}
                    {...actionItemProps}
                    type="button"
                  >
                    <span className="item-action-btn__icon item-action-btn__icon--neutral">
                      <Icon name="history" />
                    </span>
                    <div className="item-action-btn__copy">
                      <strong className="item-action-btn__title">
                        Historial de versiones
                      </strong>
                      <small className="item-action-btn__desc">
                        Auditar cambios, autores y restaurar
                      </small>
                    </div>
                  </button>

                  {onDelete ? (
                    <button
                      className="item-action-btn item-action-btn--danger"
                      onClick={() => handleSelect(() => onDelete(item))}
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--danger">
                        <Icon name="trash" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Eliminar permanentemente
                        </strong>
                        <small className="item-action-btn__desc">
                          Eliminar registro definitivamente
                        </small>
                      </div>
                    </button>
                  ) : null}
                </div>
              ) : (
                /* Active / Draft Items Menu */
                <>
                  {/* Grupo 1: Edición y Recursos */}
                  <div className="item-actions-group">
                    <span className="item-actions-group__title">
                      Edición y Recursos
                    </span>
                    <button
                      className="item-action-btn"
                      onClick={() =>
                        handleSelect(() => onOpenAdvancedEditor(item))
                      }
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--accent">
                        <Icon name="edit" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Editor avanzado y borrador
                        </strong>
                        <small className="item-action-btn__desc">
                          Edición en bloques, vista previa y publicación
                        </small>
                      </div>
                    </button>

                    {attachmentSupported ? (
                      <button
                        className="item-action-btn"
                        onClick={() =>
                          handleSelect(() => onManageAttachments(item))
                        }
                        {...actionItemProps}
                        type="button"
                      >
                        <span className="item-action-btn__icon item-action-btn__icon--info">
                          <Icon name="paperclip" />
                        </span>
                        <div className="item-action-btn__copy">
                          <strong className="item-action-btn__title">
                            Archivos adjuntos
                          </strong>
                          <small className="item-action-btn__desc">
                            Documentos y lecturas de apoyo
                          </small>
                        </div>
                      </button>
                    ) : null}
                  </div>

                  {/* Grupo 2: Organización */}
                  <div className="item-actions-group">
                    <span className="item-actions-group__title">
                      Organización y Planificación
                    </span>

                    {item.publicationStatus === 'DRAFT' ||
                    item.publicationStatus === 'SCHEDULED' ? (
                      <button
                        className="item-action-btn"
                        onClick={() => handleSelect(() => onSchedule(item))}
                        {...actionItemProps}
                        type="button"
                      >
                        <span className="item-action-btn__icon item-action-btn__icon--warning">
                          <Icon name="calendar" />
                        </span>
                        <div className="item-action-btn__copy">
                          <strong className="item-action-btn__title">
                            Programar publicación
                          </strong>
                          <small className="item-action-btn__desc">
                            Definir fecha y hora automática
                          </small>
                        </div>
                      </button>
                    ) : null}

                    <button
                      className="item-action-btn"
                      onClick={() => handleSelect(() => onMoveToUnit(item))}
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--primary">
                        <Icon name="move" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Mover a otra unidad
                        </strong>
                        <small className="item-action-btn__desc">
                          Reubicar en otra unidad temática
                        </small>
                      </div>
                    </button>

                    <button
                      className="item-action-btn"
                      onClick={() => handleSelect(() => onDuplicate(item))}
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--purple">
                        <Icon name="copy" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Duplicar contenido
                        </strong>
                        <small className="item-action-btn__desc">
                          Crear una copia independiente
                        </small>
                      </div>
                    </button>
                  </div>

                  {/* Grupo 3: Historial y Archivo */}
                  <div className="item-actions-group">
                    <span className="item-actions-group__title">
                      Historial y Estado
                    </span>
                    <button
                      className="item-action-btn"
                      onClick={() => handleSelect(() => onOpenHistory(item))}
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--neutral">
                        <Icon name="history" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Historial de versiones
                        </strong>
                        <small className="item-action-btn__desc">
                          Ver auditoría de cambios y restaurar
                        </small>
                      </div>
                    </button>

                    <button
                      className="item-action-btn"
                      onClick={() => handleSelect(() => onArchive(item))}
                      {...actionItemProps}
                      type="button"
                    >
                      <span className="item-action-btn__icon item-action-btn__icon--neutral">
                        <Icon name="archive" />
                      </span>
                      <div className="item-action-btn__copy">
                        <strong className="item-action-btn__title">
                          Archivar contenido
                        </strong>
                        <small className="item-action-btn__desc">
                          Ocultar temporalmente a estudiantes
                        </small>
                      </div>
                    </button>
                  </div>

                  {/* Grupo 4: Zona Crítica (Eliminar) */}
                  {onDelete ? (
                    <div className="item-actions-group item-actions-group--danger">
                      <button
                        className="item-action-btn item-action-btn--danger"
                        onClick={() => handleSelect(() => onDelete(item))}
                        {...actionItemProps}
                        type="button"
                      >
                        <span className="item-action-btn__icon item-action-btn__icon--danger">
                          <Icon name="trash" />
                        </span>
                        <div className="item-action-btn__copy">
                          <strong className="item-action-btn__title">
                            Eliminar contenido
                          </strong>
                          <small className="item-action-btn__desc">
                            Eliminar definitivamente (si no tiene entregas)
                          </small>
                        </div>
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* Mobile Sheet Footer Cancel Button */}
            <div className="item-actions-sheet__footer">
              <Button
                className="item-actions-sheet__close-btn"
                onClick={closeAndRestoreFocus}
                type="button"
                variant="secondary"
              >
                Cerrar opciones
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});
