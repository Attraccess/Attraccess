import { ForegroundAppInfo } from './metrics';
import { state } from './state';
import { sharedMetricsAdapter, acquireMetrics, releaseMetrics } from './shared-metrics';

let listening = false;

function onForegroundAppChanged(app: ForegroundAppInfo | null): void {
  if (!state.wsClient || !app) return;
  state.wsClient.sendForegroundApp({ appName: app.name, bundleId: app.bundleId, pid: app.pid });
}

export function startForegroundAppMonitoring(): void {
  if (listening || !state.settings.foregroundApp) return;
  listening = true;
  sharedMetricsAdapter.on('foregroundAppChanged', onForegroundAppChanged);
  acquireMetrics().catch((err) => {
    console.warn('[companion] metrics adapter start failed:', err);
    listening = false;
    sharedMetricsAdapter.off('foregroundAppChanged', onForegroundAppChanged);
    releaseMetrics();
  });
}

export function stopForegroundAppMonitoring(): void {
  if (!listening) return;
  listening = false;
  sharedMetricsAdapter.off('foregroundAppChanged', onForegroundAppChanged);
  releaseMetrics();
}
