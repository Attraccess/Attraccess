// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FirmwareCell, FirmwareDetails, UpdateAvailableIndicator } from './FirmwareDrawer';
import type { FirmwareOverviewEntry, FirmwareStatus } from './api';

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
      />
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
      </>
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
      />
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
