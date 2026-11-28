import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectScreen } from './ConnectScreen';

const state = vi.hoisted(() => ({ connectUsb: vi.fn(), connectBluetooth: vi.fn(), available: true }));

vi.mock('../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ connectToDevice: state.connectUsb }) },
}));
vi.mock('../../../utils/ble-configurator', () => ({
  BleConfigurator: { getInstance: () => ({ connect: state.connectBluetooth }) },
  isWebBluetoothAvailable: () => state.available,
  isBluetoothBlocked: (err: unknown) => err instanceof Error && /blocked/.test(err.message),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.available = true;
  state.connectBluetooth.mockResolvedValue(true);
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(() => {
  cleanup();
  act(() => useTranslationState.getState().setLanguage('en'));
});

it('explains the USB fallback instead of connecting when Web Bluetooth is missing', async () => {
  state.available = false;
  render(<ConnectScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up over Bluetooth' }));
  expect(await screen.findByText('Bluetooth setup is not available in this browser')).toBeTruthy();
  // Edge has no Web Bluetooth on Android: only Chrome is named there.
  expect(
    screen.getByText(/Chrome and Edge offer on a computer and Chrome offers on Android/),
  ).toBeTruthy();
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
  expect(await screen.findByText('Could not connect over Bluetooth')).toBeTruthy();
  // A Lite or a bridge has no screen: only a Touch shows its name.
  const description = screen.getByText(/Bluetooth setup is still open/).textContent;
  expect(description).toMatch(/an Attractap Touch shows its name on its screen/);
  expect(description).not.toMatch(/the reader shows on its screen/);
  // macOS asks the user to accept the Bluetooth pairing; unanswered, the connection fails.
  expect(description).toMatch(/If your computer asks to pair over Bluetooth, accept the request/);
});

it('explains how to allow Bluetooth when the browser blocked it for the site', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.connectBluetooth.mockRejectedValueOnce(
    Object.assign(new Error('Bluetooth permission has been blocked.'), { name: 'NotFoundError' }),
  );
  render(<ConnectScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up over Bluetooth' }));
  expect(await screen.findByText('Bluetooth is blocked for this site')).toBeTruthy();
  const description = screen.getByText(/set Bluetooth \(or Bluetooth devices\) to Allow/).textContent;
  // Brave ships Web Bluetooth switched off and reports it as a blocked permission.
  expect(description).toMatch(/brave:\/\/flags\/#brave-web-bluetooth-api/);
  expect(screen.queryByText('Could not connect over Bluetooth')).toBeNull();
});

it('explains a Bluetooth link that dropped during setup', () => {
  render(<ConnectScreen bluetoothLost />);
  expect(screen.getByText('Bluetooth connection lost')).toBeTruthy();
  expect(screen.getByText(/10-minute setup window closed/)).toBeTruthy();
});

it('confirms a reader or bridge that closed Bluetooth after pairing', () => {
  render(<ConnectScreen closedAfterPairing />);
  expect(screen.getByText('Setup complete')).toBeTruthy();
  expect(screen.getByText(/The device is connected to Attraccess/)).toBeTruthy();
});

it('explains how readers and bridges open their Bluetooth setup', () => {
  render(<ConnectScreen />);
  const hint = screen.getByText(/Set it up without a cable/).textContent;
  expect(hint).toMatch(/Attractap Touch opens it for 10 minutes after it starts, or with the "Bluetooth setup" button/);
  expect(hint).toMatch(/Attractap Lite opens it for 10 minutes after power-up/);
  expect(hint).toMatch(/BLE Bridge opens it when you hold its button for 3 seconds/);
  expect(hint).not.toMatch(/only works for the BLE Bridge/);
});

it('has the reader copy in German', async () => {
  act(() => useTranslationState.getState().setLanguage('de'));
  state.connectBluetooth.mockRejectedValueOnce(new Error('GATT server disconnected'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<ConnectScreen closedAfterPairing />);
  expect(screen.getByText('Einrichtung abgeschlossen')).toBeTruthy();
  expect(screen.getByText(/Schaltfläche „Bluetooth-Einrichtung“ auf seinem Display/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Per Bluetooth einrichten' }));
  expect(await screen.findByText('Bluetooth-Verbindung fehlgeschlagen')).toBeTruthy();
  expect(screen.getByText(/Fragt dein Computer nach einer Bluetooth-Kopplung, bestätige sie/)).toBeTruthy();
});
