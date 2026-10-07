import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScrollableTabsBar } from './scrollable-tabs-bar';

let mutationCallback: MutationCallback | undefined;

class TestMutationObserver {
  constructor(callback: MutationCallback) {
    mutationCallback = callback;
  }

  observe() {}

  disconnect() {}
}

describe('ScrollableTabsBar', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mutationCallback = undefined;
  });

  it('updates scroll controls when options are added after mount', () => {
    vi.stubGlobal('MutationObserver', TestMutationObserver);
    let scrollWidth = 180;
    const { container, rerender } = render(
      <ScrollableTabsBar ariaLabel="Filtros de prueba">
        <button type="button">Primera opción</button>
      </ScrollableTabsBar>,
    );
    const scroller = container.querySelector<HTMLElement>(
      '.scroll-affordance-scroller',
    );
    expect(scroller).toBeTruthy();
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 180 });
    Object.defineProperty(scroller, 'scrollWidth', {
      configurable: true,
      get: () => scrollWidth,
    });

    expect(
      screen.queryByRole('button', {
        name: 'Desplazar opciones hacia la derecha',
      }),
    ).toBeNull();

    scrollWidth = 360;
    rerender(
      <ScrollableTabsBar ariaLabel="Filtros de prueba">
        <button type="button">Primera opción</button>
        <button type="button">Opción agregada</button>
      </ScrollableTabsBar>,
    );
    act(() => mutationCallback?.([], {} as MutationObserver));

    expect(
      screen.getByRole('button', {
        name: 'Desplazar opciones hacia la derecha',
      }),
    ).toBeTruthy();
  });
});
