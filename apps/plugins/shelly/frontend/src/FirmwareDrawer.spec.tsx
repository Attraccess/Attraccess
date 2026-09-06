// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirmwareCell, FirmwareDetails, FirmwareDrawer, UpdateAvailableIndicator } from './FirmwareDrawer';
import {
  getFirmware,
  startFirmwareUpdate,
  type FirmwareOverviewEntry,
  type FirmwareStatus,
  type ShellyDevice,
} from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getFirmware: vi.fn(),
  startFirmwareUpdate: vi.fn(),
}));

// Vitest runs without globals here, so testing-library's auto-cleanup is off.
afterEach(cleanup);

function entry(overrides: Partial<FirmwareStatus> & { error?: string } = {}): FirmwareOverviewEntry {
  const { error, ...status } = overrides;
  return {
    deviceId: 1,
    error: error ?? null,
    status: error
      ? null
      : {
          generation: 2,
          currentVersion: '1.4.4',
          available: { stable: null, beta: null },
          hasUpdate: false,
          state: 'idle',
          fetchedAt: '2026-07-28T10:00:00.000Z',
          ...status,
        },
  };
}

describe('FirmwareCell', () => {
  it('shows the installed version and the offered update', () => {
    render(<FirmwareCell entry={entry({ hasUpdate: true, available: { stable: '1.5.1', beta: null } })} />);

    expect(screen.getByText('1.4.4')).toBeInTheDocument();
    expect(screen.getByText('1.5.1 available')).toBeInTheDocument();
  });

  it('shortens Gen1 build-stamped versions but keeps the full string in the tooltip', () => {
    render(
      <FirmwareCell
        entry={entry({
          currentVersion: '20221027-102237/v1.12.1',
          hasUpdate: true,
          available: { stable: '20230913-114150/v1.14.0', beta: null },
        })}
      />,
    );

    expect(screen.getByTitle('20221027-102237/v1.12.1')).toHaveTextContent('v1.12.1');
    expect(screen.getByTitle('20230913-114150/v1.14.0')).toHaveTextContent('v1.14.0 available');
  });

  it('shows only the installed version when the device is up to date', () => {
    render(<FirmwareCell entry={entry()} />);

    expect(screen.getByText('1.4.4')).toBeInTheDocument();
    expect(screen.queryByText(/available/)).not.toBeInTheDocument();
  });

  it('degrades to "Unavailable" when the check failed', () => {
    render(<FirmwareCell entry={entry({ error: 'connect ETIMEDOUT' })} />);

    expect(screen.getByTitle('connect ETIMEDOUT')).toHaveTextContent('Unavailable');
  });

  it('shows a pending state while the overview is still loading', () => {
    render(<FirmwareCell entry={undefined} />);

    expect(screen.getByText('Checking…')).toBeInTheDocument();
  });
});

describe('UpdateAvailableIndicator', () => {
  it('marks devices with a pending update and names the offered version', () => {
    render(<UpdateAvailableIndicator entry={entry({ hasUpdate: true, available: { stable: '1.5.1', beta: null } })} />);

    expect(screen.getByRole('button', { name: 'Firmware update available: 1.5.1' })).toBeInTheDocument();
  });

  it('renders nothing for up-to-date or unchecked devices', () => {
    const { container } = render(
      <>
        <UpdateAvailableIndicator entry={entry()} />
        <UpdateAvailableIndicator entry={undefined} />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('FirmwareDetails', () => {
  it('lists both channels and says when a channel has nothing newer', () => {
    render(
      <FirmwareDetails
        status={{
          generation: 1,
          currentVersion: 'v1.12.1',
          available: { stable: 'v1.14.0', beta: null },
          hasUpdate: true,
          state: 'idle',
          fetchedAt: '2026-07-28T10:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('v1.12.1')).toBeInTheDocument();
    expect(screen.getByText('v1.14.0')).toBeInTheDocument();
    expect(screen.getByText('Nothing newer')).toBeInTheDocument();
  });

  it('shows an empty state before firmware info is loaded', () => {
    render(<FirmwareDetails status={null} />);

    expect(screen.getByText('No firmware info loaded yet.')).toBeInTheDocument();
  });
});

describe('FirmwareDrawer install polling', () => {
  const device: ShellyDevice = {
    id: 1,
    name: 'Workshop Dimmer',
    ipAddress: '192.168.1.50',
    generation: 2,
    model: 'SNSW-001P16EU',
    authState: 'none',
    lastProbeAt: null,
    lastProbeError: null,
    createdAt: '2026-07-28T10:00:00.000Z',
    updatedAt: '2026-07-28T10:00:00.000Z',
  };

  // Regression: the 5-minute deadline used to be checked only in the poll's
  // catch branch. A device that stays reachable but never reports the target
  // version never throws, so "Installing…" spun forever with no terminal state.
  it('gives up after the deadline even while the device keeps answering', async () => {
    vi.mocked(getFirmware).mockResolvedValue({
      generation: 2,
      currentVersion: '1.4.4',
      available: { stable: '1.5.1', beta: null },
      hasUpdate: true,
      state: 'idle',
      fetchedAt: '2026-07-28T10:00:00.000Z',
    });
    vi.mocked(startFirmwareUpdate).mockResolvedValue(undefined as never);

    render(<FirmwareDrawer device={device} onOpenChange={() => undefined} onUpdated={() => undefined} />);
    const install = await screen.findByRole('button', { name: 'Install stable firmware 1.5.1' });

    // Fake timers only from here: RTL's waitFor polls on setInterval, which
    // vitest fakes, so findBy* deadlocks once they are installed.
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(install);
      });
      expect(screen.getByText(/Installing the stable firmware/)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 5000);
      });

      expect(screen.getByText(/did not report the expected firmware version within 5 minutes/)).toBeInTheDocument();
      expect(screen.queryByText(/Installing the stable firmware/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
