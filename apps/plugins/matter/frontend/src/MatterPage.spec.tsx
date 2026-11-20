// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionSettings, ConnectionStatus } from './api';
import { MatterPage } from './MatterPage';
import { setMatterAuthData } from './permissions';
import { STATUS_POLL_MS } from './useMatterPage';

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getStatus: vi.fn(),
  saveSettings: vi.fn(),
  removeSettings: vi.fn(),
}));
vi.mock('./api', () => api);
// The fabric & backup section has its own spec (fabric-backup/FabricBackupSection.spec.tsx).
vi.mock('./fabric-backup/FabricBackupSection', () => ({
  FabricBackupSection: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="fabric-section-stub">{canManage ? 'manage' : 'read'}</div>
  ),
}));

// HeroUI's spinner has no accessible role.
const spinner = () => document.querySelector('[data-slot="spinner"]');

const signIn = (...effectivePermissions: string[]) =>
  act(() => setMatterAuthData({ authToken: '', user: {} as never, effectivePermissions }));

const entry = {
  wireVersion: 1,
  attraccess: '^2.0.0',
  plugin: '0.5.0-alpha.0',
  sidecar: '0.5.0-alpha.0',
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

beforeEach(() => signIn('matter.devices.read', 'matter.devices.manage'));

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
          sidecar: '0.5.0-alpha.0',
          matterJs: '0.18.0',
          wireVersion: 1,
          build: { version: '0.5.0-alpha.0+abc' },
        },
      },
      configured,
    );
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('0.5.0-alpha.0')).toBeInTheDocument();
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
            received: { attraccess: '2.0.0', plugin: '0.5.0-alpha.0', sidecar: '9.9.9', matterJs: '0.18.0' },
          },
        },
      },
      configured,
    );
    expect(
      await screen.findByText(/Upgrade or downgrade Attraccess, the Matter plugin or the sidecar/),
    ).toBeInTheDocument();
    expect(screen.getByText(/sidecar 9\.9\.9/)).toBeInTheDocument();
    expect(screen.getByText(/sidecar 0\.5\.0-alpha\.0, matter\.js 0\.18\.0/)).toBeInTheDocument();
  });

  it('says to upgrade Attraccess when the host version is unavailable', async () => {
    renderPage({ state: 'degraded', reason: 'incompatible', reasonDetail: 'host version unavailable' }, configured);
    expect(await screen.findByText(/Upgrade Attraccess to 2\.0\.0/)).toBeInTheDocument();
  });

  it('warns about an insecure transport', async () => {
    renderPage({ state: 'connected', insecureTransport: true }, configured);
    expect(await screen.findByText('Insecure connection')).toBeInTheDocument();
  });

  it('saves without sending the token when the URL and CA stay the same, then confirms in a dialog', async () => {
    const user = userEvent.setup();
    api.saveSettings.mockResolvedValue(configured);
    renderPage({ state: 'connected' }, configured);
    const url = await screen.findByLabelText(/Sidecar URL/);
    // Another spelling of the same URL is no change.
    await user.type(url, '/');
    expect(screen.queryByLabelText(/^Token/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ url: 'https://matter.example.com/' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it.each([
    [
      'URL',
      async (user: ReturnType<typeof userEvent.setup>) => {
        const url = screen.getByLabelText(/Sidecar URL/);
        await user.clear(url);
        await user.type(url, 'https://other.example.com/matter');
      },
      { url: 'https://other.example.com/matter' },
    ],
    [
      'CA certificate',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Clear CA certificate' }));
      },
      { url: 'https://matter.example.com', caCertificate: null },
    ],
  ] as const)('asks for the token again when the %s changes', async (_field, change, sent) => {
    const user = userEvent.setup();
    api.saveSettings.mockResolvedValue(configured);
    renderPage({ state: 'connected' }, configured);
    await screen.findByLabelText(/Sidecar URL/);
    await change(user);
    const token = screen.getByLabelText(/^Token/);
    expect(screen.getByText(/enter the token again/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep current token' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(token, 'x'.repeat(40));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ ...sent, credential: 'x'.repeat(40) }));
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
    await user.type(screen.getByLabelText(/^Token/), 'x'.repeat(40));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    const ca = screen.getByLabelText(/CA certificate/);
    expect(ca).toHaveValue('');
    expect(ca).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Clear CA certificate' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Token/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(2));
    expect(api.saveSettings).toHaveBeenLastCalledWith({ url: 'https://matter.example.com' });
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
    // The tick at 1x starts the hung request and the tick at 2x is skipped. Stop halfway to the request's timeout
    // at 3x, which falls due together with a tick, so the result does not depend on timer ordering.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 2.5);
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

describe('MatterPage permissions', () => {
  it('shows the status only to a matter.devices.read user and never asks for the settings', async () => {
    signIn('matter.devices.read');
    renderPage({ state: 'connected' }, configured);
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByTestId('fabric-section-stub')).toHaveTextContent('read');
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Sidecar URL/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the settings form and the manage actions with matter.devices.manage', async () => {
    renderPage({ state: 'connected' }, configured);
    expect(await screen.findByLabelText(/Sidecar URL/)).toHaveValue('https://matter.example.com');
    expect(screen.getByTestId('fabric-section-stub')).toHaveTextContent('manage');
  });

  it('requests nothing Matter-specific for a Thread-only user', async () => {
    signIn('thread.network.read');
    renderPage({ state: 'connected' }, configured);
    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('fabric-section-stub')).not.toBeInTheDocument();
    expect(screen.getByText('Matter devices are hidden')).toBeInTheDocument();
  });

  it('keeps loading, without requests or the "hidden" notice, until the host has pushed the auth state', async () => {
    act(() => setMatterAuthData(null));
    renderPage({ state: 'connected' }, configured);
    expect(spinner()).toBeInTheDocument();
    expect(screen.queryByText('Matter devices are hidden')).not.toBeInTheDocument();
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(api.getSettings).not.toHaveBeenCalled();
    signIn('matter.devices.read');
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(spinner()).not.toBeInTheDocument();
    expect(screen.queryByText('Matter devices are hidden')).not.toBeInTheDocument();
  });

  it('shows the spinner again when the permissions grow after a run that requested nothing', async () => {
    signIn('thread.network.read');
    renderPage({ state: 'connected' }, configured);
    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
    let answer: (status: ConnectionStatus) => void = () => undefined;
    api.getStatus.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    signIn('matter.devices.read');
    expect(spinner()).toBeInTheDocument();
    await act(async () => answer({ ...baseStatus, state: 'connected' }));
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(spinner()).not.toBeInTheDocument();
  });

  it('shows no manage controls, and requests nothing, for matter.devices.manage without read', async () => {
    signIn('matter.devices.manage');
    renderPage({ state: 'connected' }, configured);
    expect(await screen.findByText('Matter devices are hidden')).toBeInTheDocument();
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('fabric-section-stub')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sidecar URL/)).not.toBeInTheDocument();
  });

  it.each([
    [['thread.network.read'], 0],
    [['matter.devices.read'], 1],
  ] as const)('never sends a request that would be refused while polling (%j)', async (keys, statusPerTick) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn(...keys);
    renderPage({ state: 'connected' }, configured);
    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
    const initial = api.getStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 4);
    });
    expect(api.getStatus.mock.calls.length).toBe(initial + 4 * statusPerTick);
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable', null],
    ['misconfigured', null],
    ['incompatible', null],
    ['incompatible', 'host version unavailable'],
  ] as const)('tells a read-only user to ask an administrator (degraded/%s, %s)', async (reason, reasonDetail) => {
    signIn('matter.devices.read');
    renderPage({ state: 'degraded', reason, reasonDetail, insecureTransport: true }, configured);
    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="matter-hint"]')).toHaveTextContent(/ask an administrator/i);
    expect(document.querySelector('[data-cy="matter-insecure-warning"]')).toHaveTextContent(
      /Ask an administrator to check the connection settings/,
    );
    expect(document.body.textContent).not.toMatch(
      /Check that it is running|Check the URL and path prefix|Upgrade or downgrade Attraccess|Upgrade Attraccess to|Use https/,
    );
  });

  it('tells a read-only user that an administrator sets up the connection', async () => {
    signIn('matter.devices.read');
    renderPage({});
    expect(await screen.findByText(/An administrator needs to connect it/)).toBeInTheDocument();
    expect(screen.queryByText(/Enter the sidecar URL and token below/)).not.toBeInTheDocument();
    expect(screen.queryByText('Matter devices are hidden')).not.toBeInTheDocument();
  });
});

describe('plugin registration', () => {
  beforeEach(() => vi.resetModules());

  it('adds one "Matter" entry to the devices group, opened by any Matter or Thread read key', async () => {
    const { default: MatterPlugin } = await import('./plugin');
    const plugin = new MatterPlugin();
    expect(plugin.getSidebarItems()).toEqual([
      expect.objectContaining({ label: 'Matter', path: '/matter', group: 'devices' }),
    ]);
    expect(plugin.getRoutes()).toEqual([
      expect.objectContaining({ path: '/matter', authRequired: ['matter.devices.read', 'thread.network.read'] }),
    ]);
  });

  it('passes the host auth state on to the page', async () => {
    const { default: MatterPlugin } = await import('./plugin');
    const permissions = await import('./permissions');
    const spy = vi.spyOn(permissions, 'setMatterAuthData');
    const auth = { authToken: '', user: {} as never, effectivePermissions: ['matter.devices.read'] };
    new MatterPlugin().onApiAuthStateChange(auth);
    expect(spy).toHaveBeenCalledWith(auth);
  });
});
