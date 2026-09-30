import { powerMonitor } from 'electron';
import { startIdleDetection, stopIdleDetection } from './idle-detection';
import { state } from './state';
jest.mock('electron', () => ({ powerMonitor: { getSystemIdleTime: jest.fn() } }));
jest.mock('./state', () => ({ state: { settings: { idleTimeoutMinutes: 1 }, wsClient: null } }));
const client = { sendIdle: jest.fn(), sendActive: jest.fn() };
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  state.settings.idleTimeoutMinutes = 1;
  state.wsClient = client as unknown as typeof state.wsClient;
});
afterEach(() => {
  stopIdleDetection();
  jest.useRealTimers();
});
it('emits only idle/active transitions and resets when restarted', () => {
  jest.mocked(powerMonitor.getSystemIdleTime).mockReturnValue(61);
  startIdleDetection();
  jest.advanceTimersByTime(10000);
  expect(client.sendIdle).toHaveBeenCalledTimes(1);
  expect(client.sendIdle).toHaveBeenCalledWith({ idleSeconds: 61, platform: process.platform });
  jest.mocked(powerMonitor.getSystemIdleTime).mockReturnValue(2);
  jest.advanceTimersByTime(10000);
  expect(client.sendActive).toHaveBeenCalledTimes(1);
  stopIdleDetection();
  jest.advanceTimersByTime(10000);
  expect(client.sendActive).toHaveBeenCalledTimes(1);
  jest.mocked(powerMonitor.getSystemIdleTime).mockReturnValue(61);
  startIdleDetection();
  jest.advanceTimersByTime(5000);
  expect(client.sendIdle).toHaveBeenCalledTimes(2);
});
it('does not poll when disabled or send while disconnected', () => {
  state.settings.idleTimeoutMinutes = 0;
  startIdleDetection();
  jest.advanceTimersByTime(10000);
  expect(powerMonitor.getSystemIdleTime).not.toHaveBeenCalled();
  state.settings.idleTimeoutMinutes = 1;
  state.wsClient = null;
  startIdleDetection();
  jest.advanceTimersByTime(10000);
  expect(powerMonitor.getSystemIdleTime).not.toHaveBeenCalled();
  expect(client.sendIdle).not.toHaveBeenCalled();
});
