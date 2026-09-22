import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapSerialCommGate, AttractapSerialCommProvider, useAttractapSerialComm } from './index';
const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../../../../utils/esp-tools', () => ({ ESPTools: { getInstance: () => ({ sendCommand: state.send }) } }));
vi.mock('../Pin', () => ({ AttractapSerialConfiguratorPin: () => <p>Set a new device PIN</p> }));
beforeEach(() => {
  vi.clearAllMocks();
  state.send.mockResolvedValue('{}');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <AttractapSerialCommProvider>{children}</AttractapSerialCommProvider>
);
it('adds authentication only to non-auth commands and allows explicit code/timeouts', async () => {
  const { result } = renderHook(() => useAttractapSerialComm(), { wrapper });
  await act(() => result.current.sendAuthedCommand('auth.status.get'));
  expect(state.send).toHaveBeenLastCalledWith({ topic: 'auth.status.get', payload: undefined }, true, 15000);
  act(() => result.current.setAuthCode('1234'));
  state.send.mockResolvedValueOnce('{"ready":true}');
  await act(async () =>
    expect(await result.current.sendAuthedCommand('network.status.get', { verbose: true })).toEqual({ ready: true }),
  );
  expect(state.send).toHaveBeenLastCalledWith(
    { topic: 'network.status.get', payload: '{"verbose":true,"authCode":"1234"}' },
    true,
    15000,
  );
  await act(() =>
    result.current.sendAuthedCommand('network.status.get', {}, { authCodeOverride: '5678', timeout: 1000 }),
  );
  expect(state.send).toHaveBeenLastCalledWith(
    { topic: 'network.status.get', payload: '{"authCode":"5678"}' },
    true,
    1000,
  );
  await act(() => result.current.sendAuthedCommand('auth.pin.set', { pin: '9999' }));
  expect(state.send).toHaveBeenLastCalledWith({ topic: 'auth.pin.set', payload: '{"pin":"9999"}' }, true, 15000);
});
it('rejects missing, malformed and device error responses while accepting valid JSON values', async () => {
  const { result } = renderHook(() => useAttractapSerialComm(), { wrapper });
  for (const [response, error] of [
    [undefined, 'NO_RESPONSE'],
    ['bad', 'INVALID_JSON'],
    ['{"error":"AUTH_REQUIRED"}', 'AUTH_REQUIRED'],
  ]) {
    state.send.mockResolvedValueOnce(response);
    await act(async () => expect(result.current.sendAuthedCommand('network.status.get')).rejects.toThrow(error));
  }
  for (const value of [null, [], true, 42, { error: false }]) {
    state.send.mockResolvedValueOnce(JSON.stringify(value));
    await act(async () => expect(await result.current.sendAuthedCommand('status')).toEqual(value));
  }
});
it('refreshes PIN status and clears stale authentication when PIN protection is removed', async () => {
  const { result } = renderHook(() => useAttractapSerialComm(), { wrapper });
  act(() => result.current.setAuthCode('1234'));
  state.send.mockResolvedValueOnce('{"pinIsSet":true}');
  await act(() => result.current.refreshPinStatus());
  expect(result.current.isAuthenticated).toBe(true);
  state.send.mockResolvedValueOnce('{"pinIsSet":false}');
  await act(() => result.current.refreshPinStatus());
  expect(result.current.authCode).toBeNull();
  expect(result.current.isAuthenticated).toBe(false);
  expect(state.send).toHaveBeenLastCalledWith({ topic: 'auth.status.get' }, true, 5000);
  state.send.mockResolvedValueOnce(undefined);
  await act(async () => expect(result.current.refreshPinStatus()).rejects.toThrow('NO_RESPONSE'));
});
it('assembles configuration and settles loading on success and failure', async () => {
  const { result } = renderHook(() => useAttractapSerialComm(), { wrapper });
  state.send
    .mockResolvedValueOnce('{"wifi_connected":true}')
    .mockResolvedValueOnce('{"status":"authenticated"}')
    .mockResolvedValueOnce('[{"ssid":"Lab"}]');
  await act(() => result.current.fetchConfiguration());
  expect(result.current.configuration).toEqual({
    networkStatus: { wifi_connected: true },
    apiStatus: { status: 'authenticated' },
    wifiNetworks: [{ ssid: 'Lab' }],
  });
  expect(result.current.isFetchingConfiguration).toBe(false);
  state.send.mockResolvedValueOnce('{}').mockResolvedValueOnce('{}').mockResolvedValueOnce('{}');
  await act(() => result.current.fetchConfiguration());
  expect(result.current.configuration?.wifiNetworks).toEqual([]);
  state.send.mockRejectedValueOnce(new Error('Disconnected'));
  await act(async () => expect(result.current.fetchConfiguration()).rejects.toThrow('Disconnected'));
  expect(result.current.isFetchingConfiguration).toBe(false);
});
it('initializes after device startup and cancels initialization on unmount', async () => {
  vi.useFakeTimers();
  state.send.mockResolvedValue('{"pinIsSet":true}');
  const hook = renderHook(() => useAttractapSerialComm(), { wrapper });
  expect(state.send).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(hook.result.current.pinIsSet).toBe(true);
  hook.unmount();
  state.send.mockClear();
  const next = renderHook(() => useAttractapSerialComm(), { wrapper });
  next.unmount();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(state.send).not.toHaveBeenCalled();
});
it('waits for the device, validates a PIN, reports authentication failure and unlocks children', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <AttractapSerialCommProvider>
      <AttractapSerialCommGate>
        <p>Device configuration</p>
      </AttractapSerialCommGate>
    </AttractapSerialCommProvider>,
  );
  expect(screen.queryByText('Device configuration')).toBeNull();
  state.send.mockResolvedValueOnce('{"pinIsSet":true}');
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  const pin = await screen.findByRole('textbox');
  fireEvent.change(pin, { target: { value: '12' } });
  fireEvent.submit(pin.closest('form')!);
  expect(state.send).toHaveBeenCalledTimes(1);
  fireEvent.change(pin, { target: { value: '1234' } });
  state.send.mockResolvedValueOnce('{"error":"AUTH_REQUIRED"}');
  fireEvent.submit(pin.closest('form')!);
  await waitFor(() => expect(screen.getByText('Invalid PIN. Please try again.')).toBeTruthy());
  expect(screen.queryByText('Device configuration')).toBeNull();
  state.send.mockResolvedValueOnce('{}');
  fireEvent.submit(pin.closest('form')!);
  expect(await screen.findByText('Device configuration')).toBeTruthy();
  expect(state.send).toHaveBeenLastCalledWith(
    { topic: 'network.status.get', payload: '{"authCode":"1234"}' },
    true,
    15000,
  );
});
it('routes an unprotected device to PIN setup', async () => {
  state.send.mockResolvedValueOnce('{"pinIsSet":false}');
  render(
    <AttractapSerialCommProvider>
      <AttractapSerialCommGate>
        <p>Protected</p>
      </AttractapSerialCommGate>
    </AttractapSerialCommProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByText('Set a new device PIN')).toBeTruthy();
  expect(screen.queryByText('Protected')).toBeNull();
});
