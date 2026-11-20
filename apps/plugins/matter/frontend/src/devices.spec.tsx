// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_FALLBACK_POLL_MS } from './useMatterLive';
import { detail, endpoint, node, stateEntry, status } from './test-utils/fixtures';
import { renderMatter, signIn, ALL_KEYS } from './test-utils/renderMatter';

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
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({ ...(await original<typeof import('./devices/api')>()), ...devices }));
vi.mock('./fabric-backup/api', () => ({ getFabricStatus: vi.fn() }));
vi.mock('./fabric-backup/FabricBackupSection', () => ({ FabricBackupSection: () => null }));

configure({ testIdAttribute: 'data-cy' });

const NEVER_RUN = {
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
  lastSummary: null,
  sidecarFabricId: null,
  events: {},
};
const buttons = (scope: HTMLElement) =>
  within(scope)
    .queryAllByRole('button')
    .map((button) => button.textContent);

beforeEach(() => {
  signIn(...ALL_KEYS);
  api.getStatus.mockResolvedValue(status());
  api.getSettings.mockResolvedValue(null);
  devices.listNodes.mockResolvedValue([]);
  devices.getReconciliation.mockResolvedValue(NEVER_RUN);
  devices.getEndpointState.mockResolvedValue({ endpointRef: 'endpoint-1', states: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('the device list', () => {
  const nodes = [
    node('node-1', { metadata: { displayName: 'Workshop lamp', description: null, location: null } }),
    node('node-2', { lifecycleState: 'unclaimed', reachable: null }),
    node('node-3', {
      lifecycleState: 'detached',
      detachedReason: 'absent_from_sidecar',
      reachable: false,
      identity: { ...node('node-3').identity, productName: null },
    }),
  ];

  it('lists unclaimed and detached devices first, with distinct chips, and name fallbacks', async () => {
    devices.listNodes.mockResolvedValue(nodes);
    renderMatter('/matter/devices');
    await screen.findByText('Workshop lamp');
    const cards = screen.getAllByTestId(/matter-node-(unclaimed|detached|claimed)/);
    expect(cards.map((card) => card.getAttribute('data-cy'))).toEqual([
      'matter-node-unclaimed',
      'matter-node-detached',
      'matter-node-claimed',
    ]);
    // Product name and node ID; the node ID alone when there is no product name.
    expect(within(cards[0]).getByText('Plug (2)')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Node 3')).toBeInTheDocument();
    expect(within(cards[0]).getByTestId('matter-lifecycle-unclaimed')).toHaveTextContent('Unclaimed');
    expect(within(cards[1]).getByTestId('matter-lifecycle-detached')).toHaveTextContent('Detached');
    expect(within(cards[2]).getByTestId('matter-lifecycle-claimed')).toHaveTextContent('Claimed');
  });

  it('shows vendor/product, software with hardware, endpoints, reachability and last seen', async () => {
    devices.listNodes.mockResolvedValue([nodes[0]]);
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-node-claimed');
    expect(within(card).getByText('Acme / Plug')).toBeInTheDocument();
    expect(within(card).getByTestId('matter-node-software')).toHaveTextContent('1.0.3');
    expect(within(card).getByTestId('matter-node-software')).toHaveTextContent('hardware 2');
    expect(within(card).getByText('2')).toBeInTheDocument();
    expect(within(card).getByTestId('matter-reachability-reachable')).toHaveTextContent('Reachable');
    expect(within(card).getByText('Last seen')).toBeInTheDocument();
  });

  it('falls back to the numeric software version', async () => {
    devices.listNodes.mockResolvedValue([
      node('node-1', { identity: { ...node('node-1').identity, softwareVersionString: null, softwareVersion: 7 } }),
    ]);
    renderMatter('/matter/devices');
    expect(await screen.findByTestId('matter-node-software')).toHaveTextContent('7');
  });

  it('explains an unclaimed device and offers only what resolves it', async () => {
    devices.listNodes.mockResolvedValue([nodes[1]]);
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-node-unclaimed');
    expect(within(card).getByTestId('matter-callout-unclaimed')).toHaveTextContent(
      /cannot be used in flows until an administrator claims it/,
    );
    expect(buttons(card)).toEqual(['Claim', 'Archive', 'Force remove', 'Details']);
  });

  it('explains a detached device, with the reason, and offers only what resolves it', async () => {
    devices.listNodes.mockResolvedValue([nodes[2]]);
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-node-detached');
    expect(within(card).getByTestId('matter-callout-detached')).toHaveTextContent(/The sidecar no longer lists it/);
    expect(buttons(card)).toEqual(['Repair', 'Relink', 'Archive', 'Force remove', 'Details']);
  });

  it('puts no lifecycle action on a claimed device in the list and offers no command anywhere', async () => {
    devices.listNodes.mockResolvedValue(nodes);
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-node-claimed');
    expect(buttons(card)).toEqual(['Details']);
    expect(
      screen.queryByRole('button', { name: /turn on|turn off|toggle|send|lock|unlock|command/i }),
    ).not.toBeInTheDocument();
  });

  it('shows read-only users no lifecycle action at all', async () => {
    signIn('matter.devices.read');
    devices.listNodes.mockResolvedValue(nodes);
    renderMatter('/matter/devices');
    await screen.findByText('Workshop lamp');
    for (const card of screen.getAllByTestId(/^matter-node-(unclaimed|detached|claimed)$/))
      expect(buttons(card)).toEqual(['Details']);
    expect(screen.queryByRole('button', { name: 'Run reconciliation now' })).not.toBeInTheDocument();
  });

  it('filters by lifecycle state and includes archived and removed devices on request', async () => {
    const user = userEvent.setup();
    const archived = node('node-4', {
      lifecycleState: 'archived',
      metadata: { displayName: 'Old plug', description: null, location: null },
    });
    devices.listNodes.mockImplementation(async (includeInactive: boolean) =>
      includeInactive ? [...nodes, archived] : nodes,
    );
    renderMatter('/matter/devices');
    await screen.findByText('Workshop lamp');
    expect(devices.listNodes).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Old plug')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Include archived and removed/ }));
    expect(await screen.findByText('Old plug')).toBeInTheDocument();
    expect(devices.listNodes).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: /All active/ }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await waitFor(() => expect(screen.queryByText('Workshop lamp')).not.toBeInTheDocument());
    expect(screen.getByText('Old plug')).toBeInTheDocument();
  });

  it('has loading, empty and error states of its own, and the rest of the page stays', async () => {
    let fail: (error: Error) => void = () => undefined;
    devices.listNodes.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    renderMatter('/matter/devices');
    expect(await screen.findByTestId('matter-devices-loading')).toBeInTheDocument();
    await act(async () => fail(new Error('boom')));
    expect(await screen.findByTestId('matter-devices-error')).toHaveTextContent('boom');
    expect(screen.getByTestId('matter-reconciliation')).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows an empty state without devices', async () => {
    renderMatter('/matter/devices');
    expect(await screen.findByTestId('matter-devices-empty')).toHaveTextContent('No devices match.');
  });
});

describe('lifecycle actions', () => {
  beforeEach(() => {
    devices.listNodes.mockResolvedValue([
      node('node-2', { lifecycleState: 'unclaimed' }),
      node('node-3', { lifecycleState: 'detached', detachedReason: 'absent_from_sidecar' }),
    ]);
  });

  it('claims an unclaimed device with an optional name and refreshes the list', async () => {
    const user = userEvent.setup();
    devices.claimNode.mockResolvedValue(node('node-2'));
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-node-unclaimed');
    await user.click(within(card).getByRole('button', { name: 'Claim' }));
    const dialog = await screen.findByTestId('matter-claim-dialog');
    await user.type(within(dialog).getByLabelText('Name (optional)'), '  Printer plug ');
    await user.click(within(dialog).getByRole('button', { name: 'Claim' }));
    await waitFor(() => expect(devices.claimNode).toHaveBeenCalledWith('node-2', 'Printer plug'));
    await waitFor(() => expect(devices.listNodes.mock.calls.length).toBeGreaterThan(1));
  });

  it('claims without a name when the field stays empty, and refuses a name that is too long', async () => {
    const user = userEvent.setup();
    devices.claimNode.mockResolvedValue(node('node-2'));
    renderMatter('/matter/devices');
    await user.click(within(await screen.findByTestId('matter-node-unclaimed')).getByRole('button', { name: 'Claim' }));
    const dialog = await screen.findByTestId('matter-claim-dialog');
    await user.type(within(dialog).getByLabelText('Name (optional)'), 'x'.repeat(101));
    expect(within(dialog).getByText('At most 100 characters.')).toBeInTheDocument();
    expect(within(dialog).getByTestId('matter-claim-confirm')).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Name (optional)'));
    await user.click(within(dialog).getByTestId('matter-claim-confirm'));
    await waitFor(() => expect(devices.claimNode).toHaveBeenCalledWith('node-2', undefined));
  });

  it('repairs a detached device after a confirmation', async () => {
    const user = userEvent.setup();
    devices.repairNode.mockResolvedValue(node('node-3'));
    renderMatter('/matter/devices');
    await user.click(within(await screen.findByTestId('matter-node-detached')).getByRole('button', { name: 'Repair' }));
    expect(devices.repairNode).not.toHaveBeenCalled();
    await user.click(within(await screen.findByTestId('matter-confirm-repair')).getByTestId('matter-confirm-action'));
    await waitFor(() => expect(devices.repairNode).toHaveBeenCalledWith('node-3'));
  });

  it('relinks a detached device to an unclaimed one in two steps when the identities differ', async () => {
    const user = userEvent.setup();
    devices.relinkNode.mockResolvedValue(node('node-3'));
    devices.listNodes.mockResolvedValue([
      node('node-2', { lifecycleState: 'unclaimed', identity: { ...node('node-2').identity, serialNumber: 'OTHER' } }),
      node('node-3', { lifecycleState: 'detached', detachedReason: 'absent_from_sidecar' }),
    ]);
    renderMatter('/matter/devices');
    await user.click(within(await screen.findByTestId('matter-node-detached')).getByRole('button', { name: 'Relink' }));
    const dialog = await screen.findByTestId('matter-relink-dialog');
    expect(within(dialog).getByTestId('matter-relink-next')).toBeDisabled();
    await user.click(await within(dialog).findByRole('button', { name: /Unclaimed device/ }));
    await user.click(await screen.findByRole('option', { name: 'Plug (2)' }));
    await user.click(within(dialog).getByTestId('matter-relink-next'));
    // The mismatch is an explicit second step; nothing was sent yet.
    const mismatch = await screen.findByTestId('matter-relink-mismatch-dialog');
    expect(mismatch).toHaveTextContent(/serial number/);
    expect(devices.relinkNode).not.toHaveBeenCalled();
    await user.click(within(mismatch).getByTestId('matter-relink-confirm-mismatch'));
    await waitFor(() => expect(devices.relinkNode).toHaveBeenCalledWith('node-3', 'node-2', true));
  });

  it('relinks directly when the identities match', async () => {
    const user = userEvent.setup();
    devices.relinkNode.mockResolvedValue(node('node-3'));
    const same = { ...node('node-3').identity, serialNumber: 'SAME' };
    devices.listNodes.mockResolvedValue([
      node('node-2', { lifecycleState: 'unclaimed', identity: same }),
      node('node-3', { lifecycleState: 'detached', detachedReason: 'absent_from_sidecar', identity: same }),
    ]);
    renderMatter('/matter/devices');
    await user.click(within(await screen.findByTestId('matter-node-detached')).getByRole('button', { name: 'Relink' }));
    const dialog = await screen.findByTestId('matter-relink-dialog');
    await user.click(await within(dialog).findByRole('button', { name: /Unclaimed device/ }));
    await user.click(await screen.findByRole('option', { name: 'Plug (2)' }));
    await user.click(within(dialog).getByTestId('matter-relink-next'));
    await waitFor(() => expect(devices.relinkNode).toHaveBeenCalledWith('node-3', 'node-2', false));
  });

  it('says so when there is nothing to relink to', async () => {
    const user = userEvent.setup();
    devices.listNodes.mockResolvedValue([
      node('node-3', { lifecycleState: 'detached', detachedReason: 'absent_from_sidecar' }),
    ]);
    renderMatter('/matter/devices');
    await user.click(within(await screen.findByTestId('matter-node-detached')).getByRole('button', { name: 'Relink' }));
    expect(await screen.findByTestId('matter-relink-none')).toBeInTheDocument();
  });

  it('force-removes only after a danger confirmation that says it does not factory-reset the device', async () => {
    const user = userEvent.setup();
    devices.forceRemoveNode.mockResolvedValue(node('node-2'));
    renderMatter('/matter/devices');
    await user.click(
      within(await screen.findByTestId('matter-node-unclaimed')).getByRole('button', { name: 'Force remove' }),
    );
    const dialog = await screen.findByTestId('matter-confirm-forceRemove');
    expect(dialog).toHaveTextContent(/does not factory-reset the device/);
    expect(devices.forceRemoveNode).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId('matter-confirm-action').className).toContain('button--danger');
    await user.click(within(dialog).getByTestId('matter-confirm-action'));
    await waitFor(() => expect(devices.forceRemoveNode).toHaveBeenCalledWith('node-2'));
  });

  it('archives after a confirmation and reports a refused action in an error dialog', async () => {
    const user = userEvent.setup();
    devices.archiveNode.mockRejectedValue(new Error('The node is claimed.'));
    renderMatter('/matter/devices');
    await user.click(
      within(await screen.findByTestId('matter-node-unclaimed')).getByRole('button', { name: 'Archive' }),
    );
    await user.click(within(await screen.findByTestId('matter-confirm-archive')).getByTestId('matter-confirm-action'));
    expect(await screen.findByTestId('matter-action-error')).toHaveTextContent('The node is claimed.');
  });
});

describe('reconciliation', () => {
  it('shows the last run and runs one now (manage)', async () => {
    const user = userEvent.setup();
    devices.getReconciliation.mockResolvedValue({
      ...NEVER_RUN,
      lastResult: 'applied',
      lastFinishedAt: '2026-11-06T10:00:00.000Z',
      lastSummary: { changeCount: 3, nodesListed: 5 },
    });
    devices.runReconciliation.mockResolvedValue(NEVER_RUN);
    renderMatter('/matter/devices');
    const card = await screen.findByTestId('matter-reconciliation');
    expect(await within(card).findByText('Applied')).toBeInTheDocument();
    expect(within(card).getByText('5 devices listed, 3 changes')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Run reconciliation now' }));
    await waitFor(() => expect(devices.runReconciliation).toHaveBeenCalledTimes(1));
  });

  it('says when nothing ran yet and reports a failed run', async () => {
    const user = userEvent.setup();
    devices.runReconciliation.mockRejectedValue(new Error('Sidecar unavailable'));
    renderMatter('/matter/devices');
    expect(await screen.findByTestId('matter-reconciliation-never')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run reconciliation now' }));
    expect(await screen.findByTestId('matter-reconciliation-run-error')).toHaveTextContent('Sidecar unavailable');
  });
});

describe('the device detail', () => {
  const bridged = endpoint(3, {
    parentEndpointId: 2,
    profile: 'on_off_actuator',
    bridged: {
      uniqueId: 'b-1',
      nodeLabel: 'Hall lamp',
      vendorName: null,
      productName: null,
      serialNumber: null,
      reachable: false,
    },
  });
  const full = detail('node-1', {
    metadata: { displayName: 'Hub', description: 'Main hub', location: 'Cellar' },
    endpoints: [
      endpoint(0, { profile: 'generic' }),
      endpoint(1, { profile: 'lock' }),
      endpoint(2, { profile: 'bridge_aggregator' }),
      bridged,
    ],
  });

  beforeEach(() => {
    devices.getNode.mockResolvedValue(full);
  });

  it('shows identity, the endpoint tree with human profile labels and no raw IDs', async () => {
    renderMatter('/matter/devices/node-1');
    const tree = await screen.findByTestId('matter-endpoint-tree');
    expect(screen.getByTestId('matter-device-name')).toHaveTextContent('Hub');
    const identity = screen.getByTestId('matter-identity');
    expect(identity).toHaveTextContent('Acme');
    expect(identity).toHaveTextContent('SN-node-1');
    expect(identity).toHaveTextContent('Verified');
    const profiles = within(tree)
      .getAllByTestId('matter-endpoint-profile')
      .map((chip) => chip.textContent);
    expect(profiles).toEqual(['Device', 'Door lock', 'Bridge', 'Switch']);
    // Endpoint 3 is nested under endpoint 2, which is under endpoint 0.
    const nested = within(tree)
      .getAllByRole('list')
      .map((list) => list.className.includes('border-l'));
    expect(nested.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toMatch(/0x0006|0x010A|clusterId|attributeIds/);
  });

  it('shows the bridge relation and the aggregator, with the bridged reachability', async () => {
    renderMatter('/matter/devices/node-1');
    const behind = await screen.findByTestId('matter-bridge-behind');
    expect(behind).toHaveTextContent('Behind bridge Hub');
    expect(behind).toHaveTextContent('Hall lamp');
    expect(within(behind).getByTestId('matter-reachability-unreachable')).toBeInTheDocument();
    expect(screen.getByTestId('matter-bridge-aggregator')).toHaveTextContent('Bridge');
  });

  it('shows the flow usage placeholder and the back link', async () => {
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    expect((await screen.findAllByTestId('matter-flow-usage'))[0]).toHaveTextContent('Not used in any flow.');
    await user.click(screen.getByTestId('matter-back-to-devices'));
    expect(screen.getByTestId('location')).toHaveTextContent('/matter/devices');
  });

  it('shows state entries with current and stale markers and the observation time', async () => {
    devices.getEndpointState.mockImplementation(async (id: string) => ({
      endpointRef: id,
      states:
        id === 'endpoint-1'
          ? [
              stateEntry({
                freshness: 'stale',
                reported: { value: false, observedAt: '2026-11-06T09:00:00.000Z', receivedAt: null },
              }),
            ]
          : [stateEntry({ freshness: 'fresh' })],
    }));
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-endpoint-tree');
    await waitFor(() => expect(screen.getAllByTestId('matter-state-entry').length).toBeGreaterThan(0));
    expect(screen.getAllByTestId('matter-state-stale')[0]).toHaveTextContent('Stale');
    expect(screen.getAllByTestId('matter-state-fresh')[0]).toHaveTextContent('Current');
    expect(screen.getAllByText('Power').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('matter-state-value').map((value) => value.textContent)).toContain('Off');
    expect(screen.getAllByText(/Observed/).length).toBeGreaterThan(0);
  });

  it('edits the name, description and location of a claimed device within the backend limits', async () => {
    const user = userEvent.setup();
    devices.updateNode.mockResolvedValue(node('node-1'));
    renderMatter('/matter/devices/node-1');
    const form = await screen.findByTestId('matter-node-metadata-form');
    const name = within(form).getByLabelText('Name');
    expect(name).toHaveValue('Hub');
    expect(within(form).getByTestId('matter-node-metadata-save')).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'x'.repeat(101));
    expect(within(form).getAllByText('At most 100 characters.').length).toBeGreaterThan(0);
    expect(within(form).getByTestId('matter-node-metadata-save')).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Basement hub');
    await user.clear(within(form).getByLabelText('Location'));
    await user.click(within(form).getByTestId('matter-node-metadata-save'));
    await waitFor(() =>
      expect(devices.updateNode).toHaveBeenCalledWith('node-1', { displayName: 'Basement hub', location: null }),
    );
  });

  it('shows a refused edit and keeps the form', async () => {
    const user = userEvent.setup();
    devices.updateNode.mockRejectedValue(new Error('Not allowed'));
    renderMatter('/matter/devices/node-1');
    const form = await screen.findByTestId('matter-node-metadata-form');
    await user.type(within(form).getByLabelText('Name'), '!');
    await user.click(within(form).getByTestId('matter-node-metadata-save'));
    expect(await screen.findByTestId('matter-node-metadata-error')).toHaveTextContent('Not allowed');
  });

  it('renames an endpoint', async () => {
    const user = userEvent.setup();
    devices.updateEndpoint.mockResolvedValue(endpoint(1));
    renderMatter('/matter/devices/node-1');
    const form = await screen.findByTestId('matter-endpoint-1-metadata-form');
    await user.type(within(form).getByLabelText('Name'), 'Front door');
    await user.click(within(form).getByTestId('matter-endpoint-1-metadata-save'));
    await waitFor(() =>
      expect(devices.updateEndpoint).toHaveBeenCalledWith('endpoint-1', { displayName: 'Front door' }),
    );
  });

  it('offers a read-only user no edit form and no lifecycle action', async () => {
    signIn('matter.devices.read');
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-endpoint-tree');
    expect(screen.queryByTestId('matter-node-metadata-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-endpoint-1-metadata-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-lifecycle-actions')).not.toBeInTheDocument();
    expect(screen.getByTestId('matter-metadata-readonly')).toHaveTextContent('Main hub');
  });

  it('offers the lifecycle actions of a claimed device (manage)', async () => {
    renderMatter('/matter/devices/node-1');
    const actions = await screen.findByTestId('matter-lifecycle-actions');
    expect(buttons(actions)).toEqual(['Repair', 'Force remove']);
  });

  it('keeps raw IDs and JSON in a collapsed Diagnostics section that renders only when opened', async () => {
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-endpoint-tree');
    expect(screen.getByTestId('matter-diagnostics-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('matter-diagnostics-json')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0x0006|0x010A|attributeIds/);

    await user.click(screen.getByTestId('matter-diagnostics-toggle'));
    const json = await screen.findByTestId('matter-diagnostics-json');
    expect(json).toHaveTextContent('"clusterId": "0x0006"');
    expect(json).toHaveTextContent('"deviceTypeId": "0x010A"');
    expect(json).toHaveTextContent('"capabilities"');
    // Still only inside Diagnostics.
    expect(screen.getByTestId('matter-endpoint-tree').textContent).not.toMatch(/0x0006/);
  });

  it('treats an unclaimed device as not usable: callout, resolving actions, no endpoints, no editing', async () => {
    devices.getNode.mockResolvedValue(detail('node-2', { lifecycleState: 'unclaimed' }));
    renderMatter('/matter/devices/node-2');
    await screen.findByTestId('matter-callout-unclaimed');
    expect(buttons(screen.getByTestId('matter-lifecycle-actions'))).toEqual(['Claim', 'Archive', 'Force remove']);
    expect(screen.queryByTestId('matter-endpoint-tree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-node-metadata-form')).not.toBeInTheDocument();
    expect(screen.getByText('Claim the device to name it.')).toBeInTheDocument();
    // Diagnostics stay available for support.
    expect(screen.getByTestId('matter-diagnostics')).toBeInTheDocument();
  });

  it('shows a detached device with its reason and repair and relink', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-3', { lifecycleState: 'detached', detachedReason: 'fabric_mismatch' }),
    );
    renderMatter('/matter/devices/node-3');
    expect(await screen.findByTestId('matter-callout-detached')).toHaveTextContent(
      'The fabric of the sidecar changed.',
    );
    expect(buttons(screen.getByTestId('matter-lifecycle-actions'))).toEqual([
      'Repair',
      'Relink',
      'Archive',
      'Force remove',
    ]);
  });

  it('has an error state of its own with a way back', async () => {
    devices.getNode.mockRejectedValue(new Error('Node not found'));
    renderMatter('/matter/devices/missing');
    expect(await screen.findByTestId('matter-device-error')).toHaveTextContent('Node not found');
    expect(screen.getByTestId('matter-back-to-devices')).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

describe('live updates', () => {
  it('refetches the list when the inventory topic signals a change', async () => {
    devices.listNodes.mockResolvedValue([]);
    const { live } = renderMatter('/matter/devices');
    await screen.findByTestId('matter-devices-empty');
    expect([...live.active].some((entry) => entry.topic === 'plugin:matter:devices')).toBe(true);
    devices.listNodes.mockResolvedValue([
      node('node-1', { metadata: { displayName: 'New lamp', description: null, location: null } }),
    ]);
    act(() => live.push('devices'));
    expect(await screen.findByText('New lamp')).toBeInTheDocument();
  });

  it('subscribes to the state topic of each endpoint and refetches its state on a signal', async () => {
    devices.getNode.mockResolvedValue(detail('node-1'));
    devices.getEndpointState.mockResolvedValue({
      endpointRef: 'endpoint-1',
      states: [stateEntry({ reported: { value: true, observedAt: null, receivedAt: null } })],
    });
    const { live } = renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-endpoint-tree');
    await waitFor(() => expect(live.active.size).toBeGreaterThan(2));
    expect([...live.active].map((entry) => entry.identifier).filter(Boolean)).toEqual(
      expect.arrayContaining(['endpoint-0', 'endpoint-1']),
    );
    const before = devices.getEndpointState.mock.calls.filter(([id]) => id === 'endpoint-1').length;
    act(() => live.push('device-state', 'endpoint-1'));
    await waitFor(() =>
      expect(devices.getEndpointState.mock.calls.filter(([id]) => id === 'endpoint-1').length).toBe(before + 1),
    );
  });

  it('refetches on reconnect, marks the data stale when unavailable and polls until it works again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    devices.listNodes.mockResolvedValue([]);
    const { live } = renderMatter('/matter/devices');
    await screen.findByTestId('matter-devices-empty');
    const calls = () => devices.listNodes.mock.calls.length;

    const beforeReconnect = calls();
    act(() => live.reconnect('devices'));
    await waitFor(() => expect(calls()).toBe(beforeReconnect + 1));
    expect(screen.queryByTestId('matter-devices-stale')).not.toBeInTheDocument();

    act(() => live.unavailable('devices'));
    expect(await screen.findByTestId('matter-devices-stale')).toHaveTextContent(/out of date/);
    const beforePoll = calls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS * 2);
    });
    expect(calls()).toBeGreaterThanOrEqual(beforePoll + 2);

    act(() => live.reconnect('devices'));
    await waitFor(() => expect(screen.queryByTestId('matter-devices-stale')).not.toBeInTheDocument());
    const afterRecovery = calls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FALLBACK_POLL_MS * 2);
    });
    expect(calls()).toBe(afterRecovery);
  });

  it('marks a device detail stale when its topic is unavailable', async () => {
    devices.getNode.mockResolvedValue(detail('node-1'));
    const { live } = renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-endpoint-tree');
    act(() => live.unavailable('devices'));
    expect(await screen.findByTestId('matter-device-stale')).toBeInTheDocument();
  });
});
