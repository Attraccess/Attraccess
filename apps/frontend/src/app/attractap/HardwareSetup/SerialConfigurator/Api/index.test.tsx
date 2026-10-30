import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapSerialConfiguratorApi } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';

const approve = vi.hoisted(() => vi.fn());
const reader = vi.hoisted(() => ({
  apiStatus: {
    status: 'disconnected',
    hostname: 'old.example.com',
    port: 80,
    deviceId: 'dev-1',
    useSSL: false,
  } as { status: string; hostname: string; port: number; deviceId: string; useSSL: boolean; enrollmentCode?: string },
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useDeviceEnrollmentServiceApproveDeviceEnrollment: () => ({ mutate: approve, isPending: false }),
}));

const sendAuthedCommand = vi.fn().mockResolvedValue({});
const fetchConfiguration = vi.fn().mockResolvedValue(undefined);

// The browser is currently talking to this server. "Apply current server" must
// push exactly these values to the reader.
vi.mock('../../../../../api', () => ({
  getBaseUrl: () => 'https://server.example.com:8443',
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => {
      const translations: Record<string, string> = {
        title: 'API',
        'actions.refreshStatus': 'Refresh status',
        'status.disconnected.title': 'API disconnected',
        'status.disconnected.description': 'disconnected',
        'apiDataDoesNotMatchesServer.alert.title': 'Server settings out of date',
        'apiDataDoesNotMatchesServer.alert.description': 'mismatch',
        'apiDataDoesNotMatchesServer.alert.button': 'Apply current server',
        'manual.title': 'Manual server settings',
      };
      const t = (key: string, vars?: Record<string, unknown>) => {
        let value = translations[key] ?? key;
        if (vars) {
          Object.entries(vars).forEach(([k, v]) => {
            value = value.replace(`{{${k}}}`, String(v));
          });
        }
        return value;
      };
      return { t, tExists: (key: string) => Boolean(translations[key]) };
    },
  }))()),
}));

// Reader currently points at a DIFFERENT server than the browser -> mismatch.
vi.mock('../Auth', () => ({
  useAttractapSerialComm: () => ({
    configuration: {
      apiStatus: reader.apiStatus,
    },
    fetchConfiguration,
    isFetchingConfiguration: false,
    sendAuthedCommand,
  }),
}));

function renderApi() {
  return render(<AttractapSerialConfiguratorApi openDeviceSettings={vi.fn()} />, { wrapper: TestWrapper });
}

describe('AttractapSerialConfiguratorApi', () => {
  beforeEach(() => {
    sendAuthedCommand.mockClear();
    fetchConfiguration.mockClear();
    approve.mockClear();
    reader.apiStatus = {
      status: 'disconnected',
      hostname: 'old.example.com',
      port: 80,
      deviceId: 'dev-1',
      useSSL: false,
    };
  });

  it('applies the current browser server (not an empty payload) when pressing apply', async () => {
    const user = userEvent.setup();
    renderApi();

    await user.click(screen.getByRole('button', { name: 'Apply current server' }));

    expect(sendAuthedCommand).toHaveBeenCalledWith('api.configuration.set', {
      hostname: 'server.example.com',
      port: 8443,
      useSSL: true,
    });
  });

  it('approves the code a waiting reader shows, and offers no button otherwise', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApi();
    expect(screen.queryByRole('button', { name: 'status.pending_approval.approve' })).not.toBeInTheDocument();
    unmount();

    reader.apiStatus = {
      status: 'pending_approval',
      hostname: 'server.example.com',
      port: 8443,
      deviceId: 'dev-1',
      useSSL: true,
      enrollmentCode: 'K7P-3XQ',
    };
    renderApi();
    await user.click(screen.getByRole('button', { name: 'status.pending_approval.approve' }));

    expect(approve).toHaveBeenCalledWith({ requestBody: { code: 'K7P-3XQ' } });
  });
});
