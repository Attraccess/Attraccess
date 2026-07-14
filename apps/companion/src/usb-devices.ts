import { createMetricsAdapter, SystemMetricsAdapter } from './metrics';
import { state } from './state';

const metricsAdapter: SystemMetricsAdapter = createMetricsAdapter();
let monitoringStarted = false;

export function startUsbDevicesMonitoring(): void {
  if (monitoringStarted || !state.settings.usbDevices) return;
  monitoringStarted = true;
  metricsAdapter.on('usbDeviceAdded', (device) => {
    if (!state.wsClient) return;
    state.wsClient.sendUsbconnected(device);
  });
  metricsAdapter.on('usbDeviceRemoved', (device) => {
    if (!state.wsClient) return;
    state.wsClient.sendUsbdisconnected(device);
  });
  metricsAdapter.start().catch((err) => console.warn('[companion] USB metrics adapter start failed:', err));
}

export function stopUsbDevicesMonitoring(): void {
  if (!monitoringStarted) return;
  monitoringStarted = false;
  metricsAdapter.stop();
  metricsAdapter.removeAllListeners('usbDeviceAdded');
  metricsAdapter.removeAllListeners('usbDeviceRemoved');
}
