import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { adjacentCorner, loadCorner, nearestCorner, saveCorner, type ArrowKey, type Corner } from './corner';

const DRAG_THRESHOLD_PX = 4;
const ARROWS: ArrowKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pointer-drag + arrow-key movement between the four viewport corners, persisted in localStorage. */
export function useDraggableCorner() {
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<Corner>(() => loadCorner());
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const drag = useRef<{ startX: number; startY: number; moved: boolean; rect: DOMRect } | null>(null);
  const fromRect = useRef<DOMRect | null>(null);
  const justDragged = useRef(false);

  const moveTo = useCallback((next: Corner) => {
    fromRect.current = ref.current?.getBoundingClientRect() ?? null;
    setCorner(next);
    saveCorner(next);
  }, []);

  // FLIP: after the corner changes, start from the old position and animate to the new anchor.
  useLayoutEffect(() => {
    const from = fromRect.current;
    const el = ref.current;
    fromRect.current = null;
    if (!from || !el) {
      setOffset(null);
      return;
    }
    if (prefersReducedMotion()) {
      setOffset(null);
      return;
    }
    const to = el.getBoundingClientRect();
    setAnimating(false);
    setOffset({ x: from.left - to.left, y: from.top - to.top });
    const frame = requestAnimationFrame(() => {
      setAnimating(true);
      setOffset(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [corner]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !ref.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      rect: ref.current.getBoundingClientRect(),
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = event.clientX - d.startX;
    const y = event.clientY - d.startY;
    if (!d.moved && Math.hypot(x, y) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setAnimating(false);
    setOffset({ x, y });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const x = d.rect.left + d.rect.width / 2 + event.clientX - d.startX;
    const y = d.rect.top + d.rect.height / 2 + event.clientY - d.startY;
    const next = nearestCorner({ x, y }, { width: window.innerWidth, height: window.innerHeight });
    // Start the snap animation from where the pointer let go.
    fromRect.current = new DOMRect(
      d.rect.left + event.clientX - d.startX,
      d.rect.top + event.clientY - d.startY,
      d.rect.width,
      d.rect.height,
    );
    setCorner(next);
    saveCorner(next);
    if (next === corner) {
      // Same corner: no layout effect re-run, animate back by hand.
      setOffset(null);
      setAnimating(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !ARROWS.includes(event.key as ArrowKey)) return;
    event.preventDefault();
    moveTo(adjacentCorner(corner, event.key as ArrowKey));
  };

  // Swallow the click that follows a drag so it doesn't trigger buttons underneath the pointer.
  const onClickCapture = (event: { preventDefault(): void; stopPropagation(): void }) => {
    if (justDragged.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return {
    ref,
    corner,
    offset,
    animating,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown, onClickCapture },
  };
}
