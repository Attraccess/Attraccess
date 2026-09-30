// iOS Safari never shrinks the layout viewport (100vh / 100dvh) when the on-screen
// keyboard opens, so bottom-anchored UI — the chat composer — ends up behind it.
// visualViewport is the only signal for the area that is actually visible.
// Published as --vvh so the app shell can size itself against it.
export function trackVisualViewportHeight() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }

  const sync = () => document.documentElement.style.setProperty('--vvh', `${viewport.height}px`);
  sync();
  viewport.addEventListener('resize', sync);
}
