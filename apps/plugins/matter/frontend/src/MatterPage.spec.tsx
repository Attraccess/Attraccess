// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionSettings, ConnectionStatus } from './api';
import { MatterPage } from './MatterPage';
import { STATUS_POLL_MS } from './useMatterPage';

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getStatus: vi.fn(),
  saveSettings: vi.fn(),
  removeSettings: vi.fn(),
}));
vi.mock('./api', () => api);

const entry = {
  wireVersion: 1,
  attraccess: '^1.11.0',
  plugin: '0.3.0-alpha.0',
  sidecar: '0.3.0-alpha.0',
  matterJs: '0.18.0',
};
const baseStatus: ConnectionStatus = {
  state: 'not_configured',
  reason: null,
  reasonDetail: null,
  since: '2026-11-06T10:00:00.000Z',
  lastError: null,
  nextRetryAt: null,
  sidecar: null,
  wireVersion: 1,
  capabilities: null,
  insecureTransport: false,
  supported: [entry],
};
const empty: ConnectionSettings = {
  url: null,
  credentialConfigured: false,
  credentialUpdatedAt: null,
  caCertificate: null,
  updatedAt: null,
};
const configured: ConnectionSettings = {
  url: 'https://matter.example.com',
  credentialConfigured: true,
  credentialUpdatedAt: '2026-11-05T09:00:00.000Z',
  caCertificate: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
  updatedAt: '2026-11-05T09:00:00.000Z',
};

function renderPage(status: Partial<ConnectionStatus>, settings: ConnectionSettings = empty) {
  api.getStatus.mockResolvedValue({ ...baseStatus, ...status });
  api.getSettings.mockResolvedValue(settings);
  return render(
    <MemoryRouter>
      <MatterPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('MatterPage', () => {
  it('shows "Not configured" with the settings form before anything is saved', async () => {
    renderPage({});
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText(/Enter the sidecar URL and token/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sidecar URL/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Token/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove configuration' })).not.toBeInTheDocument();
  });

  it('shows the connected state with the sidecar, matter.js and wire versions', async () => {
    renderPage(
      {
        state: 'connected',
        sidecar: {
          sidecar: '0.3.0-alpha.0',
          matterJs: '0.18.0',
          wireVersion: 1,
          build: { version: '0.3.0-alpha.0+abc' },
        },
      },
      configured,
    );
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('0.3.0-alpha.0')).toBeInTheDocument();
    expect(screen.getByText('0.18.0')).toBeInTheDocument();
  });

  it('never shows the token again: only "configured" and a replace action', async () => {
    const user = userEvent.setup();
    renderPage({ state: 'connected' }, configured);
    expect(await screen.findByText(/Configured \(last changed/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Token/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByLabelText(/^Token/)).toHaveValue('');
  });

  it.each([
    ['unauthorized', 'Unauthorized', /Check the token/i],
    ['unavailable', 'Unavailable', /cannot be reached/],
    ['misconfigured', 'Misconfigured', /CA matches the sidecar certificate/],
  ] as const)('explains a degraded/%s state and what to do about it', async (reason, label, hint) => {
    renderPage(
      {
        state: 'degraded',
        reason,
        nextRetryAt: '2026-11-06T10:01:00.000Z',
        lastError: { code: reason, message: 'It failed.', correlationId: '11111111-1111-4111-8111-111111111111' },
      },
      configured,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.getByText('It failed.')).toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeInTheDocument();
    expect(screen.getByText('Next attempt')).toBeInTheDocument();
  });

  it('shows the received and the supported combination for an incompatible sidecar', async () => {
    renderPage(
      {
        state: 'degraded',
        reason: 'incompatible',
        lastError: {
          code: 'incompatible_release',
          message: 'Not a supported combination.',
          correlationId: null,
          details: {
            received: { attraccess: '1.11.0', plugin: '0.3.0-alpha.0', sidecar: '9.9.9', matterJs: '0.18.0' },
          },
        },
      },
      configured,
    );
    expect(
      await screen.findByText(/Upgrade or downgrade Attraccess, the Matter plugin or the sidecar/),
    ).toBeInTheDocument();
    expect(screen.getByText(/sidecar 9\.9\.9/)).toBeInTheDocument();
    expect(screen.getByText(/sidecar 0\.3\.0-alpha\.0, matter\.js 0\.18\.0/)).toBeInTheDocument();
  });

  it('says to upgrade Attraccess when the host version is unavailable', async () => {
    renderPage({ state: 'degraded', reason: 'incompatible', reasonDetail: 'host version unavailable' }, configured);
    expect(await screen.findByText(/Upgrade Attraccess to 1\.11\.0/)).toBeInTheDocument();
  });

  it('warns about an insecure transport', async () => {
    renderPage({ state: 'connected', insecureTransport: true }, configured);
    expect(await screen.findByText('Insecure connection')).toBeInTheDocument();
  });

  it('saves without sending the token when it was not replaced, then confirms in a dialog', async () => {
    const user = userEvent.setup();
    api.saveSettings.mockResolvedValue(configured);
    renderPage({ state: 'connected' }, configured);
    const url = await screen.findByLabelText(/Sidecar URL/);
    await user.clear(url);
    await user.type(url, 'https://other.example.com/matter');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ url: 'https://other.example.com/matter' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('sends a new token and clears the CA certificate on request', async () => {
    const user = userEvent.setup();
    api.saveSettings.mockResolvedValue(configured);
    renderPage({ state: 'connected' }, configured);
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await user.type(screen.getByLabelText(/^Token/), 'x'.repeat(40));
    await user.click(screen.getByRole('button', { name: 'Clear CA certificate' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        url: 'https://matter.example.com',
        credential: 'x'.repeat(40),
        caCertificate: null,
      }),
    );
  });

  it('shows the saved settings after clearing the CA, so the next save does not upload it again', async () => {
    const user = userEvent.setup();
    const cleared = { ...configured, caCertificate: null, updatedAt: '2026-11-06T10:05:00.000Z' };
    api.saveSettings.mockResolvedValue(cleared);
    renderPage({ state: 'connected' }, configured);
    await user.click(await screen.findByRole('button', { name: 'Clear CA certificate' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    const ca = screen.getByLabelText(/CA certificate/);
    expect(ca).toHaveValue('');
    expect(ca).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Clear CA certificate' })).not.toBeInTheDocument();

    const url = screen.getByLabelText(/Sidecar URL/);
    await user.clear(url);
    await user.type(url, 'https://other.example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(2));
    expect(api.saveSettings).toHaveBeenLastCalledWith({ url: 'https://other.example.com' });
  });

  it('re-enables the CA field when the configuration is removed after clearing the CA', async () => {
    const user = userEvent.setup();
    api.removeSettings.mockResolvedValue(null);
    renderPage({ state: 'connected' }, configured);
    await user.click(await screen.findByRole('button', { name: 'Clear CA certificate' }));
    expect(screen.getByLabelText(/CA certificate/)).toBeDisabled();
    api.getSettings.mockResolvedValue(empty);
    await user.click(screen.getByRole('button', { name: 'Remove configuration' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove configuration' })).not.toBeInTheDocument());
    expect(screen.getByLabelText(/CA certificate/)).toBeEnabled();
    expect(screen.getByLabelText(/CA certificate/)).toHaveValue('');
  });

  it('reports a failed save in an error dialog without echoing the token', async () => {
    const user = userEvent.setup();
    api.saveSettings.mockRejectedValue(
      new Error('credential: The credential must be 32-512 printable ASCII characters.'),
    );
    renderPage({}, empty);
    await user.type(await screen.findByLabelText(/Sidecar URL/), 'http://127.0.0.1:8581');
    await user.type(screen.getByLabelText(/^Token/), 'short-secret-value');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saving failed')).toBeInTheDocument();
    expect(screen.getByText(/32-512 printable ASCII/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('short-secret-value');
  });

  it('asks for confirmation before removing the configuration', async () => {
    const user = userEvent.setup();
    api.removeSettings.mockResolvedValue(null);
    renderPage({ state: 'connected' }, configured);
    await user.click(await screen.findByRole('button', { name: 'Remove configuration' }));
    expect(await screen.findByText('Remove the Matter connection?')).toBeInTheDocument();
    expect(api.removeSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removeSettings).toHaveBeenCalledTimes(1));
  });

  it('polls the status about every five seconds while open and stops when closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderPage({ state: 'connected' }, configured);
    await screen.findByText('Connected');
    const initial = api.getStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 2);
    });
    expect(api.getStatus.mock.calls.length).toBe(initial + 2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 2);
    });
    expect(api.getStatus.mock.calls.length).toBe(initial + 2);
  });
});

describe('MatterPage polling', () => {
  it('skips a poll while the previous status request still hangs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage({ state: 'connected' }, configured);
    await screen.findByText('Connected');
    const initial = api.getStatus.mock.calls.length;
    api.getStatus.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 3);
    });
    expect(api.getStatus.mock.calls.length).toBe(initial + 1);
    // The hung request times out, so polling resumes instead of stopping for good.
    api.getStatus.mockResolvedValue({ ...baseStatus, state: 'connected' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 2);
    });
    expect(api.getStatus.mock.calls.length).toBeGreaterThan(initial + 1);
  });

  it('ignores a late poll answer that arrives after a newer one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.saveSettings.mockResolvedValue(configured);
    renderPage({ state: 'connected' }, configured);
    await screen.findByText('Connected');
    let answerPoll: (status: ConnectionStatus) => void = () => undefined;
    api.getStatus.mockImplementationOnce(() => new Promise((resolve) => (answerPoll = resolve)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS);
    });
    api.getStatus.mockResolvedValue({ ...baseStatus, state: 'connecting' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Connecting')).toBeInTheDocument();
    await act(async () => answerPoll({ ...baseStatus, state: 'degraded', reason: 'unavailable' }));
    expect(screen.getByText('Connecting')).toBeInTheDocument();
    expect(screen.queryByText('Degraded')).not.toBeInTheDocument();
  });
});

describe('MatterPage recovery', () => {
  it('reports a failed settings load even when the status loads', async () => {
    api.getStatus.mockResolvedValue({ ...baseStatus, state: 'connected' });
    api.getSettings.mockRejectedValue(new Error('Failed to fetch'));
    render(
      <MemoryRouter>
        <MatterPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('The connection settings could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText('The status could not be loaded.')).not.toBeInTheDocument();
  });

  it('shows the settings form once the API is back after a failed first load', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getStatus.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(baseStatus);
    api.getSettings.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(configured);
    render(
      <MemoryRouter>
        <MatterPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('The status could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Sidecar URL/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS);
    });
    expect(await screen.findByLabelText(/Sidecar URL/)).toHaveValue('https://matter.example.com');
    expect(screen.queryByText('The status could not be loaded.')).not.toBeInTheDocument();
    expect(screen.queryByText('The connection settings could not be loaded.')).not.toBeInTheDocument();
  });
});

describe('plugin registration', () => {
  beforeEach(() => vi.resetModules());

  it('adds one "Matter" entry to the devices group, guarded by system.plugins.manage', async () => {
    const { default: MatterPlugin } = await import('./plugin');
    const plugin = new MatterPlugin();
    expect(plugin.getSidebarItems()).toEqual([
      expect.objectContaining({ label: 'Matter', path: '/matter', group: 'devices' }),
    ]);
    expect(plugin.getRoutes()).toEqual([
      expect.objectContaining({ path: '/matter', authRequired: 'system.plugins.manage' }),
    ]);
  });
});
