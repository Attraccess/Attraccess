import { createMetricsAdapter, SystemMetricsAdapter } from './metrics';

export const sharedMetricsAdapter: SystemMetricsAdapter = createMetricsAdapter();

// ponytail: ref-count so foreground-app and usb-devices share one adapter/set of OS watchers
let refs = 0;
// ponytail: shared promise so all concurrent acquirers observe the same start() outcome
let starting: Promise<void> | null = null;

export async function acquireMetrics(): Promise<void> {
  refs++;
  // all acquirers await the same promise so all see a start() failure and
  // invoke their own catch→releaseMetrics(); acquireMetrics itself does not
  // touch refs on failure (callers own the undo via releaseMetrics)
  if (!starting) starting = sharedMetricsAdapter.start();
  await starting;
}

export function releaseMetrics(): void {
  if (refs > 0 && --refs === 0) {
    sharedMetricsAdapter.stop();
    starting = null;
  }
}
