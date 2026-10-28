// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { Table, TableBody, TableColumn, TableContent, TableHeader } from '@heroui/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reprobeDevice, type FirmwareOverviewEntry, type ShellyDevice } from './api';
import { useShellyTranslations } from './i18n';
import { renderDevicesPageDevicesRows } from './renderDevicesPageDevicesRows';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  reprobeDevice: vi.fn(),
}));

// Vitest runs without globals here, so testing-library's auto-cleanup is off.
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

type RowProps = Parameters<typeof renderDevicesPageDevicesRows>[1];
type Handlers = Omit<RowProps, 't' | 'firmware' | 'rowBusyId'>;

const baseDevice: ShellyDevice = {
  id: 7,
  name: 'Workshop light',
  ipAddress: '192.0.2.7',
  generation: 2,
  model: 'Plus1',
  authState: 'required',
  lastProbeAt: null,
  lastProbeError: null,
  createdAt: '2026-09-22',
  updatedAt: '2026-09-22',
};

function handlers(): Handlers {
  return {
    setInfoDevice: vi.fn(),
    setFirmwareDevice: vi.fn(),
    setAuthDevice: vi.fn(),
    setDeleteTarget: vi.fn(),
    withRowBusy: vi.fn(async (_id: number, action: () => Promise<unknown>) => {
      await action();
    }),
  };
}

function DevicesTable({
  devices,
  firmware = {},
  rowBusyId = null,
  actions,
}: {
  devices: ShellyDevice[];
  firmware?: Record<number, FirmwareOverviewEntry>;
  rowBusyId?: number | null;
  actions: Handlers;
}) {
  const { t } = useShellyTranslations();
  return (
    <Table>
      <TableContent aria-label="Devices">
        <TableHeader>
          <TableColumn isRowHeader>Device</TableColumn>
          <TableColumn>Address</TableColumn>
          <TableColumn>Model</TableColumn>
          <TableColumn>Auth</TableColumn>
          <TableColumn>Firmware</TableColumn>
          <TableColumn>Actions</TableColumn>
        </TableHeader>
        <TableBody items={devices}>
          {(device) => renderDevicesPageDevicesRows(device, { firmware, t, rowBusyId, ...actions })}
        </TableBody>
      </TableContent>
    </Table>
  );
}

function row(id: number) {
  const element = document.querySelector<HTMLElement>(`[data-cy="shelly-device-row-${id}"]`);
  if (!element) throw new Error(`device row ${id} was not rendered`);
  return within(element);
}

describe('renderDevicesPageDevicesRows', () => {
  it('summarises a healthy device with its model, generation, auth state, and pending update', () => {
    const firmware: Record<number, FirmwareOverviewEntry> = {
      7: {
        deviceId: 7,
        error: null,
        status: {
          generation: 2,
          currentVersion: '1.3.0',
          available: { stable: '1.4.0', beta: null },
          hasUpdate: true,
          state: 'idle',
          fetchedAt: '2026-09-22T10:00:00Z',
        },
      },
    };
    render(<DevicesTable devices={[baseDevice]} firmware={firmware} actions={handlers()} />);

    const cells = row(7);
    expect(cells.getByTitle('Workshop light')).toHaveTextContent('Workshop light');
    expect(cells.getAllByText('192.0.2.7')).toHaveLength(2);
    expect(cells.getByTitle('Plus1')).toHaveTextContent('Plus1');
    expect(cells.getByText('Gen 2+')).toBeInTheDocument();
    expect(cells.getByText('Auth required')).toBeInTheDocument();
    expect(cells.getByRole('button', { name: 'Firmware update available: 1.4.0' })).toBeInTheDocument();
    expect(cells.getByText('1.4.0 available')).toBeInTheDocument();
    expect(cells.queryByRole('button', { name: /Probe failed/ })).not.toBeInTheDocument();
  });

  it('labels Gen1, unknown-generation, and model-less devices and surfaces probe errors', () => {
    const devices: ShellyDevice[] = [
      { ...baseDevice, id: 1, name: 'Old relay', generation: 1, model: null, authState: 'none' },
      {
        ...baseDevice,
        id: 2,
        name: 'Mystery box',
        generation: null,
        authState: 'unknown',
        lastProbeError: 'timeout',
      },
    ];
    render(<DevicesTable devices={devices} actions={handlers()} />);

    expect(row(1).getByText('Gen 1')).toBeInTheDocument();
    expect(row(1).getByText('—')).toBeInTheDocument();
    expect(row(1).getByText('No auth')).toBeInTheDocument();
    expect(row(2).getAllByText('Unknown')).toHaveLength(2);
    expect(row(2).getByRole('button', { name: 'Probe failed: timeout' })).toBeInTheDocument();
    expect(row(2).queryByRole('button', { name: /Firmware update available/ })).not.toBeInTheDocument();
  });

  it('marks only the busy row as pending', () => {
    const devices = [baseDevice, { ...baseDevice, id: 8, name: 'Second light' }];
    render(<DevicesTable devices={devices} rowBusyId={7} actions={handlers()} />);

    expect(row(7).getByRole('button', { name: 'View device info' })).toBeDisabled();
    expect(row(8).getByRole('button', { name: 'View device info' })).toBeEnabled();
  });

  it('routes every row action to the matching device', async () => {
    const user = userEvent.setup();
    const actions = handlers();
    vi.mocked(reprobeDevice).mockResolvedValue(baseDevice);
    render(<DevicesTable devices={[baseDevice]} actions={actions} />);

    await user.click(row(7).getByRole('button', { name: 'View device info' }));
    expect(actions.setInfoDevice).toHaveBeenCalledWith(baseDevice);

    const chooseFromMenu = async (name: RegExp) => {
      await user.click(row(7).getByRole('button', { name: 'More actions' }));
      await user.click(await screen.findByRole('menuitem', { name }));
    };
    await chooseFromMenu(/Manage firmware/);
    expect(actions.setFirmwareDevice).toHaveBeenCalledWith(baseDevice);
    await chooseFromMenu(/Set admin password/);
    expect(actions.setAuthDevice).toHaveBeenCalledWith(baseDevice);
    await chooseFromMenu(/Re-probe device/);
    expect(actions.withRowBusy).toHaveBeenCalledWith(7, expect.any(Function));
    expect(reprobeDevice).toHaveBeenCalledWith(7);
    await chooseFromMenu(/Delete device/);
    expect(actions.setDeleteTarget).toHaveBeenCalledWith(baseDevice);
  });
});
