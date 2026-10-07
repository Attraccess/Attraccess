import { SimulatorDeviceAdapter } from './simulator-device';
import { store } from './simulator-state';
import { handleAsync } from './simulator-mqtt';

export function registerSimulatorInspection(device: SimulatorDeviceAdapter): void {
  // An IPC parent can inspect the actual in-memory device independently of MQTT
  // reported state. There is no listener or control port in ordinary CLI/Docker use.
  process.on('message', (message: unknown) => {
    if (!process.send || !message || typeof message !== 'object') return;
    const request = message as { type?: string; id?: string; channelId?: string };
    if (request.type !== 'simulator-read' || typeof request.id !== 'string' || typeof request.channelId !== 'string')
      return;
    void handleAsync(async () => {
      const snapshot = (await store.load()).accepted?.snapshot;
      const channel = snapshot?.logicalChannels.find((item) => item.id === request.channelId);
      const point = snapshot?.physicalPoints.find((item) => item.id === channel?.physicalPointId);
      if (!point) {
        process.send?.({ type: 'simulator-read-result', id: request.id, error: 'unknown channel' });
        return;
      }
      process.send?.({ type: 'simulator-read-result', id: request.id, value: await device.read(point) });
    });
  });
}
