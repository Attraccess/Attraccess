import { createMetricsAdapter, SystemMetricsAdapter } from './metrics';
import { state } from './state';

const metricsAdapter: SystemMetricsAdapter = createMetricsAdapter();
let metricsStarted = false;

export function startForegroundAppMonitoring(): void {
  if (metricsStarted || !state.settings.foregroundApp) return;
  metricsStarted = true;
  metricsAdapter.on('foregroundAppChanged', (app) => {
    if (!state.wsClient || !app) return;
    state.wsClient.sendForegroundapp({ appName: app.name, bundleId: app.bundleId, pid: app.pid });
  });
  metricsAdapter.start().catch((err) => console.warn('[companion] metrics adapter start failed:', err));
}

export function stopForegroundAppMonitoring(): void {
  if (!metricsStarted) return;
  metricsStarted = false;
  metricsAdapter.stop();
  metricsAdapter.removeAllListeners('foregroundAppChanged');
}
