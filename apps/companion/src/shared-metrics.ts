import { createMetricsAdapter, SystemMetricsAdapter } from './metrics';

export const sharedMetricsAdapter: SystemMetricsAdapter = createMetricsAdapter();

// ponytail: ref-count so foreground-app and usb-devices share one adapter/set of OS watchers
let refs = 0;

export async function acquireMetrics(): Promise<void> {
  if (refs++ === 0) await sharedMetricsAdapter.start();
}

export function releaseMetrics(): void {
  if (refs > 0 && --refs === 0) sharedMetricsAdapter.stop();
}
