import { UsbDeviceInfo } from './metrics';
import { state } from './state';
import { sharedMetricsAdapter, acquireMetrics, releaseMetrics } from './shared-metrics';

let listening = false;

function onUsbDeviceAdded(device: UsbDeviceInfo): void {
  if (!state.wsClient) return;
  state.wsClient.sendUsbConnected(device);
}

function onUsbDeviceRemoved(device: UsbDeviceInfo): void {
  if (!state.wsClient) return;
  state.wsClient.sendUsbDisconnected(device);
}

export function startUsbDevicesMonitoring(): void {
  if (listening || !state.settings.usbDevices) return;
  listening = true;
  sharedMetricsAdapter.on('usbDeviceAdded', onUsbDeviceAdded);
  sharedMetricsAdapter.on('usbDeviceRemoved', onUsbDeviceRemoved);
  acquireMetrics().catch((err) => {
    console.warn('[companion] USB metrics adapter start failed:', err);
    listening = false;
    sharedMetricsAdapter.off('usbDeviceAdded', onUsbDeviceAdded);
    sharedMetricsAdapter.off('usbDeviceRemoved', onUsbDeviceRemoved);
    releaseMetrics();
  });
}

export function stopUsbDevicesMonitoring(): void {
  if (!listening) return;
  listening = false;
  sharedMetricsAdapter.off('usbDeviceAdded', onUsbDeviceAdded);
  sharedMetricsAdapter.off('usbDeviceRemoved', onUsbDeviceRemoved);
  releaseMetrics();
}
