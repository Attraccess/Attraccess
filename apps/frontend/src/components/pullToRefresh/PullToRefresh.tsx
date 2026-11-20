import type { PropsWithChildren, ReactNode } from 'react';
import { usePullToRefresh } from './usePullToRefresh';

interface Props {
  onRefresh: () => Promise<unknown>;
  /** Finger travel in px that triggers a refresh on release. */
  threshold: number;
  pullingContent: ReactNode;
  /** Shown once the threshold is reached and while onRefresh runs. */
  refreshingContent: ReactNode;
}

export function PullToRefresh({
  onRefresh,
  threshold,
  pullingContent,
  refreshingContent,
  children,
}: PropsWithChildren<Props>) {
  const { contentRef, indicatorRef, phase } = usePullToRefresh({ onRefresh, threshold });

  return (
    <div className="relative h-full w-full overflow-clip">
      <div
        ref={indicatorRef}
        aria-hidden={phase === 'idle'}
        className={`absolute inset-x-0 top-0 z-10 overflow-hidden ${phase === 'idle' ? 'invisible' : ''}`}
        data-cy="pull-to-refresh-indicator"
      >
        {phase === 'pulling' ? pullingContent : phase === 'idle' ? null : refreshingContent}
      </div>
      {/* overflow-clip, not hidden: app scrolling stays in nested containers such as main, so focus and
          scrollIntoView cannot park scrollTop here and shift the whole app shell upward. */}
      <div ref={contentRef} className="relative h-full w-full overflow-clip" data-cy="pull-to-refresh-content">
        {children}
      </div>
    </div>
  );
}
