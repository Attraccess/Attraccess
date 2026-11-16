// Finger travel before a touch counts as a pull. Below it, taps, long-presses and jitter stay native. It matches
// Android's touch slop (8dp): past it Chrome cancels the long-press anyway and starts scrolling, after which our
// touchmoves can no longer be cancelled, so the pull must be decided by then.
export const PULL_SLOP_PX = 8;
// The content follows the finger 1:1 up to this distance, then stops.
export const MAX_PULL_PX = 95;

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** A touch on an editable element must stay native: a cancelled touchmove kills long-press select and Paste (ATT-1150). */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null;
}

const SCROLLABLE = /^(auto|scroll|overlay)$/;

/**
 * False when the touched element or any scrollable ancestor is scrolled down. Elements that clip (html, body,
 * #root) are skipped: focus can leave a scrollTop on them that the user cannot scroll back.
 */
export function isScrolledToTop(target: EventTarget | null): boolean {
  for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
    if (element.scrollTop > 0 && SCROLLABLE.test(getComputedStyle(element).overflowY)) return false;
  }
  return true;
}

export type PullDecision = 'wait' | 'pull' | 'ignore';

/** Decide, from the movement since touchstart, whether the gesture is a pull (downward, mostly vertical). */
export function classifyMove(dx: number, dy: number): PullDecision {
  if (Math.hypot(dx, dy) < PULL_SLOP_PX) return 'wait';
  return dy >= PULL_SLOP_PX && dy > Math.abs(dx) * 1.5 ? 'pull' : 'ignore';
}

export function pullDistance(dy: number): number {
  return Math.min(Math.max(dy - PULL_SLOP_PX, 0), MAX_PULL_PX);
}
