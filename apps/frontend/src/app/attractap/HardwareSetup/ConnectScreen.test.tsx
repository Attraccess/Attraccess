import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectScreen } from './ConnectScreen';

const state = vi.hoisted(() => ({ connectUsb: vi.fn(), connectBluetooth: vi.fn(), available: true }));

vi.mock('../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ connectToDevice: state.connectUsb }) },
}));
vi.mock('../../../utils/ble-configurator', () => ({
  BleConfigurator: { getInstance: () => ({ connect: state.connectBluetooth }) },
  isWebBluetoothAvailable: () => state.available,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.available = true;
  state.connectBluetooth.mockResolvedValue(true);
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);

it('explains the USB fallback instead of connecting when Web Bluetooth is missing', async () => {
  state.available = false;
  render(<ConnectScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up over Bluetooth' }));
  expect(await screen.findByText('Bluetooth setup is not available in this browser')).toBeTruthy();
  expect(screen.getByText(/Chrome and Edge offer on desktop and Android/)).toBeTruthy();
  expect(state.connectBluetooth).not.toHaveBeenCalled();
});

it('connects over Bluetooth and stays silent when the picker is cancelled', async () => {
  state.connectBluetooth.mockResolvedValueOnce(false);
  render(<ConnectScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up over Bluetooth' }));
  await waitFor(() => expect(state.connectBluetooth).toHaveBeenCalledOnce());
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(state.connectUsb).not.toHaveBeenCalled();
});

it('reports a failed Bluetooth connection', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.connectBluetooth.mockRejectedValueOnce(new Error('GATT server disconnected'));
  render(<ConnectScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up over Bluetooth' }));
  expect(await screen.findByText('Could not connect to the bridge')).toBeTruthy();
});

it('confirms a bridge that closed Bluetooth after pairing', () => {
  render(<ConnectScreen closedAfterPairing />);
  expect(screen.getByText('Bridge set up')).toBeTruthy();
});
