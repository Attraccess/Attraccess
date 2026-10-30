import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapSerialConfiguratorApi } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';

const mocks = vi.hoisted(() => ({
  status: { current: {} as Record<string, unknown> },
  pairingDialog: vi.fn(),
  refreshApiStatus: vi.fn(),
}));

vi.mock('../../../../../api', () => ({ getBaseUrl: () => 'https://server.example.com:8443' }));
vi.mock('../../../pairing/PairingDialog', () => ({
  PairingDialog: (props: unknown) => {
    mocks.pairingDialog(props);
    return null;
  },
}));
vi.mock('../Auth', () => ({
  useAttractapSerialComm: () => ({
    configuration: { apiStatus: mocks.status.current },
    fetchConfiguration: vi.fn(),
    refreshApiStatus: mocks.refreshApiStatus,
    isFetchingConfiguration: false,
    sendAuthedCommand: vi.fn(),
  }),
}));

const onServer = { hostname: 'server.example.com', port: 8443, deviceId: 'dev-1', useSSL: true };

describe('web flasher: waiting for approval', () => {
  beforeEach(() => {
    mocks.pairingDialog.mockClear();
    mocks.refreshApiStatus.mockReset().mockResolvedValue(mocks.status.current);
  });

  it('shows the code and opens the pairing dialog with it for the flasher', async () => {
    mocks.status.current = { ...onServer, status: 'pending_approval', enrollmentCode: 'K7P-3XQ' };
    render(<AttractapSerialConfiguratorApi openDeviceSettings={vi.fn()} />, { wrapper: TestWrapper });

    expect(screen.getByText(/K7P-3XQ/)).toBeInTheDocument();
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: false }));

    await userEvent.click(screen.getByRole('button', { name: /approve|freigeben/i }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true, presetCode: 'K7P-3XQ', via: 'flasher' }),
    );
  });

  it('offers no Approve button once the reader is no longer pending', () => {
    mocks.status.current = { ...onServer, status: 'authenticated' };
    render(<AttractapSerialConfiguratorApi openDeviceSettings={vi.fn()} />, { wrapper: TestWrapper });
    expect(screen.queryByRole('button', { name: /approve|freigeben/i })).toBeNull();
  });
});
