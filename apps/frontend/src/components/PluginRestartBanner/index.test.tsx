import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginSystemStatusDto } from '@attraccess/react-query-client';
import { PluginRestartBanner, PLUGIN_RESTART_STATUS_INTERVAL_MS } from './index';

const hoisted = vi.hoisted(() => ({
  hasPermission: vi.fn((_: string) => true),
  status: undefined as PluginSystemStatusDto | undefined,
  statusOptions: undefined as Record<string, unknown> | undefined,
  refetch: vi.fn(),
  restart: vi.fn(),
  restartServerAndReload: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: hoisted.hasPermission }) }));
vi.mock('../toastProvider', () => ({ useToastMessage: () => ({ error: hoisted.errorToast, success: vi.fn() }) }));
// The wait for the new instance and the reload are tested in utils/serverRestart.test.ts.
vi.mock('../../utils/serverRestart', () => ({ restartServerAndReload: hoisted.restartServerAndReload }));
vi.mock('@attraccess/react-query-client', () => ({
  useGetPluginSystemStatus: (_clientOptions: unknown, _key: unknown, options: Record<string, unknown>) => {
    hoisted.statusOptions = options;
    return { data: options.enabled === false ? undefined : hoisted.status, refetch: hoisted.refetch };
  },
  useRestartPluginSystem: () => ({ mutateAsync: hoisted.restart }),
}));

const pending = (instanceId = 'instance-1'): PluginSystemStatusDto => ({
  disabled: false,
  instanceId,
  restartRequired: true,
});

async function confirmRestart() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Restart now' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/reader connections reconnect/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Restart now' }));
  return dialog;
}

describe('PluginRestartBanner', () => {
  beforeEach(() => {
    hoisted.hasPermission.mockImplementation((permission) => permission === 'system.plugins.manage');
    hoisted.status = pending();
    hoisted.refetch.mockResolvedValue({ data: pending() });
    hoisted.restart.mockResolvedValue({ ok: true });
    // Reads the status, then posts the restart, as the real helper does; waiting and reloading are left out here.
    hoisted.restartServerAndReload.mockImplementation(
      async (getStatus: () => Promise<unknown>, trigger: () => Promise<unknown>) => {
        await getStatus();
        await trigger();
      },
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('tells plugin administrators that plugin changes wait for a restart, without a way to dismiss it', () => {
    render(<PluginRestartBanner />);

    const banner = screen.getByRole('status');
    expect(within(banner).getByText('Restart required')).toBeInTheDocument();
    expect(within(banner).getByText('Plugin changes take effect after Attraccess restarts.')).toBeInTheDocument();
    expect(
      within(banner)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Restart now']);
  });

  it('keeps the status fresh for other admins and tabs', () => {
    render(<PluginRestartBanner />);

    expect(hoisted.statusOptions).toMatchObject({
      enabled: true,
      refetchOnWindowFocus: true,
      refetchInterval: PLUGIN_RESTART_STATUS_INTERVAL_MS,
    });
    expect(PLUGIN_RESTART_STATUS_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it('shows nothing without the plugin management permission, and does not ask for the status', () => {
    hoisted.hasPermission.mockReturnValue(false);

    const { container } = render(<PluginRestartBanner />);

    expect(container).toBeEmptyDOMElement();
    expect(hoisted.statusOptions?.enabled).toBe(false);
  });

  it('shows nothing while no restart is required', () => {
    hoisted.status = { disabled: false, instanceId: 'instance-1', restartRequired: false };

    const { container } = render(<PluginRestartBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('restarts after confirmation through the restart endpoint, reading the instance id from a fresh status', async () => {
    hoisted.refetch.mockResolvedValue({ data: pending('fresh-instance') });
    render(<PluginRestartBanner />);

    await confirmRestart();

    await waitFor(() => expect(hoisted.restart).toHaveBeenCalledWith({}));
    const [getStatus] = hoisted.restartServerAndReload.mock.calls[0];
    await expect(getStatus()).resolves.toMatchObject({ instanceId: 'fresh-instance' });
    expect(hoisted.refetch.mock.invocationCallOrder[0]).toBeLessThan(hoisted.restart.mock.invocationCallOrder[0]);
    expect(hoisted.errorToast).not.toHaveBeenCalled();
  });

  it('shows the restart as pending until the server is back', async () => {
    hoisted.restartServerAndReload.mockReturnValue(new Promise(() => undefined));
    render(<PluginRestartBanner />);

    await confirmRestart();

    await waitFor(() =>
      expect(document.querySelector('[data-cy="plugin-restart-button"]')).toHaveAttribute('data-pending', 'true'),
    );
    expect(screen.getAllByText('Restarting…').length).toBeGreaterThan(0);
  });

  it('reports a refused restart request and lets the admin try again', async () => {
    hoisted.restart.mockRejectedValue(new Error('403'));
    render(<PluginRestartBanner />);

    await confirmRestart();

    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'The restart could not be completed' }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart now' })).toBeEnabled());
  });

  it('does not restart when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    render(<PluginRestartBanner />);

    await user.click(screen.getByRole('button', { name: 'Restart now' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(hoisted.restart).not.toHaveBeenCalled();
  });

  it('reports a restart that does not come back in time and lets the admin try again', async () => {
    hoisted.restartServerAndReload.mockRejectedValue(new Error('Plugin system restart timed out'));
    render(<PluginRestartBanner />);

    await confirmRestart();

    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'The restart could not be completed' }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart now' })).toBeEnabled());
  });
});
