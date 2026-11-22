// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeQrFromPixels } from './commissioning/qrDecode';
import { MatterApiError } from './matterApi';
import { detail, endpoint, status } from './test-utils/fixtures';
import { ALL_KEYS, renderMatter, signIn } from './test-utils/renderMatter';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), getStatus: vi.fn() }));
const devices = vi.hoisted(() => ({
  listNodes: vi.fn(),
  getNode: vi.fn(),
  getEndpointState: vi.fn(),
  getReconciliation: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  removeFromFabric: vi.fn(),
  openShareWindow: vi.fn(),
  closeShareWindow: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({
  ...(await original<typeof import('./devices/api')>()),
  ...devices,
  ...actions,
}));
vi.mock('./fabric-backup/api', () => ({ getFabricStatus: vi.fn() }));
vi.mock('./fabric-backup/FabricBackupSection', () => ({ FabricBackupSection: () => null }));

configure({ testIdAttribute: 'data-cy' });

beforeEach(() => {
  signIn(...ALL_KEYS);
  api.getStatus.mockResolvedValue(status());
  api.getSettings.mockResolvedValue(null);
  devices.listNodes.mockResolvedValue([]);
  devices.getReconciliation.mockResolvedValue({});
  devices.getEndpointState.mockResolvedValue({ endpointRef: 'endpoint-1', states: [] });
  devices.getNode.mockResolvedValue(detail('node-1'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** Paints the share QR code's SVG (one 1×1 rect per dark module on a white background) into RGBA pixels. */
function svgToPixels(svg: Element, scale = 4) {
  const side = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
  const size = side * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const rect of Array.from(svg.querySelectorAll('rect'))) {
    if (rect.getAttribute('fill') !== '#000') continue;
    const x = Number(rect.getAttribute('x'));
    const y = Number(rect.getAttribute('y'));
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const at = ((y * scale + dy) * size + x * scale + dx) * 4;
        data[at] = data[at + 1] = data[at + 2] = 0;
      }
    }
  }
  return { data, width: size, height: size };
}

describe('remove from fabric', () => {
  it('asks first, says it is not a factory reset, and refetches after removal', async () => {
    actions.removeFromFabric.mockResolvedValue({});
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-remove-action'));
    const dialog = await screen.findByTestId('matter-remove-dialog');
    expect(dialog).toHaveTextContent('not a factory reset');
    expect(dialog.textContent).not.toMatch(/was reset|has been reset/i);
    await user.click(screen.getByTestId('matter-remove-confirm'));
    await waitFor(() => expect(actions.removeFromFabric).toHaveBeenCalledWith('node-1', 'normal'));
    await waitFor(() => expect(devices.getNode.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByTestId('matter-remove-force')).not.toBeInTheDocument();
  });

  it.each([
    ['device_unreachable', 'Nothing was changed'],
    ['timeout', 'The outcome is uncertain'],
  ])(
    'offers a forced removal after %s, with the credentials warning, and sends mode force',
    async (code, explanation) => {
      actions.removeFromFabric.mockRejectedValueOnce(new MatterApiError('The device did not answer.', 409, code));
      const user = userEvent.setup();
      renderMatter('/matter/devices/node-1');
      await user.click(await screen.findByTestId('matter-remove-action'));
      await user.click(await screen.findByTestId('matter-remove-confirm'));
      const error = await screen.findByTestId('matter-remove-error');
      expect(error).toHaveTextContent(explanation);
      if (code === 'timeout') expect(error).not.toHaveTextContent('Nothing was changed');
      await user.click(screen.getByTestId('matter-remove-force'));
      const dialog = await screen.findByTestId('matter-force-dialog');
      expect(dialog).toHaveTextContent('may still hold Attraccess credentials');
      expect(dialog).toHaveTextContent(/factory-reset it, or remove it from its other controller/i);
      actions.removeFromFabric.mockResolvedValueOnce({});
      await user.click(screen.getByTestId('matter-force-confirm'));
      await waitFor(() => expect(actions.removeFromFabric).toHaveBeenLastCalledWith('node-1', 'force'));
    },
  );

  it('shows another failure translated, without a forced removal', async () => {
    actions.removeFromFabric.mockRejectedValueOnce(new MatterApiError('Another operation is running.', 409, 'busy'));
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-remove-action'));
    await user.click(await screen.findByTestId('matter-remove-confirm'));
    const error = await screen.findByTestId('matter-remove-error');
    expect(error).toHaveTextContent('The Matter sidecar is busy with another operation');
    expect(error).not.toHaveTextContent('Another operation is running.');
    expect(screen.queryByTestId('matter-remove-force')).not.toBeInTheDocument();
  });

  it('points to the record-only force remove when the sidecar does not know the device', async () => {
    actions.removeFromFabric.mockRejectedValueOnce(new MatterApiError('Raw.', 409, 'node_not_on_sidecar'));
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-remove-action'));
    await user.click(await screen.findByTestId('matter-remove-confirm'));
    const error = await screen.findByTestId('matter-remove-error');
    expect(error).toHaveTextContent('does not know this device');
    expect(error).toHaveTextContent('“Force remove” among the device actions to remove only its record');
    expect(screen.queryByTestId('matter-remove-force')).not.toBeInTheDocument();
  });

  it('names the device in the accessible name of the button', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', { metadata: { displayName: 'Lamp', description: null, location: null } }),
    );
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-remove-action')).toHaveAccessibleName('Remove from fabric: Lamp');
  });

  it('is not offered for a detached device, which is repaired or relinked first', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', { lifecycleState: 'detached', detachedReason: 'absent_from_sidecar' }),
    );
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-remove-detached')).toHaveTextContent('Repair or relink it first');
    expect(screen.queryByTestId('matter-remove-action')).not.toBeInTheDocument();
  });

  it('is hidden without the commission permission, and for a removed device, which says how it left', async () => {
    signIn('matter.devices.read', 'matter.devices.manage');
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-device-detail');
    expect(screen.queryByTestId('matter-remove-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-share-open')).not.toBeInTheDocument();
    cleanup();
    signIn(...ALL_KEYS);
    devices.getNode.mockResolvedValue(
      detail('node-1', { lifecycleState: 'removed', removalReason: 'forced_from_fabric' }),
    );
    renderMatter('/matter/devices/node-1');
    const notice = await screen.findByTestId('matter-removed-notice');
    expect(notice).toHaveTextContent('may still hold Attraccess credentials');
    expect(screen.queryByTestId('matter-remove-action')).not.toBeInTheDocument();
  });
});

describe('share with another controller', () => {
  const window = (seconds = 180) => ({
    manualCode: '34970112332',
    qrCode: 'MT:Y.K9042C00KA0648G00',
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  });

  it('shows the codes once with a countdown, closes the window and forgets the codes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    actions.openShareWindow.mockResolvedValue(window());
    actions.closeShareWindow.mockResolvedValue({ closed: true });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-share-open'));
    await user.click(await screen.findByTestId('matter-share-confirm'));
    expect(await screen.findByTestId('matter-share-manual')).toHaveTextContent('34970112332');
    expect(screen.getByTestId('matter-share-payload')).toHaveTextContent('MT:Y.K9042C00KA0648G00');
    expect(screen.getByTestId('matter-share-qr')).toBeInTheDocument();
    expect(screen.getByTestId('matter-share-countdown')).toHaveTextContent('3:00');
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_000)));
    expect(screen.getByTestId('matter-share-countdown')).toHaveTextContent(/2:5\d/);
    await user.click(screen.getByTestId('matter-share-close'));
    await waitFor(() => expect(actions.closeShareWindow).toHaveBeenCalledWith('node-1'));
    await waitFor(() => expect(screen.queryByTestId('matter-share-window')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('34970112332');
    expect(setItem.mock.calls.flat().join(' ')).not.toContain('34970112332');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('34970112332');
  });

  it('drops the codes when the window expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    actions.openShareWindow.mockResolvedValue(window(3));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-share-open'));
    await user.click(await screen.findByTestId('matter-share-confirm'));
    await screen.findByTestId('matter-share-window');
    await act(async () => void (await vi.advanceTimersByTimeAsync(4_000)));
    expect(await screen.findByTestId('matter-share-expired')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('34970112332');
  });

  it('shows a failed share translated', async () => {
    actions.openShareWindow.mockRejectedValue(new MatterApiError('Raw.', 409, 'device_unreachable'));
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-share-open'));
    await user.click(await screen.findByTestId('matter-share-confirm'));
    const error = await screen.findByTestId('matter-share-error');
    expect(error).toHaveTextContent('The device could not be reached. Nothing was changed.');
    expect(error).not.toHaveTextContent('Raw.');
  });

  it('draws a QR code that decodes back to the shared payload', async () => {
    actions.openShareWindow.mockResolvedValue(window());
    const user = userEvent.setup();
    renderMatter('/matter/devices/node-1');
    await user.click(await screen.findByTestId('matter-share-open'));
    await user.click(await screen.findByTestId('matter-share-confirm'));
    const svg = await screen.findByTestId('matter-share-qr');
    expect(await decodeQrFromPixels(svgToPixels(svg))).toBe('MT:Y.K9042C00KA0648G00');
  });

  it('is only offered for a claimed device', async () => {
    devices.getNode.mockResolvedValue(detail('node-1', { lifecycleState: 'unclaimed' }));
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-device-detail');
    expect(screen.queryByTestId('matter-share')).not.toBeInTheDocument();
  });
});

describe('a removed device', () => {
  it.each([
    ['force_removed', 'Removed from Attraccess only', /still in the Matter fabric/],
    ['merged', 'Merged into another device', /relinked into a detached device/],
    ['replaced', 'Replaced', /replaced by a newer record/],
    ['removed_from_fabric', 'Removed from the Attraccess fabric', /left the Attraccess fabric/],
  ])('says how it left (%s)', async (removalReason, title, text) => {
    devices.getNode.mockResolvedValue(detail('node-1', { lifecycleState: 'removed', removalReason }));
    renderMatter('/matter/devices/node-1');
    const notice = await screen.findByTestId('matter-removed-notice');
    expect(notice).toHaveTextContent(text);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('does not claim a device of an unknown reason left the fabric', async () => {
    devices.getNode.mockResolvedValue(detail('node-1', { lifecycleState: 'removed', removalReason: 'something_new' }));
    renderMatter('/matter/devices/node-1');
    const notice = await screen.findByTestId('matter-removed-notice');
    expect(notice).toHaveTextContent('no longer used in Attraccess');
    expect(notice).not.toHaveTextContent(/fabric/i);
  });

  it('shows neither an empty endpoint list nor other administrators', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', {
        lifecycleState: 'removed',
        removalReason: 'removed_from_fabric',
        endpoints: [],
        administrators: [{ fabricIndex: 2, vendorId: 4937, fabricLabel: 'Home', isOwn: false }],
      }),
    );
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-removed-notice');
    expect(screen.queryByTestId('matter-endpoints')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-administrators')).not.toBeInTheDocument();
    cleanup();
    devices.getNode.mockResolvedValue(
      detail('node-1', { lifecycleState: 'removed', removalReason: 'removed_from_fabric', endpoints: [endpoint(1)] }),
    );
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-endpoints')).toBeInTheDocument();
  });
});

describe('other administrators', () => {
  it('lists the fabrics outside Attraccess read-only and never as an Attraccess action', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', {
        administrators: [
          { fabricIndex: 1, vendorId: 0xfff1, fabricLabel: 'Attraccess', isOwn: true },
          { fabricIndex: 2, vendorId: 4937, fabricLabel: 'Home', isOwn: false },
        ],
      }),
    );
    renderMatter('/matter/devices/node-1');
    const section = await screen.findByTestId('matter-administrators');
    expect(section).toHaveTextContent('Managed outside Attraccess');
    const entries = within(section).getAllByTestId('matter-administrator');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent('Fabric 2');
    expect(entries[0]).toHaveTextContent('Home');
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
  });

  it('says there are none, and is absent from an older backend', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', { administrators: [{ fabricIndex: 1, vendorId: 0xfff1, fabricLabel: null, isOwn: true }] }),
    );
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-administrators-none')).toBeInTheDocument();
    cleanup();
    devices.getNode.mockResolvedValue(detail('node-1'));
    renderMatter('/matter/devices/node-1');
    await screen.findByTestId('matter-device-detail');
    expect(screen.queryByTestId('matter-administrators')).not.toBeInTheDocument();
  });

  it('marks an overridden attestation on the identity card', async () => {
    devices.getNode.mockResolvedValue(
      detail('node-1', {
        attestationOverridden: true,
        identity: { ...detail('node-1').identity, attestation: { status: 'unverified', checkedAt: null } },
      }),
    );
    renderMatter('/matter/devices/node-1');
    expect(await screen.findByTestId('matter-attestation-overridden')).toHaveTextContent('overridden');
  });
});
