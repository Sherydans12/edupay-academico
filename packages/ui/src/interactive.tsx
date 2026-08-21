'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './components';

export function Dialog({
  children,
  description,
  onOpenChange,
  open: controlledOpen,
  openLabel,
  title,
}: {
  children: ReactNode;
  description?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  openLabel?: string;
  title: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? uncontrolledOpen;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const setOpen = (next: boolean) => {
    if (!next && openerRef.current) {
      const opener = openerRef.current;
      openerRef.current = null;
      window.setTimeout(() => opener.focus(), 0);
    }
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.open = true;
      } catch {
        dialog.setAttribute('open', '');
      }
      dialog.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    }
    if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  return (
    <>
      {openLabel ? <Button onClick={() => setOpen(true)}>{openLabel}</Button> : null}
      <dialog
        className="ui-dialog"
        aria-modal="true"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        <div className="ui-dialog__header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Button aria-label="Cerrar diálogo" onClick={() => setOpen(false)} size="icon" variant="ghost">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Button>
        </div>
        <div className="ui-dialog__content">{children}</div>
      </dialog>
    </>
  );
}

export function DropdownMenu({
  align = 'end',
  children,
  label,
  trigger,
}: {
  align?: 'start' | 'end';
  children: ReactNode;
  label: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className="ui-dropdown" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="ui-dropdown__trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div aria-label={label} className={`ui-dropdown__menu ui-dropdown__menu--${align}`} role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <button className="ui-dropdown__item" onClick={onSelect} role="menuitem" type="button">
      {children}
    </button>
  );
}

export interface TabItem {
  content: ReactNode;
  id: string;
  label: string;
}

export function Tabs({ defaultTab, items, label }: { defaultTab?: string; items: TabItem[]; label: string }) {
  const fallback = items[0]?.id ?? '';
  const [active, setActive] = useState(defaultTab ?? fallback);

  const activateByKeyboard = (currentIndex: number, key: string) => {
    if (!items.length) return;
    let nextIndex: number | undefined;
    if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length;
    if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (key === 'Home') nextIndex = 0;
    if (key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;
    const next = items[nextIndex];
    if (!next) return;
    setActive(next.id);
    document.getElementById(`${next.id}-tab`)?.focus();
  };

  return (
    <div className="ui-tabs">
      <div aria-label={label} className="ui-tabs__list" role="tablist">
        {items.map((item, index) => (
          <button
            aria-controls={`${item.id}-panel`}
            aria-selected={active === item.id}
            className="ui-tabs__tab"
            id={`${item.id}-tab`}
            key={item.id}
            onKeyDown={(event) => {
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                activateByKeyboard(index, event.key);
              }
            }}
            onClick={() => setActive(item.id)}
            role="tab"
            tabIndex={active === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          aria-labelledby={`${item.id}-tab`}
          hidden={active !== item.id}
          id={`${item.id}-panel`}
          key={item.id}
          role="tabpanel"
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  const id = useId();
  return (
    <span className="ui-tooltip">
      <span aria-describedby={id} className="ui-tooltip__anchor" tabIndex={0}>
        {children}
      </span>
      <span className="ui-tooltip__content" id={id} role="tooltip">
        {content}
      </span>
    </span>
  );
}
