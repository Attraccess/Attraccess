// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from './AdminPasswordDrawer';
import { DiscoverDrawer } from './DiscoverDrawer';
import { DeviceInfoDrawer } from './DeviceInfoDrawer';
import { addDevice, discoverDevices, getDeviceInfo, setAdminPassword, type ShellyDevice } from './api';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  addDevice: vi.fn(),
  discoverDevices: vi.fn(),
  getDeviceInfo: vi.fn(),
  setAdminPassword: vi.fn(),
}));
const device: ShellyDevice = {
  id: 7,
  name: 'Workshop light',
  ipAddress: '192.0.2.7',
  generation: 2,
  model: 'Plus1',
  authState: 'required',
  lastProbeAt: null,
  lastProbeError: null,
  createdAt: '2026-09-22',
  updatedAt: '2026-09-22',
};
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);
it('adds a trimmed address once and preserves failed input for retry', async () => {
  vi.mocked(addDevice).mockRejectedValueOnce(new Error('Registry unavailable')).mockResolvedValueOnce(device);
  const saved = vi.fn(),
    close = vi.fn();
  render(<AddDeviceDrawer isOpen onOpenChange={close} onAdded={saved} />);
  fireEvent.change(screen.getByLabelText('IP address'), { target: { value: ' 192.0.2.7 ' } });
  fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: ' Workshop light ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
  expect(await screen.findByText('Registry unavailable')).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
  expect(addDevice).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(addDevice).toHaveBeenLastCalledWith({ ipAddress: '192.0.2.7', name: 'Workshop light' });
  expect(close).toHaveBeenCalledWith(false);
});
it('requires a new admin password and submits existing credentials only when provided', async () => {
  vi.mocked(setAdminPassword).mockResolvedValue(device);
  const saved = vi.fn(),
    close = vi.fn();
  render(<AdminPasswordDrawer device={device} onOpenChange={close} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(await screen.findByText('New password is required.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } });
  fireEvent.change(screen.getByLabelText('New admin password'), { target: { value: ' new password ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(setAdminPassword).toHaveBeenCalledWith(7, { currentPassword: 'old password', password: 'new password' });
  expect(close).toHaveBeenCalledWith(false);
});
it('discovers devices once per submission and distinguishes new from known devices', async () => {
  vi.mocked(discoverDevices).mockResolvedValue({
    subnets: ['192.0.2.0/24'],
    probed: 254,
    devices: [
      {
        deviceId: 7,
        ipAddress: device.ipAddress,
        name: device.name,
        generation: 2,
        model: 'Plus1',
        authState: 'required',
        isNew: true,
        source: 'scan',
      },
      {
        deviceId: 8,
        ipAddress: '192.0.2.8',
        name: 'Known light',
        generation: 1,
        model: null,
        authState: 'none',
        isNew: false,
        source: 'mdns',
      },
    ],
  });
  const saved = vi.fn();
  render(<DiscoverDrawer isOpen onOpenChange={vi.fn()} onDiscovered={saved} />);
  fireEvent.change(screen.getByPlaceholderText('192.168.1.0/24'), { target: { value: ' 192.0.2.0/24 ' } });
  fireEvent.click(screen.getByRole('button', { name: /Start discovery/ }));
  expect(await screen.findByText('Found 2, added 1')).toBeTruthy();
  expect(screen.getByText('Already known')).toBeTruthy();
  expect(discoverDevices).toHaveBeenCalledExactlyOnceWith({ cidr: '192.0.2.0/24' });
  expect(saved).toHaveBeenCalledOnce();
});
it('reports discovery failures and supports an mDNS-only retry with no results', async () => {
  vi.mocked(discoverDevices)
    .mockRejectedValueOnce(new Error('Invalid subnet'))
    .mockResolvedValueOnce({ subnets: [], probed: 1, devices: [] });
  render(<DiscoverDrawer isOpen onOpenChange={vi.fn()} onDiscovered={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Start discovery/ }));
  expect(await screen.findByText('Invalid subnet')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Start discovery/ }));
  expect(await screen.findByText('No devices found')).toBeTruthy();
  expect(discoverDevices).toHaveBeenLastCalledWith({ cidr: undefined });
});
it('waits for credentials on protected devices, then loads and refreshes their details', async () => {
  vi.mocked(getDeviceInfo)
    .mockRejectedValueOnce(new Error('Wrong password'))
    .mockResolvedValue({
      generation: 2,
      status: { sys: { uptime: 3660 }, wifi: { ssid: 'Workshop WiFi', rssi: -50 } },
      config: { sys: { device: { name: 'Workshop light' } } },
      fetchedAt: '2026-09-22T10:00:00Z',
    });
  render(<DeviceInfoDrawer device={device} onOpenChange={vi.fn()} />);
  expect(getDeviceInfo).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Admin password'), { target: { value: 'fixture-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Wrong password')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Workshop WiFi')).toBeTruthy();
  expect(screen.getByText('1h 1m')).toBeTruthy();
  expect(getDeviceInfo).toHaveBeenLastCalledWith(7, { currentPassword: 'fixture-secret' });
});
it('automatically loads unprotected device details', async () => {
  vi.mocked(getDeviceInfo).mockResolvedValue({
    generation: 1,
    status: {},
    config: {},
    fetchedAt: '2026-09-22T10:00:00Z',
  });
  render(<DeviceInfoDrawer device={{ ...device, authState: 'none' }} onOpenChange={vi.fn()} />);
  await waitFor(() => expect(getDeviceInfo).toHaveBeenCalledWith(7, { currentPassword: undefined }));
  expect(await screen.findByText('Gen 1')).toBeTruthy();
});
