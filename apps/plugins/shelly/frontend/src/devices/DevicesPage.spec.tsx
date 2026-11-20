// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceInfoCards } from './info/DeviceInfoCards';
import { RowActions } from './RowActions';

// Vitest runs without globals here, so testing-library's auto-cleanup is off.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DeviceInfoCards', () => {
  it('renders device info as readable fields instead of raw JSON textareas', () => {
    render(
      <DeviceInfoCards
        info={{
          generation: 2,
          fetchedAt: '2026-06-12T15:00:00.000Z',
          status: {
            wifi: { sta_ip: '192.168.1.50', ssid: 'Workshop WiFi', rssi: -58 },
            'switch:0': { output: true, apower: 42.5, voltage: 231.2, current: 0.18 },
            sys: { uptime: 12345, ram_free: 103424 },
          },
          config: {
            sys: { device: { name: 'Workshop Dimmer' }, location: { tz: 'Europe/Amsterdam' } },
          },
        }}
      />,
    );

    expect(screen.getByText('Workshop Dimmer')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.50')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('42.5 W')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/switch:0/)).not.toBeInTheDocument();
  });

  it('reads Gen1 status through arrays (relays/meters)', () => {
    render(
      <DeviceInfoCards
        info={{
          generation: 1,
          fetchedAt: '2026-06-12T15:00:00.000Z',
          status: {
            relays: [{ ison: true }],
            meters: [{ power: 12.3 }],
          },
          config: {},
        }}
      />,
    );

    expect(screen.getAllByText('On').length).toBeGreaterThan(0);
    expect(screen.getByText('12.3 W')).toBeInTheDocument();
  });
});

describe('RowActions', () => {
  it('collects every device action, info included, in one row menu', async () => {
    const user = userEvent.setup();
    const onAuth = vi.fn();
    const onInfo = vi.fn();

    render(
      <RowActions
        device={{ id: 1, name: 'Workshop light', ipAddress: '192.0.2.1' }}
        isBusy={false}
        onInfo={onInfo}
        onFirmware={() => undefined}
        onAuth={onAuth}
        onReprobe={() => undefined}
        onDelete={async () => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Workshop light' }));

    const authItem = await screen.findByRole('menuitem', { name: /Set admin password/ });
    expect(screen.getByRole('menuitem', { name: /View device info/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Manage firmware/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Re-probe device/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete device/ })).toBeInTheDocument();

    await user.click(authItem);
    expect(onAuth).toHaveBeenCalledTimes(1);
    expect(onInfo).not.toHaveBeenCalled();
  });
});
