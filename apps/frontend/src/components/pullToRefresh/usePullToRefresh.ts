import { useEffect, useRef, useState } from 'react';
import { classifyMove, isEditableTarget, isScrolledToTop, pullDistance } from './gesture';

export type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing';

interface Options {
  onRefresh: () => Promise<unknown>;
  threshold: number;
}

interface Gesture {
  startX: number;
  startY: number;
  armed: boolean;
  /** Finger travel since touchstart; the threshold applies to it, as with the old library. */
  travel: number;
}

const SNAP_BACK = 'transform 0.2s cubic-bezier(0, 0, 0.31, 1)';

// Moves the content and the indicator directly on the DOM so a pull does not re-render the app on every touchmove;
// React state changes only when the phase does.
export function usePullToRefresh({ onRefresh, threshold }: Options) {
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const latest = useRef({ onRefresh, threshold });
  latest.current = { onRefresh, threshold };

  useEffect(() => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) return;

    let gesture: Gesture | null = null;
    let refreshing = false;

    const show = (distance: number, animate: boolean) => {
      content.style.transition = animate ? SNAP_BACK : 'none';
      content.style.transform = distance > 0 ? `translateY(${distance}px)` : '';
      indicator.style.opacity = String(Math.min(distance / 65, 1));
    };

    const reset = () => {
      show(0, true);
      setPhase('idle');
    };

    const onTouchStart = (event: TouchEvent) => {
      // A second finger mid-pull ends the pull; without the reset the app would stay shifted down.
      if (gesture?.armed) reset();
      gesture = null;
      if (refreshing || event.touches.length !== 1 || isEditableTarget(event.target)) return;
      if (!isScrolledToTop(event.target) || content.getBoundingClientRect().top < 0) return;
      const touch = event.touches[0];
      gesture = { startX: touch.clientX, startY: touch.clientY, armed: false, travel: 0 };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (!gesture.armed) {
        const decision = classifyMove(dx, dy);
        if (decision === 'ignore') gesture = null;
        if (decision !== 'pull') return;
        gesture.armed = true;
      }

      // Back above the start point: hand the gesture back to native scrolling.
      if (dy <= 0) {
        gesture = null;
        reset();
        return;
      }

      if (event.cancelable) event.preventDefault();
      gesture.travel = dy;
      show(pullDistance(dy), false);
      setPhase(dy >= latest.current.threshold ? 'ready' : 'pulling');
    };

    const onTouchEnd = (event: TouchEvent) => {
      const finished = gesture;
      gesture = null;
      if (!finished?.armed) return;
      if (event.type !== 'touchend' || finished.travel < latest.current.threshold) {
        reset();
        return;
      }

      refreshing = true;
      show(latest.current.threshold, true);
      setPhase('refreshing');
      Promise.resolve()
        .then(() => latest.current.onRefresh())
        .catch(() => undefined)
        .finally(() => {
          refreshing = false;
          reset();
        });
    };

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', onTouchEnd);
    content.addEventListener('touchcancel', onTouchEnd);
    return () => {
      content.removeEventListener('touchstart', onTouchStart);
      content.removeEventListener('touchmove', onTouchMove);
      content.removeEventListener('touchend', onTouchEnd);
      content.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return { contentRef, indicatorRef, phase };
}
