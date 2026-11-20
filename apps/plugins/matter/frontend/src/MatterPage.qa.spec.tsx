// @vitest-environment jsdom
// Regressions found while QA-ing the tabbed page in a browser: raw translation keys, hidden validation messages and
// error states without a way forward.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detail, node, status } from './test-utils/fixtures';
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
  updateNode: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({ ...(await original<typeof import('./devices/api')>()), ...devices }));
vi.mock('./fabric-backup/api', () => ({ getFabricStatus: vi.fn() }));
vi.mock('./fabric-backup/FabricBackupSection', () => ({ FabricBackupSection: () => null }));

configure({ testIdAttribute: 'data-cy' });

beforeEach(() => {
  signIn(...ALL_KEYS);
  api.getStatus.mockResolvedValue(status());
  api.getSettings.mockResolvedValue(null);
  devices.listNodes.mockResolvedValue([]);
  devices.getEndpointState.mockResolvedValue({ endpointRef: 'endpoint-1', states: [] });
  devices.getReconciliation.mockResolvedValue({
    lastStartedAt: null,
    lastFinishedAt: null,
    lastResult: null,
    lastSummary: null,
    sidecarFabricId: null,
    events: {},
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Health', () => {
  it('labels a connected sidecar "Connected", not a raw translation key', async () => {
    renderMatter('/matter/health');
    await waitFor(() => expect(screen.getByTestId('matter-health-connection-level')).toHaveTextContent('Connected'));
    expect(document.body).not.toHaveTextContent('!!!');
  });

  it('shows the capability chips as "unknown" while the sidecar is not connected, without a sentence per chip', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable', capabilities: null }));
    renderMatter('/matter/health');
    const chip = await screen.findByTestId('matter-capability-thread');
    expect(chip).toHaveTextContent('Thread: unknown');
    expect(chip).not.toHaveTextContent('known while');
  });
});

describe('Thread', () => {
  it('does not claim the sidecar is not connected when the user cannot read its status', async () => {
    signIn('thread.network.read');
    renderMatter('/matter/thread');
    const notice = await screen.findByTestId('matter-family-notice-thread');
    expect(notice).toHaveTextContent(/is not shown here/);
    expect(notice).not.toHaveTextContent(/not connected/);
    expect(api.getStatus).not.toHaveBeenCalled();
  });
});

describe('Devices', () => {
  it('lets the user try again after the device list failed to load', async () => {
    const user = userEvent.setup();
    devices.listNodes.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([node('node-1')]);
    renderMatter('/matter/devices');
    const error = await screen.findByTestId('matter-devices-error');
    await user.click(within(error).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('matter-devices-error')).not.toBeInTheDocument());
    expect(await screen.findByTestId('matter-node-claimed')).toBeInTheDocument();
  });

  it('lets the user try again after the device failed to load', async () => {
    const user = userEvent.setup();
    devices.getNode.mockRejectedValueOnce(new Error('id: Invalid UUID')).mockResolvedValue(detail('node-1'));
    renderMatter('/matter/devices/node-1');
    const error = await screen.findByTestId('matter-device-error');
    await user.click(within(error).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('matter-device-detail')).toBeInTheDocument();
  });

  it('says nothing about the reason of a detached device whose reason it does not know', async () => {
    devices.listNodes.mockResolvedValue([
      node('node-3', { lifecycleState: 'detached', detachedReason: 'something_new' as never }),
    ]);
    renderMatter('/matter/devices');
    const callout = await screen.findByTestId('matter-callout-detached');
    expect(callout).toHaveTextContent(/cannot be used until you repair or relink it/);
    expect(callout).not.toHaveTextContent('!!!');
  });

  it('shows the length message of an invalid name through the field error, which stays visible', async () => {
    const user = userEvent.setup();
    devices.getNode.mockResolvedValue(
      detail('node-1', { metadata: { displayName: 'Hub', description: null, location: null } }),
    );
    renderMatter('/matter/devices/node-1');
    const form = await screen.findByTestId('matter-node-metadata-form');
    await user.type(within(form).getByLabelText('Name'), 'x'.repeat(98));
    expect(within(form).getByTestId('matter-node-displayName-error')).toBeInTheDocument();
  });

  it('adopts a change made elsewhere while the form is untouched, and keeps edits otherwise', async () => {
    const user = userEvent.setup();
    const meta = (displayName: string) => ({ displayName, description: null, location: null });
    devices.getNode.mockResolvedValue(detail('node-1', { metadata: meta('Hub') }));
    const { live } = renderMatter('/matter/devices/node-1');
    const form = await screen.findByTestId('matter-node-metadata-form');
    expect(within(form).getByLabelText('Name')).toHaveValue('Hub');
    devices.getNode.mockResolvedValue(detail('node-1', { metadata: meta('Renamed elsewhere') }));
    act(() => live.push('devices'));
    await waitFor(() => expect(within(form).getByLabelText('Name')).toHaveValue('Renamed elsewhere'));
    await user.type(within(form).getByLabelText('Name'), '!');
    devices.getNode.mockResolvedValue(detail('node-1', { metadata: meta('Third name') }));
    const calls = devices.getNode.mock.calls.length;
    act(() => live.push('devices'));
    await waitFor(() => expect(devices.getNode.mock.calls.length).toBeGreaterThan(calls));
    expect(within(form).getByLabelText('Name')).toHaveValue('Renamed elsewhere!');
  });
});
