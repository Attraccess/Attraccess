// @vitest-environment jsdom
//
// Covers the transport-aware branches of the devices table (ATT-789): a Zigbee
// device must never be offered device-side auth, and only a device that actually
// answered the Zigbee RPC surface may be offered pairing.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowActions, TransportChip } from './DevicesPage';
import type { ShellyDevice } from './api';

afterEach(() => {
  // Explicit: Testing Library only auto-registers cleanup when vitest runs with
  // `globals: true`, and this config does not.
  cleanup();
  vi.restoreAllMocks();
});

function makeDevice(overrides: Partial<ShellyDevice> = {}): ShellyDevice {
  return {
    id: 1,
    name: 'Workshop Dimmer',
    ipAddress: '192.168.1.50',
    generation: 4,
    model: 'S4SW-001P16EU',
    authState: 'none',
    lastProbeAt: '2026-06-12T15:00:00.000Z',
    lastProbeError: null,
    transport: 'wifi-mqtt',
    zigbeeCapable: null,
    zigbeeIeeeAddress: null,
    zigbeeFriendlyName: null,
    createdAt: '2026-06-12T15:00:00.000Z',
    updatedAt: '2026-06-12T15:00:00.000Z',
    ...overrides,
  };
}

function renderRowActions(device: ShellyDevice, handlers: Partial<Parameters<typeof RowActions>[0]> = {}) {
  const noop = () => undefined;
  render(
    <RowActions
      device={device}
      isBusy={false}
      onInfo={noop}
      onAuth={noop}
      onReprobe={noop}
      onDelete={noop}
      onPair={noop}
      onZigbeeControl={noop}
      {...handlers}
    />
  );
}

describe('TransportChip', () => {
  it('labels a gateway-driven device as Zigbee', () => {
    render(<TransportChip device={makeDevice({ transport: 'zigbee' })} />);
    expect(screen.getByText('Zigbee')).toBeInTheDocument();
  });

  it('labels everything else as WiFi', () => {
    render(<TransportChip device={makeDevice()} />);
    expect(screen.getByText('WiFi')).toBeInTheDocument();
  });
});

describe('RowActions', () => {
  it('shows an icon-only info action and collapses the rest into an overflow menu', async () => {
    const user = userEvent.setup();
    const onAuth = vi.fn();
    renderRowActions(makeDevice(), { onAuth });

    expect(screen.getByRole('button', { name: 'View device info' })).toHaveTextContent('');

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    const authItem = await screen.findByRole('menuitem', { name: /Set admin password/ });
    expect(screen.getByRole('menuitem', { name: /Re-probe device/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete device/ })).toBeInTheDocument();

    await user.click(authItem);
    expect(onAuth).toHaveBeenCalledTimes(1);
  });

  it('offers pairing only once a probe has confirmed the Zigbee RPC surface', async () => {
    const user = userEvent.setup();
    renderRowActions(makeDevice({ zigbeeCapable: null }));

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    // Undetermined capability must not render a button that the backend rejects.
    expect(screen.queryByRole('menuitem', { name: /Pair to Zigbee/ })).not.toBeInTheDocument();
  });

  it('offers pairing for a Zigbee-capable device still on WiFi', async () => {
    const user = userEvent.setup();
    const onPair = vi.fn();
    renderRowActions(makeDevice({ zigbeeCapable: true }), { onPair });

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pair to Zigbee/ }));

    expect(onPair).toHaveBeenCalledTimes(1);
  });

  it('replaces admin password with Zigbee control once the device is paired', async () => {
    const user = userEvent.setup();
    const onZigbeeControl = vi.fn();
    renderRowActions(
      makeDevice({ transport: 'zigbee', zigbeeCapable: true, zigbeeIeeeAddress: '0x90fd9ffffe6494fc' }),
      { onZigbeeControl }
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    // A Zigbee device has no device-side login, and is already paired.
    expect(screen.queryByRole('menuitem', { name: /Set admin password/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Pair to Zigbee/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('menuitem', { name: /Zigbee control/ }));
    expect(onZigbeeControl).toHaveBeenCalledTimes(1);
  });
});
