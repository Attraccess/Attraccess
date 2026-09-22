import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WizardApp } from './WizardApp';
import type { CompanionBridge } from './types';
vi.mock('@attraccess/ui', () => ({ ThemeToggle: () => null }));
let init: Parameters<CompanionBridge['onInit']>[0];
let registered: Parameters<CompanionBridge['onRegistered']>[0];
let wsStatus: Parameters<CompanionBridge['onWsStatus']>[0];
const bridge = {
  checkHealth: vi.fn(),
  register: vi.fn(),
  getPermissions: vi.fn(),
  requestPermission: vi.fn(),
  isPinSet: vi.fn(),
  savePin: vi.fn(),
  verifyPin: vi.fn(),
  confirmQuit: vi.fn(),
  disconnect: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  enableAdminOverride: vi.fn(),
  onInit: (cb: typeof init) => {
    init = cb;
  },
  onRegistered: (cb: typeof registered) => {
    registered = cb;
  },
  onWsStatus: (cb: typeof wsStatus) => {
    wsStatus = cb;
  },
  onAuthenticated: vi.fn(),
} satisfies CompanionBridge;
beforeEach(() => {
  vi.resetAllMocks();
  window.companion = bridge;
  bridge.getSettings.mockResolvedValue({ idleTimeoutMinutes: 15, foregroundApp: true, usbDevices: true });
  bridge.getPermissions.mockResolvedValue({ needed: false, accessibility: true });
  bridge.isPinSet.mockResolvedValue(true);
  bridge.checkHealth.mockResolvedValue(true);
});
afterEach(cleanup);
async function mount(data: Parameters<typeof init>[0] = { registered: false, connected: false }) {
  render(<WizardApp />);
  await act(async () => {
    init(data);
  });
}
it('requires a valid matching PIN before connecting a new device', async () => {
  bridge.isPinSet.mockResolvedValue(false);
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
  expect(await screen.findByText('PIN must be at least 4 characters.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '5678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
  expect(await screen.findByText('PINs do not match.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
  expect(await screen.findByLabelText('Server URL')).toBeTruthy();
  expect(bridge.savePin).toHaveBeenCalledExactlyOnceWith('1234');
});
it('validates server reachability, registers a normalized URL, and handles registration events', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Please enter a server URL.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Server URL'), { target: { value: 'https://workspace.test/' } });
  bridge.checkHealth.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Could not reach server. Check the URL and try again.')).toBeTruthy();
  expect(bridge.register).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(bridge.register).toHaveBeenCalledWith('https://workspace.test'));
  act(() => wsStatus('connected'));
  expect(screen.getByText('Connected — awaiting registration…')).toBeTruthy();
  act(() => registered({ id: 7 }));
  expect(screen.getByText(/7/)).toBeTruthy();
});
it('protects settings with a PIN and saves monitoring preferences before returning to connection status', async () => {
  await mount({ requirePin: 'settings', serverUrl: 'https://workspace.test', registered: true, connected: true });
  bridge.verifyPin.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByText('Incorrect PIN.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByLabelText('Idle timeout (minutes, 0 = disabled)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Report USB device connect/disconnect to flow triggers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(bridge.saveSettings).toHaveBeenCalledWith({ idleTimeoutMinutes: 0, foregroundApp: true, usbDevices: false }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
  expect(await screen.findByRole('button', { name: 'Connect' })).toBeTruthy();
  expect(bridge.disconnect).toHaveBeenCalledOnce();
});
it.each(['quit', 'admin-override'] as const)('requires main-process PIN verification for %s', async (action) => {
  await mount({ requirePin: action, registered: true, connected: true });
  bridge.verifyPin.mockResolvedValue(true);
  bridge.enableAdminOverride.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
  const name = action === 'quit' ? 'Quit' : 'Enable override';
  fireEvent.click(screen.getByRole('button', { name }));
  if (action === 'quit') {
    await waitFor(() => expect(bridge.confirmQuit).toHaveBeenCalledOnce());
  } else {
    expect(await screen.findByText('Incorrect PIN.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe(''));
    expect(bridge.enableAdminOverride).toHaveBeenCalledWith('1234');
    expect(bridge.verifyPin).not.toHaveBeenCalled();
  }
});
