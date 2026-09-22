import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapSerialConfiguratorPin } from './Pin';
import { AttractapSerialConfiguratorNetwork } from './Network';
const state = vi.hoisted(() => ({
  setAuthCode: vi.fn(),
  sendAuthedCommand: vi.fn(),
  refreshPinStatus: vi.fn(),
  sendCommand: vi.fn(),
  fetchConfiguration: vi.fn(),
  configuration: undefined as
    | undefined
    | {
        networkStatus: {
          wifi_connected: boolean;
          ethernet_connected: boolean;
          wifi_ssid?: string;
          wifi_ip?: string;
          ethernet_ip?: string;
        };
        wifiNetworks: { ssid: string }[];
      },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('./Auth', () => ({ useAttractapSerialComm: () => state }));
vi.mock('../../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ sendCommand: state.sendCommand }) },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.configuration = undefined;
  state.sendCommand.mockResolvedValue('{}');
  state.sendAuthedCommand.mockResolvedValue(undefined);
  state.refreshPinStatus.mockResolvedValue(undefined);
  state.fetchConfiguration.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function submit() {
  fireEvent.submit(document.querySelector('form')!);
}
it('validates PIN syntax and confirmation before changing the authenticated PIN', async () => {
  render(
    <MemoryRouter>
      <AttractapSerialConfiguratorPin />
    </MemoryRouter>,
  );
  submit();
  expect(screen.getByText('errors.invalid')).toBeTruthy();
  fill('fields.currentPin', '1234');
  fill('fields.newPin', 'abcd');
  submit();
  expect(screen.getByText('errors.invalid')).toBeTruthy();
  fill('fields.newPin', '5678');
  fill('fields.confirmPin', '5679');
  submit();
  expect(screen.getByText('errors.mismatch')).toBeTruthy();
  expect(state.sendAuthedCommand).not.toHaveBeenCalled();
  fill('fields.confirmPin', '5678');
  submit();
  await waitFor(() => expect(state.setAuthCode).toHaveBeenCalledWith('5678'));
  expect(state.sendAuthedCommand).toHaveBeenCalledWith('auth.code.set', { currentCode: '1234', newCode: '5678' });
  expect(screen.getByLabelText('fields.newPin')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'actions.logout' }));
  expect(state.setAuthCode).toHaveBeenLastCalledWith(null);
});
it('sets a first PIN using the unauthenticated command and refreshes device status', async () => {
  render(
    <MemoryRouter>
      <AttractapSerialConfiguratorPin mode="set" />
    </MemoryRouter>,
  );
  expect(screen.queryByLabelText('fields.currentPin')).toBeNull();
  fill('fields.newPin', '5678');
  fill('fields.confirmPin', '5678');
  submit();
  await waitFor(() => expect(state.refreshPinStatus).toHaveBeenCalledOnce());
  expect(state.sendCommand).toHaveBeenCalledWith({ topic: 'auth.code.set', payload: '{"newCode":"5678"}' }, true, 5000);
  expect(state.setAuthCode).toHaveBeenCalledWith('5678');
});
it.each([
  { response: '{"error":"DEVICE_DENIED"}', expected: 'DEVICE_DENIED' },
  { response: undefined, expected: 'errors.auth' },
  { response: '{', expected: 'errors.auth' },
])('retains the PIN draft when the device returns $response', async ({ response, expected }) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.sendCommand.mockResolvedValue(response);
  render(
    <MemoryRouter>
      <AttractapSerialConfiguratorPin mode="set" />
    </MemoryRouter>,
  );
  fill('fields.newPin', '5678');
  fill('fields.confirmPin', '5678');
  submit();
  expect(await screen.findByText(expected)).toBeTruthy();
  expect(state.setAuthCode).not.toHaveBeenCalled();
  expect(state.refreshPinStatus).not.toHaveBeenCalled();
  expect(screen.getByLabelText('fields.newPin')).toHaveValue('5678');
});
it('deduplicates discovered networks, configures Wi-Fi and refreshes status', async () => {
  state.configuration = {
    networkStatus: { wifi_connected: false, ethernet_connected: false },
    wifiNetworks: [{ ssid: 'Workshop' }, { ssid: 'Workshop' }, { ssid: 'Guest' }],
  };
  let resolve: () => void = () => undefined;
  state.sendAuthedCommand.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  render(
    <MemoryRouter>
      <AttractapSerialConfiguratorNetwork />
    </MemoryRouter>,
  );
  expect(screen.getByText('wifi.disconnected.title')).toBeTruthy();
  expect(screen.getByText('ethernet.disconnected.title')).toBeTruthy();
  expect(document.querySelectorAll('datalist option')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'setCredentials.label' })).toBeDisabled();
  fill('ssidSelect.label', 'Workshop');
  fill('password.label', 'secret');
  fireEvent.click(screen.getByRole('button', { name: 'setCredentials.label' }));
  expect(state.sendAuthedCommand).toHaveBeenCalledWith('network.wifi.credentials.set', {
    ssid: 'Workshop',
    password: 'secret',
  });
  expect(screen.getByRole('progressbar')).toBeTruthy();
  await act(async () => resolve());
  expect(state.fetchConfiguration).toHaveBeenCalledOnce();
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'actions.refresh' }));
  expect(state.fetchConfiguration).toHaveBeenCalledTimes(2);
});
it('shows connected interfaces and supports open Wi-Fi networks', async () => {
  state.configuration = {
    networkStatus: {
      wifi_connected: true,
      ethernet_connected: true,
      wifi_ssid: 'Workshop',
      wifi_ip: '192.0.2.2',
      ethernet_ip: '192.0.2.3',
    },
    wifiNetworks: [],
  };
  render(
    <MemoryRouter>
      <AttractapSerialConfiguratorNetwork />
    </MemoryRouter>,
  );
  expect(screen.getByText('wifi.connected.title')).toBeTruthy();
  expect(screen.getByText('ethernet.connected.title')).toBeTruthy();
  fill('ssidSelect.label', 'Guest');
  fireEvent.click(screen.getByRole('button', { name: 'setCredentials.label' }));
  await waitFor(() => expect(state.fetchConfiguration).toHaveBeenCalledOnce());
  expect(state.sendAuthedCommand).toHaveBeenCalledWith('network.wifi.credentials.set', { ssid: 'Guest', password: '' });
});
