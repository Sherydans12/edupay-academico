'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

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
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.open = true;
      } catch {
        dialog.setAttribute('open', '');
      }
      dialog
        .querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
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
      {openLabel ? (
        <Button onClick={() => setOpen(true)}>{openLabel}</Button>
      ) : null}
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
          <Button
            aria-label="Cerrar diálogo"
            onClick={() => setOpen(false)}
            size="icon"
            variant="ghost"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
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
  align?: 'end' | 'start';
  children: ReactNode;
  label: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [measuredAlign, setMeasuredAlign] = useState<'end' | 'start'>(align);
  const effectiveAlign = open ? measuredAlign : align;

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const adjustAlignment = () => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      if (rect.left < 8) {
        setMeasuredAlign('start');
      } else if (rect.right > viewportWidth - 8) {
        setMeasuredAlign('end');
      }
    };
    const frameId = window.requestAnimationFrame(adjustAlignment);
    window.addEventListener('resize', adjustAlignment);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', adjustAlignment);
    };
  }, [open, align]);

  return (
    <div
      className={`ui-dropdown ${open ? 'ui-dropdown--open' : ''}`}
      data-open={open ? 'true' : undefined}
      ref={wrapperRef}
    >
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
        <div
          aria-label={label}
          className={`ui-dropdown__menu ui-dropdown__menu--${effectiveAlign}`}
          ref={menuRef}
          role="menu"
        >
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
    <button
      className="ui-dropdown__item"
      onClick={onSelect}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}

export interface TabItem {
  content: ReactNode;
  id: string;
  label: string;
}

export function Tabs({
  defaultTab,
  items,
  label,
}: {
  defaultTab?: string;
  items: TabItem[];
  label: string;
}) {
  const fallback = items[0]?.id ?? '';
  const [active, setActive] = useState(defaultTab ?? fallback);
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasScrolledOnce, setHasScrolledOnce] = useState(false);

  const checkScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
    if (el.scrollLeft > 15) {
      setHasScrolledOnce(true);
    }
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(checkScroll);
      observer.observe(el);
    }
    const timer = setTimeout(checkScroll, 60);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      observer?.disconnect();
      clearTimeout(timer);
    };
  }, [checkScroll]);

  const activateByKeyboard = (currentIndex: number, key: string) => {
    if (!items.length) return;
    let nextIndex: number | undefined;
    if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length;
    if (key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (key === 'Home') nextIndex = 0;
    if (key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;
    const next = items[nextIndex];
    if (!next) return;
    setActive(next.id);
    document.getElementById(`${next.id}-tab`)?.focus();
  };

  const scrollBy = (amount: number) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setHasScrolledOnce(true);
  };

  return (
    <div className="ui-tabs">
      <div
        className={`ui-tabs__nav-wrapper scroll-affordance-wrapper ${canScrollLeft ? 'scroll-affordance--has-left' : ''} ${canScrollRight ? 'scroll-affordance--has-right' : ''}`}
      >
        {canScrollLeft ? (
          <button
            aria-label="Desplazar pestañas hacia la izquierda"
            className="scroll-affordance-btn scroll-affordance-btn--left ui-tabs__scroll-btn"
            onClick={() => scrollBy(-180)}
            tabIndex={-1}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="16"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : null}

        <div
          aria-label={label}
          className="ui-tabs__list scroll-affordance-scroller"
          ref={listRef}
          role="tablist"
        >
          {items.map((item, index) => (
            <button
              aria-controls={`${item.id}-panel`}
              aria-selected={active === item.id}
              className="ui-tabs__tab"
              id={`${item.id}-tab`}
              key={item.id}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => {
                if (
                  ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  activateByKeyboard(index, event.key);
                }
              }}
              role="tab"
              tabIndex={active === item.id ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {canScrollRight ? (
          <>
            {!hasScrolledOnce ? (
              <div
                aria-hidden="true"
                className="scroll-affordance-cue ui-tabs__scroll-cue"
                onClick={() => scrollBy(180)}
              >
                <span>Desliza</span>
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="12"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                  width="12"
                >
                  <line x1="5" x2="19" y1="12" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            ) : null}
            <button
              aria-label="Desplazar pestañas hacia la derecha"
              className="scroll-affordance-btn scroll-affordance-btn--right ui-tabs__scroll-btn"
              onClick={() => scrollBy(180)}
              tabIndex={-1}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
                width="16"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        ) : null}
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

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: string;
}) {
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
