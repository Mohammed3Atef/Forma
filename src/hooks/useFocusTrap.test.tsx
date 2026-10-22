import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';
import { rovingIndex } from '@/lib/rovingKeys';

/** A modal layer portaled to <body>, as Sheet / dialogs are. */
function Layer({ id, open, onEscape, children }: { id: string; open: boolean; onEscape: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: open, onEscape });
  if (!open) return null;
  return createPortal(
    <div ref={ref} data-testid={id} role="dialog" tabIndex={-1}>
      {children}
    </div>,
    document.body,
  );
}

afterEach(() => {
  cleanup(); // unmount the portals first, then drop the stand-in nodes
  document.body.innerHTML = '';
});

describe('useFocusTrap (B3.9, AX-05)', () => {
  it('Tab cycles the ENABLED controls only — a disabled last button is skipped', () => {
    render(
      <Layer id="sheet" open onEscape={() => {}}>
        <button>first</button>
        <button>middle</button>
        <button disabled>off</button>
      </Layer>,
    );
    const first = screen.getByText('first');
    const middle = screen.getByText('middle');
    // jsdom has no layout: give the controls a client rect so the visibility check sees them.
    for (const el of [first, middle]) el.getClientRects = () => [{}] as unknown as DOMRectList;
    middle.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(middle);
  });

  it('stacked layers: Escape closes only the top one', () => {
    const closeSheet = vi.fn();
    const closeDialog = vi.fn();
    render(
      <>
        <Layer id="sheet" open onEscape={closeSheet}>
          <button>in sheet</button>
        </Layer>
        <Layer id="dialog" open onEscape={closeDialog}>
          <button>in dialog</button>
        </Layer>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
  });

  it('an Escape something inside already handled (preventDefault) leaves the layer open', () => {
    const close = vi.fn();
    render(
      <Layer id="sheet" open onEscape={close}>
        <input data-testid="field" onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()} />
      </Layer>,
    );
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });

  it('the page behind the top layer is inert; the toast region stays live; closing restores it', () => {
    const page = document.createElement('div');
    page.id = 'root-like';
    document.body.appendChild(page);
    const toasts = document.createElement('div');
    toasts.dataset.trapKeep = '';
    document.body.appendChild(toasts);
    const { rerender } = render(
      <Layer id="sheet" open onEscape={() => {}}>
        <button>x</button>
      </Layer>,
    );
    expect(page.hasAttribute('inert')).toBe(true);
    expect(toasts.hasAttribute('inert')).toBe(false);
    rerender(
      <Layer id="sheet" open={false} onEscape={() => {}}>
        <button>x</button>
      </Layer>,
    );
    expect(page.hasAttribute('inert')).toBe(false);
  });
});

describe('rovingIndex (B3.9, AX-05)', () => {
  const ev = (key: string, dir: 'ltr' | 'rtl' = 'ltr') => {
    const el = document.createElement('button');
    el.style.direction = dir;
    document.body.appendChild(el);
    return { key, currentTarget: el } as unknown as ReactKeyboardEvent<HTMLElement>;
  };
  it('Left / Right follow the reading direction and wrap; Home / End jump', () => {
    expect(rovingIndex(ev('ArrowRight'), 0, 3)).toBe(1);
    expect(rovingIndex(ev('ArrowLeft'), 0, 3)).toBe(2);
    expect(rovingIndex(ev('ArrowRight', 'rtl'), 0, 3)).toBe(2);
    expect(rovingIndex(ev('Home'), 2, 3)).toBe(0);
    expect(rovingIndex(ev('End'), 0, 3)).toBe(2);
  });
  it('Up / Down only for vertical (menus) and both (radio groups); other keys do nothing', () => {
    expect(rovingIndex(ev('ArrowDown'), 0, 3, 'vertical')).toBe(1);
    expect(rovingIndex(ev('ArrowDown'), 0, 3)).toBe(-1);
    expect(rovingIndex(ev('ArrowUp'), 0, 3, 'both')).toBe(2);
    expect(rovingIndex(ev('ArrowRight'), 0, 3, 'vertical')).toBe(-1);
    expect(rovingIndex(ev('a'), 0, 3, 'both')).toBe(-1);
  });
});
