'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from './icons';

export interface ScrollableTabsBarProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  scrollStep?: number;
}

export function ScrollableTabsBar({
  children,
  className = '',
  ariaLabel,
  scrollStep = 220,
}: ScrollableTabsBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateScrollState();
      });
      observer.observe(el);
      Array.from(el.children).forEach((child) => observer?.observe(child));
    }

    const childObserver =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver((records) => {
            records.forEach((record) => {
              record.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) observer?.observe(node);
              });
            });
            updateScrollState();
          });
    childObserver?.observe(el, { childList: true });

    const timer = setTimeout(updateScrollState, 80);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      observer?.disconnect();
      childObserver?.disconnect();
      clearTimeout(timer);
    };
  }, [updateScrollState]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -scrollStep : scrollStep;
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    el.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <div
      className={`scroll-affordance-wrapper ${canScrollLeft ? 'scroll-affordance--has-left' : ''} ${canScrollRight ? 'scroll-affordance--has-right' : ''} ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      {canScrollLeft ? (
        <button
          aria-label="Desplazar opciones hacia la izquierda"
          className="scroll-affordance-btn scroll-affordance-btn--left"
          onClick={() => handleScroll('left')}
          type="button"
        >
          <Icon name="chevron-left" />
        </button>
      ) : null}

      <div
        className="scroll-affordance-scroller"
        ref={scrollerRef}
      >
        {children}
      </div>

      {canScrollRight ? (
        <>
          <button
            aria-label="Desplazar opciones hacia la derecha"
            className="scroll-affordance-btn scroll-affordance-btn--right"
            onClick={() => handleScroll('right')}
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        </>
      ) : null}
    </div>
  );
}
