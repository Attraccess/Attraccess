import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NetworkChangeDetails, NetworkChangeForm } from './NetworkChangeDetails';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import en from './network-change.en.json';
import de from './network-change.de.json';
import type { NetworkChangeStatus } from './api';

const api = vi.hoisted(() => ({
  getNetworkChangeStatus: vi.fn(),
  listMqttServers: vi.fn(),
  changeControllerNetwork: vi.fn(),
  retryControllerNetworkChange: vi.fn(),
  retirePreviousMqttCredentials: vi.fn(),
}));
vi.mock('./api', () => api);
let client: QueryClient;
const initial: NetworkChangeStatus = {
  available: true,
  targetHost: '10.0.0.7',
  mqttServerId: 1,
  operation: null,
  pendingCredentialRetirements: 0,
};
beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  useTranslationState.setState({ language: 'en' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getNetworkChangeStatus.mockResolvedValue(initial);
  api.listMqttServers.mockResolvedValue([
    { id: 1, name: 'Current server', host: 'refreshed.test', port: 1883, useTls: false },
    { id: 2, name: 'New server', host: 'new.test', port: 8883, useTls: true },
  ]);
  api.changeControllerNetwork.mockImplementation(async (_id, input) => {
    const result = {
      ...initial,
      targetHost: input.targetHost,
      mqttServerId: input.mqttServerId ?? 1,
      operation: { ...input, phase: 'completed', failure: null, running: false },
    };
    api.getNetworkChangeStatus.mockResolvedValue(result);
    return result;
  });
  api.retryControllerNetworkChange.mockResolvedValue({
    ...initial,
    operation: { targetHost: '192.168.2.50', mqttServerId: 2, phase: 'completed', failure: null, running: false },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  useTranslationState.setState({ language: 'en' });
});
async function mount() {
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeForm controllerId={7} />
    </QueryClientProvider>,
  );
  const input = await screen.findByRole('textbox', { name: 'CC100 IP / SSH address' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('10.0.0.7'));
  return input;
}

it('refreshes the current server at the entered new address without a connectivity requirement', async () => {
  const input = await mount();
  fireEvent.change(input, { target: { value: '192.168.2.50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply MQTT server' }));
  await waitFor(() =>
    expect(api.changeControllerNetwork).toHaveBeenCalledWith(7, { targetHost: '192.168.2.50', mqttServerId: 1 }),
  );
  expect(await screen.findByText(en.success)).toBeTruthy();
  expect(screen.queryByText('device-password')).toBeNull();
});

it.each([
  ['New server', 2, 'Apply MQTT server'],
  [en.addressOnly, null, en.saveAddress],
] as const)('supports %s as an independent choice', async (choice, serverId, label) => {
  const input = await mount(),
    user = userEvent.setup();
  fireEvent.change(input, { target: { value: '192.168.2.50' } });
  await user.click(screen.getByRole('button', { name: 'Current server MQTT server' }));
  await user.click(await screen.findByRole('option', { name: choice }));
  await user.click(screen.getByRole('button', { name: label }));
  await waitFor(() =>
    expect(api.changeControllerNetwork).toHaveBeenCalledWith(7, { targetHost: '192.168.2.50', mqttServerId: serverId }),
  );
});

it.each(['none', 'host', 'server'] as const)(
  'refreshes cached endpoints while preserving the edited %s field',
  async (edited) => {
    client.setQueryData(['wago', 'network-change', 7], initial);
    let resolve!: (value: NetworkChangeStatus) => void;
    api.getNetworkChangeStatus.mockReturnValue(
      new Promise<NetworkChangeStatus>((done) => {
        resolve = done;
      }),
    );
    const input = await mount(),
      user = userEvent.setup();
    if (edited === 'host') fireEvent.change(input, { target: { value: '192.168.2.50' } });
    if (edited === 'server') {
      await user.click(screen.getByRole('button', { name: 'Current server MQTT server' }));
      await user.click(await screen.findByRole('option', { name: en.addressOnly }));
    }
    resolve({ ...initial, targetHost: '10.0.0.8', mqttServerId: 2 });
    await waitFor(() =>
      expect((input as HTMLInputElement).value).toBe(edited === 'host' ? '192.168.2.50' : '10.0.0.8'),
    );
    await screen.findByRole('button', { name: `${edited === 'server' ? en.addressOnly : 'New server'} MQTT server` });
    await user.click(screen.getByRole('button', { name: edited === 'server' ? en.saveAddress : en.apply }));
    await waitFor(() =>
      expect(api.changeControllerNetwork).toHaveBeenCalledWith(7, {
        targetHost: edited === 'host' ? '192.168.2.50' : '10.0.0.8',
        mqttServerId: edited === 'server' ? null : 2,
      }),
    );
  },
);

it('shows an actionable pinned-host failure and permits correcting an address before device mutation', async () => {
  api.getNetworkChangeStatus.mockResolvedValue({
    ...initial,
    operation: {
      targetHost: '192.168.2.50',
      mqttServerId: 1,
      phase: 'connecting',
      failure: 'host_identity',
      running: false,
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeForm controllerId={7} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(en.failures.host_identity)).toBeTruthy();
  expect((screen.getByRole('textbox', { name: en.address }) as HTMLInputElement).disabled).toBe(false);
});

it('resumes saved interrupted settings after remount and prevents a competing new change', async () => {
  api.getNetworkChangeStatus.mockResolvedValue({
    ...initial,
    operation: {
      targetHost: '192.168.2.50',
      mqttServerId: 2,
      phase: 'applying',
      failure: 'interrupted',
      running: false,
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeForm controllerId={7} />
    </QueryClientProvider>,
  );
  const button = await screen.findByRole('button', { name: en.retry });
  expect((screen.getByRole('textbox', { name: en.address }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: en.apply })).toBeNull();
  fireEvent.click(button);
  await waitFor(() => expect(api.retryControllerNetworkChange).toHaveBeenCalledWith(7));
  expect(api.changeControllerNetwork).not.toHaveBeenCalled();
});

it('shows progress and disables duplicate requests while the controller operation runs', async () => {
  api.getNetworkChangeStatus.mockResolvedValue({
    ...initial,
    operation: { targetHost: '192.168.2.50', mqttServerId: 2, phase: 'verifying', failure: null, running: true },
  });
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeForm controllerId={7} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('progressbar', { name: en.phases.verifying })).toBeTruthy();
  expect((screen.getByRole('button', { name: en.retry }) as HTMLButtonElement).disabled).toBe(true);
});

it('opens the feature in Advanced and provides matching English/German translations', async () => {
  useTranslationState.setState({ language: 'de' });
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeDetails controllerId={7} />
    </QueryClientProvider>,
  );
  expect(api.getNetworkChangeStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: de.advanced }));
  expect(await screen.findByText(de.title)).toBeTruthy();
  expect(Object.keys(de)).toEqual(Object.keys(en));
  expect(Object.keys(de.phases)).toEqual(Object.keys(en.phases));
  expect(Object.keys(de.failures)).toEqual(Object.keys(en.failures));
});

it('allows pending broker cleanup after automatic SSH management has been retired', async () => {
  api.getNetworkChangeStatus.mockResolvedValue({ ...initial, available: false, pendingCredentialRetirements: 1 });
  render(
    <QueryClientProvider client={client}>
      <NetworkChangeForm controllerId={7} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: en.retire }));
  await waitFor(() => expect(api.retirePreviousMqttCredentials).toHaveBeenCalledWith(7));
  expect(screen.queryByRole('button', { name: en.apply })).toBeNull();
});
