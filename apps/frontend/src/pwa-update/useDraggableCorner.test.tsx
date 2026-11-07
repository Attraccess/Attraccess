import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraggableCorner } from './useDraggableCorner';

function Harness() {
  const { ref, offset, handlers } = useDraggableCorner();
  return (
    <div
      ref={ref}
      data-testid="box"
      tabIndex={0}
      style={{ transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined }}
      {...handlers}
    />
  );
}

// jsdom has no layout: derive the rect from the inline transform, with the anchored corner at x=900.
function fakeRect(this: HTMLElement) {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform);
  const left = (localStorage.getItem('attraccess.pwaUpdateIndicator.corner') === 'top-left' ? 16 : 900) + Number(match?.[1] ?? 0);
  const top = (localStorage.getItem('attraccess.pwaUpdateIndicator.corner') === 'top-left' ? 16 : 700) + Number(match?.[2] ?? 0);
  return new DOMRect(left, top, 100, 60);
}

describe('useDraggableCorner', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(fakeRect);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('starts the snap animation where the pointer let go, not at the old corner', () => {
    render(<Harness />);
    const box = screen.getByTestId('box');
    // Grab the box at its centre (950, 730) and drop it near the top-left.
    fireEvent.pointerDown(box, { button: 0, pointerId: 1, clientX: 950, clientY: 730 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 150, clientY: 80 });
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 150, clientY: 80 });

    expect(localStorage.getItem('attraccess.pwaUpdateIndicator.corner')).toBe('top-left');
    // Dropped rect is (100, 50); the new anchor is (16, 16): the box must start 84px / 34px away from it.
    expect(box.style.transform).toBe('translate(84px, 34px)');
  });
});
