// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceInfoDetails, RowActions } from './DevicesPage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeviceInfoDetails', () => {
  it('renders device info as readable fields instead of raw JSON textareas', () => {
    render(
      <DeviceInfoDetails
        info={{
          generation: 2,
          fetchedAt: '2026-06-12T15:00:00.000Z',
          status: {
            wifi: { sta_ip: '192.168.1.50', ssid: 'Workshop WiFi', rssi: -58 },
            switch_0: { output: true, apower: 42.5, voltage: 231.2, current: 0.18 },
            sys: { uptime: 12345, ram_free: 103424 },
          },
          config: {
            sys: { device: { name: 'Workshop Dimmer' }, location: { tz: 'Europe/Amsterdam' } },
          },
        }}
      />
    );

    expect(screen.getByText('Workshop Dimmer')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.50')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('42.5 W')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/switch_0/)).not.toBeInTheDocument();
  });

  it('shows an empty state before info is loaded', () => {
    render(<DeviceInfoDetails info={null} />);

    expect(screen.getByText('No device info loaded yet.')).toBeInTheDocument();
  });
});

describe('RowActions', () => {
  it('uses icon-only actions with accessible names', () => {
    render(
      <RowActions
        deviceId={1}
        isBusy={false}
        onInfo={() => undefined}
        onAuth={() => undefined}
        onReprobe={() => undefined}
        onDelete={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: 'View device info' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Set admin password' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Re-probe device' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Delete device' })).toHaveTextContent('');
  });
});
