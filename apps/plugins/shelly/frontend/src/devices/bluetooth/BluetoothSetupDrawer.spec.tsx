// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { PluginApiError } from '@attraccess/plugins-frontend-sdk';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDevice } from '../../api';
import { computeHa1 } from '../../bluetooth/digest';
import { createFakeDevice, type FakeDevice, type FakeDeviceOptions } from '../../bluetooth/fakeDevice.test-utils';
import { SHELLY_RPC_DATA, SHELLY_RPC_RX_CONTROL, SHELLY_RPC_TX_CONTROL } from '../../bluetooth/gatt';
import { BluetoothSetupDrawer } from './BluetoothSetupDrawer';

vi.mock('../../api', () => ({ addDevice: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(addDevice).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

const WIFI_PW = 'wifi-secret-123';
const ADMIN_PW = 'admin-secret-456';

function installBluetooth(
  fake: FakeDevice | Error,
  options: { noRpcService?: boolean; chooserClosed?: Promise<void> } = {},
) {
  const disconnect = vi.fn();
  const requestDevice = vi.fn(async () => {
    await options.chooserClosed;
    if (fake instanceof Error) throw fake;
    const byUuid = {
      [SHELLY_RPC_DATA]: fake.channel.data,
      [SHELLY_RPC_TX_CONTROL]: fake.channel.txControl,
      [SHELLY_RPC_RX_CONTROL]: fake.channel.rxControl,
    };
    return {
      name: 'ShellyPro1PM-A0B1C2D3E4F5',
      gatt: {
        connect: async () => ({
          getPrimaryService: async () => {
            if (options.noRpcService) throw Object.assign(new Error('No Services found'), { name: 'NotFoundError' });
            return { getCharacteristic: async (uuid: keyof typeof byUuid) => byUuid[uuid] };
          },
        }),
        disconnect,
      },
    };
  });
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice } });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  return { requestDevice, disconnect };
}

function renderDrawer() {
  const onRegistered = vi.fn();
  const onOpenChange = vi.fn();
  const { unmount } = render(<BluetoothSetupDrawer isOpen onOpenChange={onOpenChange} onRegistered={onRegistered} />);
  return { onRegistered, onOpenChange, unmount };
}

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const NETWORKS: FakeDeviceOptions['networks'] = [
  { ssid: 'Workshop', rssi: -50, auth: 3 },
  { ssid: 'Guest', rssi: -70, auth: 0 },
];

async function enter(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}

async function fillAndStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText(/Workshop/));
  await enter(user, await screen.findByLabelText('Wi-Fi password'), WIFI_PW);
  await enter(user, screen.getByLabelText('New admin password'), ADMIN_PW);
  await enter(user, screen.getByLabelText('Confirm admin password'), ADMIN_PW);
  await user.click(screen.getByRole('button', { name: /Start setup/ }));
}

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
});

describe('BluetoothSetupDrawer', () => {
  it('explains the alternatives and offers no select button without Web Bluetooth', () => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined });
    renderDrawer();
    expect(screen.getByText('Bluetooth is not available here')).toBeInTheDocument();
    expect(screen.getByText(/Add device/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Select device/ })).not.toBeInTheDocument();
  });

  it('explains an insecure context', () => {
    installBluetooth(createFakeDevice());
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    renderDrawer();
    expect(screen.getByText(/HTTPS pages or on localhost/)).toBeInTheDocument();
  });

  it('filters the chooser to Shelly devices and treats cancelling as no error', async () => {
    const { requestDevice } = installBluetooth(Object.assign(new Error('cancelled'), { name: 'NotFoundError' }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));

    await waitFor(() => expect(requestDevice).toHaveBeenCalled());
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ services: ['5f6d4f53-5f52-5043-5f53-56435f49445f'] }, { namePrefix: 'Shelly' }],
      optionalServices: ['5f6d4f53-5f52-5043-5f53-56435f49445f'],
    });
    expect(await screen.findByRole('button', { name: /Select device/ })).toBeInTheDocument();
    expect(screen.queryByText('Could not connect')).not.toBeInTheDocument();
  });

  it('sets a device up end to end without sending a secret to Attraccess', async () => {
    const fake = createFakeDevice({ networks: NETWORKS });
    const { disconnect } = installBluetooth(fake);
    vi.mocked(addDevice).mockResolvedValue({} as never);
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level));
    const user = userEvent.setup();
    const { onRegistered } = renderDrawer();

    await user.click(screen.getByRole('button', { name: /Select device/ }));
    expect(await screen.findByText('SPSW-201PE16EU')).toBeInTheDocument();
    expect(screen.getByText('1.4.4')).toBeInTheDocument();
    // Strongest network first, open networks marked.
    const labels = (await screen.findAllByRole('radio')).map((r) => r.closest('label')?.textContent ?? '');
    expect(labels[0]).toContain('Workshop');
    expect(labels[1]).toContain('Guest');
    expect(labels[1]).toContain('open');
    // Bluetooth-off is on by default.
    expect(screen.getByRole('checkbox', { name: /Switch off Bluetooth/ })).toBeChecked();

    await fillAndStart(user);

    expect(await screen.findByText('Device set up')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.57')).toBeInTheDocument();
    expect(screen.getByText('Admin password set')).toBeInTheDocument();
    expect(screen.getByText('Bluetooth switched off')).toBeInTheDocument();
    expect(addDevice).toHaveBeenCalledWith({ ipAddress: '192.168.1.57', name: 'ShellyPro1PM-A0B1C2D3E4F5' });
    expect(JSON.stringify(vi.mocked(addDevice).mock.calls)).not.toMatch(/secret/);
    expect(fake.state.wifi).toMatchObject({ ssid: 'Workshop', pass: WIFI_PW });
    expect(fake.state.bleEnabled).toBe(false);
    expect(onRegistered).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    // Nothing is stored, and nothing is left on the page.
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.body.innerHTML).not.toContain(WIFI_PW);
    expect(document.body.innerHTML).not.toContain(ADMIN_PW);
    // Nothing is logged with a secret in it either.
    const output = JSON.stringify(logged.flatMap((spy) => spy.mock.calls.map((args) => args.map(String))));
    expect(output).not.toContain(WIFI_PW);
    expect(output).not.toContain(ADMIN_PW);
  });

  it('leaves Bluetooth on when the box is unticked and says so', async () => {
    const fake = createFakeDevice({ networks: NETWORKS });
    installBluetooth(fake);
    vi.mocked(addDevice).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Switch off Bluetooth/ }));
    await fillAndStart(user);

    expect(await screen.findByText('Bluetooth left on')).toBeInTheDocument();
    expect(fake.state.bleEnabled).toBe(true);
  });

  it('requires matching admin passwords', async () => {
    installBluetooth(createFakeDevice({ networks: NETWORKS }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await user.click(await screen.findByLabelText(/Guest/));
    await enter(user, screen.getByLabelText('New admin password'), ADMIN_PW);
    await enter(user, screen.getByLabelText('Confirm admin password'), 'something-else');
    await user.click(screen.getByRole('button', { name: /Start setup/ }));

    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(addDevice).not.toHaveBeenCalled();

    // Fixing the first field (not the confirm field) clears the message too.
    await user.clear(screen.getByLabelText('New admin password'));
    await enter(user, screen.getByLabelText('New admin password'), 'something-else');
    await waitFor(() => expect(screen.queryByText('The passwords do not match.')).not.toBeInTheDocument());
  });

  it('shows the already-registered notice on a 409 and still switches Bluetooth off', async () => {
    const fake = createFakeDevice({ networks: NETWORKS });
    installBluetooth(fake);
    vi.mocked(addDevice).mockRejectedValue(new PluginApiError('exists', 409));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    expect(await screen.findByText(/already registered in Attraccess/)).toBeInTheDocument();
    expect(fake.state.bleEnabled).toBe(false);
  });

  it('shows a warning, not a failure, when Bluetooth cannot be switched off', async () => {
    installBluetooth(createFakeDevice({ networks: NETWORKS, bleSetConfig: 'refuse' }));
    vi.mocked(addDevice).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    expect(await screen.findByText('Device set up')).toBeInTheDocument();
    expect(screen.getByText(/refused to switch Bluetooth off/)).toBeInTheDocument();
  });

  it('names the failing step and offers a restart', async () => {
    installBluetooth(
      createFakeDevice({ networks: NETWORKS, failMethod: { method: 'Shelly.SetAuth', message: 'Invalid argument' } }),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    expect(await screen.findByText('Setup failed at “Set the admin password”')).toBeInTheDocument();
    const detail = screen.getByText(/Invalid argument/);
    expect(detail).toHaveAttribute('data-cy', 'shelly-ble-failure');
    expect(detail.textContent).not.toContain(ADMIN_PW);
    expect(document.querySelector('[data-cy="shelly-ble-step-password"]')).toHaveAttribute('data-status', 'failed');
    expect(document.querySelector('[data-cy="shelly-ble-step-wifi"]')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
  });

  it('asks a protected device for its current password and has no confirm field', async () => {
    installBluetooth(createFakeDevice({ networks: NETWORKS, authEn: true, ha1: 'x' }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));

    expect(await screen.findByLabelText('Current admin password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm admin password')).not.toBeInTheDocument();
  });

  it('scans again with the entered password when a protected device refused the first scan', async () => {
    const ha1 = await computeHa1('admin', 'shellypro1pm-a0b1c2d3e4f5', ADMIN_PW);
    installBluetooth(createFakeDevice({ networks: NETWORKS, authEn: true, ha1 }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));

    expect(await screen.findByText(/enter it below and press “Scan again”/)).toBeInTheDocument();
    await enter(user, await screen.findByLabelText('Current admin password'), ADMIN_PW);
    await user.click(screen.getByRole('button', { name: /Scan again/ }));

    expect(await screen.findByLabelText(/Workshop/)).toBeInTheDocument();
  });

  it('tells the operator to restart when Wi-Fi needs a reboot, and registers nothing', async () => {
    installBluetooth(createFakeDevice({ networks: NETWORKS, restartRequiredOnWifi: true }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    expect(await screen.findByText('The device is restarting')).toBeInTheDocument();
    expect(addDevice).not.toHaveBeenCalled();
  });

  it('shows progress per step and cannot be closed while the steps run', async () => {
    installBluetooth(createFakeDevice({ networks: NETWORKS }));
    const registering = deferred<never>();
    vi.mocked(addDevice).mockReturnValue(registering.promise);
    const user = userEvent.setup();
    const { onOpenChange } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    const step = (name: string) => document.querySelector(`[data-cy="shelly-ble-step-${name}"]`);
    await waitFor(() => expect(step('register')).toHaveAttribute('data-status', 'running'));
    expect(step('register')).toHaveAttribute('aria-current', 'step');
    for (const done of ['password', 'wifi', 'join']) expect(step(done)).toHaveAttribute('data-status', 'done');
    expect(step('bluetooth')).toHaveAttribute('data-status', 'pending');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('drops the Bluetooth link when the drawer is closed or unmounted', async () => {
    const first = installBluetooth(createFakeDevice({ networks: NETWORKS }));
    const user = userEvent.setup();
    const { onOpenChange, unmount } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await screen.findByLabelText('New admin password');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(first.disconnect).toHaveBeenCalled();
    unmount();

    const second = installBluetooth(createFakeDevice({ networks: NETWORKS }));
    const view = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await screen.findByLabelText('New admin password');
    view.unmount();
    expect(second.disconnect).toHaveBeenCalled();
  });

  it('drops a link that connects after the drawer is gone', async () => {
    const chooser = deferred();
    const { disconnect } = installBluetooth(createFakeDevice(), { chooserClosed: chooser.promise });
    const user = userEvent.setup();
    const { unmount } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    unmount();
    await act(async () => chooser.resolve());
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });

  it('explains a device without the Shelly RPC service and drops the link', async () => {
    const { disconnect } = installBluetooth(createFakeDevice(), { noRpcService: true });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));

    expect(await screen.findByText(/does not offer Shelly's Bluetooth RPC service/)).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });

  it('says Bluetooth is off instead of treating it as a cancelled chooser', async () => {
    installBluetooth(Object.assign(new Error('Bluetooth adapter not available.'), { name: 'NotFoundError' }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));

    expect(await screen.findByText(/Bluetooth is switched off or missing on this computer/)).toBeInTheDocument();
  });

  it('names the step and offers a fresh start when the link drops mid-setup', async () => {
    const fake = createFakeDevice({ networks: NETWORKS });
    installBluetooth(fake);
    const readRx = fake.channel.rxControl.readValue;
    fake.channel.rxControl.readValue = () =>
      fake.state.wifi ? Promise.reject(new Error('GATT Server is disconnected')) : readRx();
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /Select device/ }));
    await fillAndStart(user);

    expect(await screen.findByText('Setup failed at “Configure Wi-Fi”')).toBeInTheDocument();
    expect(screen.getByText(/The Bluetooth connection was lost/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('button', { name: /Select device/ })).toBeInTheDocument();
  });
});
