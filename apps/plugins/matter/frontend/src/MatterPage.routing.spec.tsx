// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredSettings, node, reconciliation, status } from './test-utils/fixtures';
import { ALL_KEYS, renderMatter, signIn } from './test-utils/renderMatter';

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getStatus: vi.fn(),
  saveSettings: vi.fn(),
  removeSettings: vi.fn(),
  reconnect: vi.fn(),
}));
const devices = vi.hoisted(() => ({
  listNodes: vi.fn(),
  getNode: vi.fn(),
  getEndpointState: vi.fn(),
  getReconciliation: vi.fn(),
  runReconciliation: vi.fn(),
  updateNode: vi.fn(),
  updateEndpoint: vi.fn(),
  claimNode: vi.fn(),
  repairNode: vi.fn(),
  relinkNode: vi.fn(),
  archiveNode: vi.fn(),
  restoreNode: vi.fn(),
  forceRemoveNode: vi.fn(),
}));
const fabric = vi.hoisted(() => ({ getFabricStatus: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({ ...(await original<typeof import('./devices/api')>()), ...devices }));
vi.mock('./fabric-backup/api', () => fabric);
vi.mock('./fabric-backup/FabricBackupSection', () => ({
  FabricBackupSection: () => <div data-cy="fabric-section-stub" />,
}));

// The page marks its parts with `data-cy`, like the rest of Attraccess.
configure({ testIdAttribute: 'data-cy' });

const where = () => screen.getByTestId('location').textContent;
const navigation = () => screen.getByTestId('location').getAttribute('data-navigation');
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

beforeEach(() => {
  api.getStatus.mockResolvedValue(status());
  api.getSettings.mockResolvedValue(configuredSettings);
  devices.listNodes.mockResolvedValue([]);
  devices.getReconciliation.mockResolvedValue(reconciliation());
  fabric.getFabricStatus.mockRejectedValue(new Error('not needed'));
  signIn(...ALL_KEYS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('tabs and permissions', () => {
  it('shows all six tabs, in order, to a user with every permission', async () => {
    renderMatter('/matter/devices');
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(tabNames()).toEqual([
      'Devices',
      'Infrastructure',
      'Thread Network',
      'Commissioning',
      'Health',
      'Software Updates',
    ]);
  });

  it.each([
    [['matter.devices.read'], ['Devices', 'Infrastructure', 'Health', 'Software Updates']],
    [
      ['matter.devices.read', 'matter.devices.manage'],
      ['Devices', 'Infrastructure', 'Health', 'Software Updates'],
    ],
    [['thread.network.read'], ['Thread Network', 'Health']],
    [['matter.devices.commission'], ['Commissioning']],
    [
      ['matter.devices.read', 'matter.devices.commission'],
      ['Devices', 'Infrastructure', 'Commissioning', 'Health', 'Software Updates'],
    ],
    [
      ['matter.devices.read', 'thread.network.read'],
      ['Devices', 'Infrastructure', 'Thread Network', 'Health', 'Software Updates'],
    ],
  ])('offers exactly the tabs %j allow', async (keys, expected) => {
    signIn(...keys);
    renderMatter('/matter/health');
    await screen.findByRole('tablist');
    expect(tabNames()).toEqual(expected);
  });

  it('shows a no-access notice, and no tab, to a user whose keys open nothing', async () => {
    signIn('matter.devices.manage');
    renderMatter('/matter');
    expect(await screen.findByText('Matter devices are hidden')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(devices.listNodes).not.toHaveBeenCalled();
  });

  it('only loads, with no notice and no request, until the host has pushed the auth state', async () => {
    const { setMatterAuthData } = await import('./permissions');
    act(() => setMatterAuthData(null));
    renderMatter('/matter/devices');
    expect(screen.getByTestId('matter-page-loading')).toBeInTheDocument();
    expect(screen.queryByText('Matter devices are hidden')).not.toBeInTheDocument();
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(devices.listNodes).not.toHaveBeenCalled();
    signIn('matter.devices.read');
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(screen.queryByTestId('matter-page-loading')).not.toBeInTheDocument();
  });

  it('never requests what the permissions would get a 403 for', async () => {
    signIn('thread.network.read');
    renderMatter('/matter/health');
    await screen.findByTestId('matter-health-thread');
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(devices.listNodes).not.toHaveBeenCalled();
    expect(devices.getReconciliation).not.toHaveBeenCalled();
    expect(fabric.getFabricStatus).not.toHaveBeenCalled();
    // The Matter cards are not rendered for a Thread-only user.
    expect(screen.queryByTestId('matter-health-connection')).not.toBeInTheDocument();
  });

  it('loads settings only for managers', async () => {
    signIn('matter.devices.read');
    renderMatter('/matter/infrastructure');
    await screen.findByTestId('matter-infrastructure-tab');
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Sidecar URL/)).not.toBeInTheDocument();
  });
});

describe('no request a role would get a 403 for, on any route', () => {
  // What each request needs, as MATTER_OPERATIONS (backend/permissions.ts) says: status, nodes, endpoint state,
  // reconciliation, fabric and both live topics need matter.devices.read; the settings need matter.devices.manage.
  const READ = 'matter.devices.read';
  const MANAGE = 'matter.devices.manage';
  const needsRead = () => ({
    getStatus: api.getStatus,
    listNodes: devices.listNodes,
    getNode: devices.getNode,
    getEndpointState: devices.getEndpointState,
    getReconciliation: devices.getReconciliation,
    getFabricStatus: fabric.getFabricStatus,
  });
  const ROLES: Record<string, string[]> = {
    read: [READ],
    'read+manage': [READ, MANAGE],
    thread: ['thread.network.read'],
    commission: ['matter.devices.commission'],
    'commission+thread': ['matter.devices.commission', 'thread.network.read'],
    'manage only': [MANAGE],
  };
  const ROUTES = [
    '/matter',
    '/matter/devices',
    '/matter/devices/node-1',
    '/matter/infrastructure',
    '/matter/thread',
    '/matter/commissioning',
    '/matter/health',
    '/matter/updates',
  ];

  it.each(Object.keys(ROLES).flatMap((role) => ROUTES.map((route) => [role, route] as const)))(
    '%s on %s',
    async (role, route) => {
      const keys = ROLES[role];
      devices.getNode.mockResolvedValue({ ...node('node-1'), fabric: null, endpoints: [] });
      signIn(...keys);
      const { live } = renderMatter(route);
      await waitFor(() => expect(screen.queryByTestId('matter-page-loading')).not.toBeInTheDocument());
      // Let the tab's first requests and subscriptions start.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
      const topics = live.subscribed.map((entry) => entry.topic.split(':').pop());
      if (!keys.includes(READ)) {
        for (const [name, request] of Object.entries(needsRead())) {
          expect(request, `${name} needs ${READ}`).not.toHaveBeenCalled();
        }
        expect(topics).not.toContain('devices');
        expect(topics).not.toContain('device-state');
      }
      if (!(keys.includes(READ) && keys.includes(MANAGE))) expect(api.getSettings).not.toHaveBeenCalled();
    },
  );
});

describe('routes, deep links and history', () => {
  it.each([
    [['matter.devices.read'], '/matter/devices'],
    [['thread.network.read'], '/matter/thread'],
    [['matter.devices.commission', 'thread.network.read'], '/matter/thread'],
  ])('redirects /matter for %j to %s', async (keys, expected) => {
    signIn(...keys);
    renderMatter('/matter');
    await waitFor(() => expect(where()).toBe(expected));
  });

  it.each([
    ['/matter/devices', 'matter-tab-devices'],
    ['/matter/infrastructure', 'matter-tab-infrastructure'],
    ['/matter/thread', 'matter-tab-thread'],
    ['/matter/commissioning', 'matter-tab-commissioning'],
    ['/matter/health', 'matter-tab-health'],
    ['/matter/updates', 'matter-tab-updates'],
  ])('opens the right tab for the deep link %s', async (path, testId) => {
    renderMatter(path);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(where()).toBe(path);
  });

  it('keeps the Devices tab selected on a device detail deep link', async () => {
    devices.getNode.mockResolvedValue({ ...node('node-1'), fabric: null, endpoints: [] });
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-device-detail')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Devices' })).toHaveAttribute('aria-selected', 'true');
    expect(devices.getNode).toHaveBeenCalledWith('node-1');
  });

  it('falls back to the first allowed tab, replacing the entry, for a tab the user may not see', async () => {
    signIn('matter.devices.read');
    const { back } = renderMatter('/matter/thread', { before: '/elsewhere' });
    await waitFor(() => expect(where()).toBe('/matter/devices'));
    expect(screen.getByTestId('matter-tab-devices')).toBeInTheDocument();
    expect(navigation()).toBe('REPLACE');
    // The forbidden URL is gone from the history: back leaves the page instead of redirecting again.
    back();
    await waitFor(() => expect(where()).toBe('/elsewhere'));
  });

  it('replaces /matter with the first tab, so back does not return to /matter', async () => {
    const { back } = renderMatter('/matter', { before: '/elsewhere' });
    await waitFor(() => expect(where()).toBe('/matter/devices'));
    expect(navigation()).toBe('REPLACE');
    back();
    await waitFor(() => expect(where()).toBe('/elsewhere'));
  });

  it('pushes a history entry per tab switch, so back and forward work', async () => {
    const user = userEvent.setup();
    const { back } = renderMatter('/matter/devices');
    await user.click(await screen.findByRole('tab', { name: 'Health' }));
    expect(where()).toBe('/matter/health');
    expect(navigation()).toBe('PUSH');
    await user.click(screen.getByRole('tab', { name: 'Software Updates' }));
    expect(where()).toBe('/matter/updates');
    expect(navigation()).toBe('PUSH');
    back();
    await waitFor(() => expect(where()).toBe('/matter/health'));
    expect(screen.getByRole('tab', { name: 'Health' })).toHaveAttribute('aria-selected', 'true');
    back();
    await waitFor(() => expect(where()).toBe('/matter/devices'));
    expect(await screen.findByTestId('matter-tab-devices')).toBeInTheDocument();
  });

  it('marks the tab of the URL as selected', async () => {
    renderMatter('/matter/updates');
    expect(await screen.findByRole('tab', { name: 'Software Updates' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Devices' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('responsive navigation', () => {
  it('renders both the tab list (from sm) and the picker (below sm) and the picker navigates', async () => {
    const user = userEvent.setup();
    renderMatter('/matter/devices');
    await screen.findByRole('tablist');
    const picker = document.querySelector('[data-cy="matter-tabs-mobile-picker"]') as HTMLElement;
    expect(picker).toBeInTheDocument();
    // The picker lives in the block that is hidden from `sm` up; the tabs in the one hidden below it.
    expect(picker.closest('.sm\\:hidden')).not.toBeNull();
    expect(screen.getByRole('tablist').closest('.hidden.sm\\:block')).not.toBeNull();
    await user.click(within(picker).getByRole('button'));
    await user.click(await screen.findByRole('option', { name: 'Health' }));
    expect(where()).toBe('/matter/health');
  });

  it('lists only the visible tabs in the picker', async () => {
    const user = userEvent.setup();
    signIn('thread.network.read');
    renderMatter('/matter/thread');
    const picker = (await screen.findByRole('tablist')).ownerDocument.querySelector(
      '[data-cy="matter-tabs-mobile-picker"]',
    ) as HTMLElement;
    await user.click(within(picker).getByRole('button'));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Thread Network', 'Health']);
  });
});

describe('the degraded banner', () => {
  it.each([
    ['unavailable', 'Matter sidecar unreachable'],
    ['unauthorized', 'Matter sidecar rejected the token'],
    ['incompatible', 'Matter sidecar is incompatible'],
    ['misconfigured', 'Matter connection is misconfigured'],
  ] as const)('explains %s on every tab and links to Infrastructure', async (reason, title) => {
    const user = userEvent.setup();
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason, nextRetryAt: '2026-11-06T10:01:00.000Z' }));
    renderMatter('/matter/devices');
    const banner = await screen.findByTestId('matter-banners');
    expect(within(banner).getByText(title)).toBeInTheDocument();
    expect(within(banner).getByText(/Next attempt/)).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Open Infrastructure' }));
    expect(where()).toBe('/matter/infrastructure');
    // On Infrastructure it does not link to itself.
    expect(screen.queryByRole('button', { name: 'Open Infrastructure' })).not.toBeInTheDocument();
  });

  it('says the sidecar is not set up, and has no retry, when nothing is configured', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'not_configured', sidecar: null, capabilities: null }));
    renderMatter('/matter/health');
    expect(within(await screen.findByTestId('matter-banners')).getByText('Matter is not set up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
  });

  it('shows the insecure transport warning on every tab', async () => {
    api.getStatus.mockResolvedValue(status({ insecureTransport: true }));
    renderMatter('/matter/updates');
    expect(await screen.findByText('Insecure connection')).toBeInTheDocument();
  });

  it('says nothing while the sidecar is connected', async () => {
    renderMatter('/matter/devices');
    await screen.findByTestId('matter-tab-devices');
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('matter-degraded-banner')).not.toBeInTheDocument();
  });

  it('keeps the rest of the page usable while the sidecar is down', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable' }));
    devices.listNodes.mockResolvedValue([
      node('node-1', { metadata: { displayName: 'Lamp', description: null, location: null } }),
    ]);
    renderMatter('/matter/devices');
    expect(await screen.findByText('Lamp')).toBeInTheDocument();
    expect(await screen.findByText('Matter sidecar unreachable')).toBeInTheDocument();
  });

  it('retries now for managers and shows the answer', async () => {
    const user = userEvent.setup();
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable' }));
    api.reconnect.mockResolvedValue(status());
    renderMatter('/matter/devices');
    await user.click(await screen.findByRole('button', { name: 'Retry now' }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('matter-degraded-banner')).not.toBeInTheDocument());
  });

  it('reports a failed retry', async () => {
    const user = userEvent.setup();
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable' }));
    api.reconnect.mockRejectedValue(new Error('Request failed (HTTP 500).'));
    renderMatter('/matter/devices');
    await user.click(await screen.findByRole('button', { name: 'Retry now' }));
    expect(await screen.findByText(/Retrying failed: Request failed \(HTTP 500\)\./)).toBeInTheDocument();
  });

  it('offers a read-only user no retry', async () => {
    signIn('matter.devices.read');
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable' }));
    renderMatter('/matter/devices');
    expect(await screen.findByText('Matter sidecar unreachable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
    expect(screen.getByText(/ask an administrator/i)).toBeInTheDocument();
  });

  it('says the connection is being set up while the sidecar is connecting', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'connecting' }));
    renderMatter('/matter/devices');
    const banner = await screen.findByTestId('matter-degraded-banner');
    expect(banner).toHaveTextContent(/Connecting since/);
  });

  it('shows no banner, but the error where the status is shown, when the status cannot be loaded', async () => {
    api.getStatus.mockRejectedValue(new Error('Request failed (HTTP 503).'));
    renderMatter('/matter/devices');
    await screen.findByTestId('matter-tab-devices');
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('matter-banners')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Health' }));
    expect(await screen.findByTestId('matter-health-connection-error')).toHaveTextContent('HTTP 503');
    expect(screen.getByTestId('matter-health-connection-fix')).toBeInTheDocument();
  });
});

describe('Health with Matter and Thread read', () => {
  it('shows the Matter cards and the Thread card together', async () => {
    signIn('matter.devices.read', 'thread.network.read');
    renderMatter('/matter/health');
    expect(await screen.findByTestId('matter-health-connection')).toBeInTheDocument();
    expect(screen.getByTestId('matter-health-fabric')).toBeInTheDocument();
    expect(screen.getByTestId('matter-health-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('matter-health-thread')).toBeInTheDocument();
  });
});
