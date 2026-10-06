'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from './icons';

export interface ScrollableTabsBarProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  scrollStep?: number;
  /**
   * If true, shows a subtle visual cue "Desliza ›" when scrollable right.
   */
  showSwipeCue?: boolean;
}

export function ScrollableTabsBar({
  children,
  className = '',
  ariaLabel,
  scrollStep = 220,
  showSwipeCue = true,
}: ScrollableTabsBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasScrolledOnce, setHasScrolledOnce] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    if (scrollLeft > 20) {
      setHasScrolledOnce(true);
    }
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
    }

    const timer = setTimeout(updateScrollState, 80);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      observer?.disconnect();
      clearTimeout(timer);
    };
  }, [updateScrollState]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -scrollStep : scrollStep;
    el.scrollBy({ left: delta, behavior: 'smooth' });
    setHasScrolledOnce(true);
  };

  return (
    <div
      aria-label={ariaLabel}
      className={`scroll-affordance-wrapper ${canScrollLeft ? 'scroll-affordance--has-left' : ''} ${canScrollRight ? 'scroll-affordance--has-right' : ''} ${className}`}
    >
      {canScrollLeft ? (
        <button
          aria-label="Desplazar opciones hacia la izquierda"
          className="scroll-affordance-btn scroll-affordance-btn--left"
          onClick={() => handleScroll('left')}
          tabIndex={-1}
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
          {showSwipeCue && !hasScrolledOnce ? (
            <div
              aria-hidden="true"
              className="scroll-affordance-cue"
              onClick={() => handleScroll('right')}
            >
              <span>Desliza</span>
              <Icon name="arrow-right" />
            </div>
          ) : null}
          <button
            aria-label="Desplazar opciones hacia la derecha"
            className="scroll-affordance-btn scroll-affordance-btn--right"
            onClick={() => handleScroll('right')}
            tabIndex={-1}
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        </>
      ) : null}
    </div>
  );
}
