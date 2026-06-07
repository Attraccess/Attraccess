import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapSerialConfiguratorApi } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';

const sendAuthedCommand = vi.fn().mockResolvedValue({});
const fetchConfiguration = vi.fn().mockResolvedValue(undefined);

// The browser is currently talking to this server. "Apply current server" must
// push exactly these values to the reader.
vi.mock('../../../../../api', () => ({
  getBaseUrl: () => 'https://server.example.com:8443',
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
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
}));

// Reader currently points at a DIFFERENT server than the browser -> mismatch.
vi.mock('../Auth', () => ({
  useAttractapSerialComm: () => ({
    configuration: {
      apiStatus: {
        status: 'disconnected',
        hostname: 'old.example.com',
        port: 80,
        deviceId: 'dev-1',
        useSSL: false,
      },
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
});
