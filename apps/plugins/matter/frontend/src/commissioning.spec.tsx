// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommissioningSessionView } from './commissioning/api';
import { ImageTooLargeError } from './commissioning/imageLimits';
import { SESSION_POLL_MS } from './commissioning/useCommissioningState';
import { MatterApiError } from './matterApi';
import { node, status } from './test-utils/fixtures';
import { MANUAL_11, MANUAL_21, QR_PAYLOAD, qrPixels } from './test-utils/qrPixels';
import { ALL_KEYS, renderMatter, signIn } from './test-utils/renderMatter';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), getStatus: vi.fn() }));
const commissioning = vi.hoisted(() => ({
  startCommissioning: vi.fn(),
  getCurrentSession: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
  finishSession: vi.fn(),
}));
const image = vi.hoisted(() => ({ loadImagePixels: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({
  ...(await original<typeof import('./devices/api')>()),
  listNodes: vi.fn().mockResolvedValue([]),
  getReconciliation: vi.fn().mockResolvedValue({}),
}));
vi.mock('./commissioning/api', async (original) => ({
  ...(await original<typeof import('./commissioning/api')>()),
  ...commissioning,
}));
vi.mock('./commissioning/loadImagePixels', () => image);
vi.mock('./fabric-backup/api', () => ({ getFabricStatus: vi.fn() }));
vi.mock('./fabric-backup/FabricBackupSection', () => ({ FabricBackupSection: () => null }));

configure({ testIdAttribute: 'data-cy' });

const session = (overrides: Partial<CommissioningSessionView> = {}): CommissioningSessionView => ({
  id: '11111111-1111-4111-8111-111111111111',
  state: 'running',
  step: 'pase',
  failure: null,
  attestation: null,
  overrideAvailable: false,
  nodeRecordId: null,
  endpoints: [],
  finished: false,
  startedAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:01.000Z',
  finishedAt: null,
  ...overrides,
});
const failed = (code: string, extra: Partial<CommissioningSessionView['failure'] & object> = {}, rest = {}) =>
  session({ state: 'failed', failure: { code, ...extra }, ...rest });

const available = status({
  capabilities: {
    capabilities: [
      { family: 'commissioning', available: true },
      { family: 'inventory', available: true },
    ],
  },
});

beforeEach(() => {
  signIn(...ALL_KEYS);
  api.getStatus.mockResolvedValue(available);
  api.getSettings.mockResolvedValue(null);
  commissioning.getCurrentSession.mockResolvedValue(null);
  commissioning.startCommissioning.mockResolvedValue(session({ state: 'pending', step: null }));
  commissioning.getSession.mockResolvedValue(session());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

async function openCodeStep() {
  const user = userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {});
  renderMatter('/matter/commissioning');
  await user.click(await screen.findByTestId('matter-prepare-continue'));
  return user;
}

describe('the code step: every input form leads to the same request', () => {
  it('sends a typed 11-digit code, with spaces and hyphens removed', async () => {
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), '3497 011-2332');
    await user.click(screen.getByTestId('matter-code-start'));
    await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: MANUAL_11 }));
  });

  it('sends a typed 21-digit code', async () => {
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), MANUAL_21);
    await user.click(screen.getByTestId('matter-code-start'));
    await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: MANUAL_21 }));
  });

  it('submits with the Enter key and does not send an invalid code', async () => {
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), 'hello{Enter}');
    expect(commissioning.startCommissioning).not.toHaveBeenCalled();
    await user.clear(screen.getByTestId('matter-code-input'));
    await user.type(screen.getByTestId('matter-code-input'), `${MANUAL_11}{Enter}`);
    await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledTimes(1));
    expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: MANUAL_11 });
  });

  it('sends a pasted QR payload', async () => {
    const user = await openCodeStep();
    await user.click(screen.getByTestId('matter-code-input'));
    await user.paste(QR_PAYLOAD);
    await user.click(screen.getByTestId('matter-code-start'));
    await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: QR_PAYLOAD }));
  });

  it('decodes an uploaded QR image in the browser, uploads nothing, and sends the same request', async () => {
    image.loadImagePixels.mockResolvedValue(qrPixels(QR_PAYLOAD));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = await openCodeStep();
    await user.click(screen.getByTestId('matter-code-source-image'));
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('matter-image-input'), file);
    await waitFor(() => expect(screen.getByTestId('matter-code-input')).toHaveValue(QR_PAYLOAD));
    // The picture went to the in-browser decoder only: no request of any kind left the page.
    expect(image.loadImagePixels).toHaveBeenCalledWith(file);
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('matter-code-start'));
    await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: QR_PAYLOAD }));
  });

  it('refuses a picture that is too large to read, and sends nothing', async () => {
    image.loadImagePixels.mockRejectedValue(new ImageTooLargeError());
    const user = await openCodeStep();
    await user.click(screen.getByTestId('matter-code-source-image'));
    await user.upload(screen.getByTestId('matter-image-input'), new File(['x'], 'qr.png', { type: 'image/png' }));
    expect(await screen.findByTestId('matter-image-too-large')).toHaveTextContent('up to 20 MB and 40 megapixels');
    expect(screen.queryByTestId('matter-image-failed')).not.toBeInTheDocument();
    expect(commissioning.startCommissioning).not.toHaveBeenCalled();
  });

  it('says when an image holds no QR code', async () => {
    image.loadImagePixels.mockResolvedValue({
      data: new Uint8ClampedArray(20 * 20 * 4).fill(255),
      width: 20,
      height: 20,
    });
    const user = await openCodeStep();
    await user.click(screen.getByTestId('matter-code-source-image'));
    await user.upload(screen.getByTestId('matter-image-input'), new File(['x'], 'qr.png', { type: 'image/png' }));
    expect(await screen.findByTestId('matter-image-failed')).toBeInTheDocument();
    expect(commissioning.startCommissioning).not.toHaveBeenCalled();
  });

  describe('camera', () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    beforeEach(() => {
      vi.stubGlobal('isSecureContext', true);
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 100 });
      HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    });

    it('scans with the native BarcodeDetector and stops the camera', async () => {
      vi.stubGlobal(
        'BarcodeDetector',
        class {
          detect = async () => [{ rawValue: QR_PAYLOAD }];
        },
      );
      const user = await openCodeStep();
      await user.click(screen.getByTestId('matter-code-source-camera'));
      await waitFor(() => expect(screen.getByTestId('matter-code-input')).toHaveValue(QR_PAYLOAD), { timeout: 3_000 });
      expect(stop).toHaveBeenCalled();
      await user.click(screen.getByTestId('matter-code-start'));
      await waitFor(() => expect(commissioning.startCommissioning).toHaveBeenCalledWith({ setupCode: QR_PAYLOAD }));
    });

    it('falls back to decoding frames with jsQR without BarcodeDetector', async () => {
      vi.stubGlobal('BarcodeDetector', undefined);
      const pixels = qrPixels(QR_PAYLOAD);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
        getImageData: () => pixels,
      } as never);
      const user = await openCodeStep();
      await user.click(screen.getByTestId('matter-code-source-camera'));
      await waitFor(() => expect(screen.getByTestId('matter-code-input')).toHaveValue(QR_PAYLOAD), { timeout: 3_000 });
    });

    it('points to upload or typing without a secure context or camera', async () => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      const user = await openCodeStep();
      await user.click(screen.getByTestId('matter-code-source-camera'));
      expect(await screen.findByTestId('matter-camera-problem')).toHaveTextContent(/HTTPS or localhost/);
    });
  });

  it('shows an inline error and sends nothing for an invalid code', async () => {
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), '34970112333');
    await user.click(screen.getByTestId('matter-code-start'));
    expect(await screen.findByTestId('matter-code-error')).toHaveTextContent('check digit');
    await user.clear(screen.getByTestId('matter-code-input'));
    await user.type(screen.getByTestId('matter-code-input'), 'hello');
    await user.click(screen.getByTestId('matter-code-start'));
    expect(await screen.findByTestId('matter-code-error')).toHaveTextContent('not a Matter setup code');
    expect(commissioning.startCommissioning).not.toHaveBeenCalled();
  });

  it('shows a refused start (409 busy) translated, without losing the entered code', async () => {
    commissioning.startCommissioning.mockRejectedValue(
      new MatterApiError('A commissioning session is already running.', 409, 'busy'),
    );
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), MANUAL_11);
    await user.click(screen.getByTestId('matter-code-start'));
    const error = await screen.findByTestId('matter-code-request-error');
    expect(error).toHaveTextContent('The Matter sidecar is busy with another operation');
    expect(error).not.toHaveTextContent('already running');
    expect(screen.getByTestId('matter-code-input')).toHaveValue(MANUAL_11);
  });

  it.each([
    ['recovery_required', /needs recovery first/],
    ['sidecar_unavailable', /cannot be reached/],
    ['fabric_absent', /has no fabric yet/],
    ['insecure_transport', /Setup and sharing codes are secrets/],
  ])('translates the refused start %s', async (code, text) => {
    commissioning.startCommissioning.mockRejectedValue(new MatterApiError('Raw backend text.', 409, code));
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), `${MANUAL_11}{Enter}`);
    const error = await screen.findByTestId('matter-code-request-error');
    expect(error).toHaveTextContent(text);
    expect(error).not.toHaveTextContent('Raw backend text.');
  });
});

describe('progress', () => {
  it('lists the steps with their live state, follows the session and ends in the naming step', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), MANUAL_11);
    await user.click(screen.getByTestId('matter-code-start'));
    const list = await screen.findByTestId('matter-progress-step');
    expect(within(list).getByTestId('matter-progress-discovering')).toHaveAttribute('data-state', 'running');
    commissioning.getSession.mockResolvedValue(session({ step: 'attestation' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await waitFor(() =>
      expect(screen.getByTestId('matter-progress-attestation')).toHaveAttribute('data-state', 'running'),
    );
    expect(screen.getByTestId('matter-progress-pase')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('matter-progress-case')).toHaveAttribute('data-state', 'waiting');
    expect(screen.queryByTestId('matter-progress-network_setup')).not.toBeInTheDocument();
    // The code is not shown anywhere once the session runs.
    expect(document.body.textContent).not.toContain(MANUAL_11);
    commissioning.getSession.mockResolvedValue(
      session({
        state: 'succeeded',
        step: 'completed',
        nodeRecordId: 'node-9',
        endpoints: [{ endpointId: 1, id: 'ep-1', displayName: null }],
      }),
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    expect(await screen.findByTestId('matter-finish-step')).toBeInTheDocument();
  });

  it('resumes the current session when the page is opened again, and cancels it after a confirmation', async () => {
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'case' }));
    commissioning.cancelSession.mockResolvedValue(failed('cancelled'));
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    expect(await screen.findByTestId('matter-progress-case')).toHaveAttribute('data-state', 'running');
    await user.click(screen.getByTestId('matter-progress-cancel'));
    // The dialog's two buttons must not both read "Cancel": one keeps going, the other confirms.
    const dialog = await screen.findByTestId('matter-progress-cancel-dialog');
    expect(within(dialog).getByRole('button', { name: 'Keep going' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    await user.click(await screen.findByTestId('matter-progress-cancel-confirm'));
    expect(await screen.findByTestId('matter-failure-cancelled')).toBeInTheDocument();
    expect(commissioning.cancelSession).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });
});

describe('failure screens', () => {
  const cases: [string, RegExp][] = [
    ['invalid_code', /could not read this code/],
    ['device_not_found', /closer or onto the same network/],
    ['pase_failed', /did not accept the passcode/],
    ['fabric_full', /no room for another administrator/],
    ['case_failed', /connection could not be completed/],
    ['timeout', /Nothing was left half-registered/],
    ['cancelled', /was not added/],
    ['internal', /unexpected error/],
    ['needs_reconciliation', /could not record it/],
    ['registry_failed', /could not store it/],
    ['mystery', /Start again with the code/],
  ];
  it.each(cases)('%s explains what happened and offers to start again with a re-entered code', async (code, text) => {
    commissioning.getCurrentSession.mockResolvedValue(failed(code));
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    const screenEl = await screen.findByTestId('matter-failure-screen');
    expect(screenEl).toHaveTextContent(text);
    expect(screen.queryByTestId('matter-failure-override')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('matter-failure-again'));
    // Back to the first step: the code has to be entered again.
    expect(await screen.findByTestId('matter-prepare-step')).toBeInTheDocument();
  });

  it('an interrupted session says to check Devices and never resumes', async () => {
    commissioning.getCurrentSession.mockResolvedValue(session({ state: 'interrupted', step: 'case' }));
    renderMatter('/matter/commissioning');
    const el = await screen.findByTestId('matter-failure-screen');
    expect(el).toHaveAttribute('data-code', 'interrupted');
    expect(el).toHaveTextContent(/never resumed|is never resumed/);
    expect(el).toHaveTextContent(/unclaimed device/);
    expect(screen.getByTestId('matter-failure-open-devices')).toBeInTheDocument();
    expect(commissioning.getSession).not.toHaveBeenCalled();
  });

  it.each([
    ['open', 'Open the device', 'node-5'],
    ['repair', 'Open the device to repair it', 'node-5'],
    ['restore', 'Open the device to restore it', 'node-5'],
  ] as const)('already_commissioned offers "%s" and opens the existing record', async (action, label, id) => {
    commissioning.getCurrentSession.mockResolvedValue(
      failed('already_commissioned', { existing: { nodeRecordId: id, lifecycleState: 'claimed', action } }),
    );
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    const open = await screen.findByTestId('matter-failure-open-device');
    expect(open).toHaveTextContent(label);
    await user.click(open);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/matter/devices/${id}`));
  });

  it('already_commissioned of an unclaimed record says it still has to be claimed', async () => {
    commissioning.getCurrentSession.mockResolvedValue(
      failed('already_commissioned', {
        existing: { nodeRecordId: 'node-5', lifecycleState: 'unclaimed', action: 'open' },
      }),
    );
    renderMatter('/matter/commissioning');
    expect(await screen.findByTestId('matter-failure-existing')).toHaveTextContent('not claimed yet');
    expect(screen.getByTestId('matter-failure-open-device')).toHaveTextContent('Open the device to claim it');
  });

  it('already_commissioned without a record points to a reconciliation or a factory reset', async () => {
    commissioning.getCurrentSession.mockResolvedValue(
      failed('already_commissioned', { existing: { nodeRecordId: null, lifecycleState: null, action: 'reconcile' } }),
    );
    renderMatter('/matter/commissioning');
    expect(await screen.findByTestId('matter-failure-existing')).toHaveTextContent(/reconciliation/);
    expect(screen.queryByTestId('matter-failure-open-device')).not.toBeInTheDocument();
    expect(screen.getByTestId('matter-failure-open-devices')).toBeInTheDocument();
  });
});

describe('the attestation override', () => {
  const attestation = (overrides: Partial<CommissioningSessionView> = {}) =>
    failed('attestation_failed', { attestationFindings: ['PaaNotTrusted'] }, { step: 'attestation', ...overrides });

  async function failAttestation(overrideAvailable: boolean) {
    commissioning.startCommissioning.mockResolvedValue(session({ state: 'pending', step: null, overrideAvailable }));
    commissioning.getSession.mockResolvedValue(attestation({ overrideAvailable }));
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), MANUAL_11);
    await user.click(screen.getByTestId('matter-code-start'));
    return user;
  }

  it('is offered only when the sidecar allows it, behind an explicit confirmation, and retries with the kept code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = await failAttestation(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    expect(await screen.findByTestId('matter-failure-findings')).toHaveTextContent('PaaNotTrusted');
    await user.click(screen.getByTestId('matter-failure-override'));
    const confirm = await screen.findByTestId('matter-override-confirm');
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId('matter-override-dialog')).toHaveTextContent(/counterfeit/);
    await user.click(within(screen.getByTestId('matter-override-dialog')).getByRole('checkbox'));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() =>
      expect(commissioning.startCommissioning).toHaveBeenLastCalledWith({
        setupCode: MANUAL_11,
        attestationOverride: { confirmed: true },
      }),
    );
  });

  it('is not offered when the sidecar does not allow it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await failAttestation(false);
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await screen.findByTestId('matter-failure-attestation_failed');
    expect(screen.queryByTestId('matter-failure-override')).not.toBeInTheDocument();
  });

  it('is not offered without the manage permission', async () => {
    signIn('matter.devices.commission');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await failAttestation(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await screen.findByTestId('matter-failure-attestation_failed');
    expect(screen.queryByTestId('matter-failure-override')).not.toBeInTheDocument();
  });

  it('is not offered after a reload: the code is gone, so the person starts again', async () => {
    commissioning.getCurrentSession.mockResolvedValue(attestation({ overrideAvailable: true }));
    renderMatter('/matter/commissioning');
    await screen.findByTestId('matter-failure-attestation_failed');
    expect(screen.queryByTestId('matter-failure-override')).not.toBeInTheDocument();
  });
});

describe('naming and finishing', () => {
  const done = session({
    state: 'succeeded',
    step: 'completed',
    nodeRecordId: 'node-9',
    endpoints: [
      { endpointId: 1, id: 'ep-1', displayName: null },
      { endpointId: 2, id: 'ep-2', displayName: null },
    ],
    attestation: { status: 'overridden', findings: ['PaaNotTrusted'] },
  });

  it('saves the names and links to the device', async () => {
    commissioning.getCurrentSession.mockResolvedValue(done);
    commissioning.finishSession.mockResolvedValue({ node: node('node-9') });
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    expect(await screen.findByTestId('matter-finish-overridden')).toBeInTheDocument();
    await user.type(screen.getByTestId('matter-finish-name'), ' Lamp ');
    await user.type(screen.getByTestId('matter-finish-location'), 'Workshop');
    await user.type(screen.getByTestId('matter-finish-endpoint-2'), 'Right');
    await user.click(screen.getByTestId('matter-finish-save'));
    await waitFor(() =>
      expect(commissioning.finishSession).toHaveBeenCalledWith(done.id, {
        displayName: 'Lamp',
        location: 'Workshop',
        endpoints: [{ id: 'ep-2', displayName: 'Right' }],
      }),
    );
    await user.click(await screen.findByTestId('matter-finish-open-device'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/matter/devices/node-9'));
  });

  it('marks a name that is too long on its own field and does not save', async () => {
    commissioning.getCurrentSession.mockResolvedValue(done);
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    await user.type(await screen.findByTestId('matter-finish-endpoint-1'), 'x'.repeat(101));
    expect(await screen.findByTestId('matter-finish-endpoint-1-error')).toHaveTextContent('At most 100 characters.');
    expect(screen.queryByTestId('matter-finish-name-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('matter-finish-save')).toBeDisabled();
    expect(screen.getByText('Endpoint 1')).toBeInTheDocument();
  });

  it('shows a refused naming translated', async () => {
    commissioning.getCurrentSession.mockResolvedValue(done);
    commissioning.finishSession.mockRejectedValue(new MatterApiError('Raw.', 409, 'already_finished'));
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    await user.click(await screen.findByTestId('matter-finish-save'));
    expect(await screen.findByTestId('matter-finish-error')).toHaveTextContent('was already named');
  });

  it('can be skipped and then starts over for another device', async () => {
    commissioning.getCurrentSession.mockResolvedValue(done);
    commissioning.finishSession.mockResolvedValue({ node: node('node-9') });
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    await user.click(await screen.findByTestId('matter-finish-skip'));
    await waitFor(() => expect(commissioning.finishSession).toHaveBeenCalledWith(done.id, {}));
    await user.click(await screen.findByTestId('matter-finish-another'));
    expect(await screen.findByTestId('matter-prepare-step')).toBeInTheDocument();
  });
});

describe('a session the backend no longer knows, and failed requests', () => {
  const gone = () => new MatterApiError('Unknown commissioning session.', 404, null);

  it('ends a running session as interrupted when polling gets 404 (the plugin or the API restarted)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'case' }));
    commissioning.getSession.mockRejectedValue(gone());
    renderMatter('/matter/commissioning');
    await screen.findByTestId('matter-progress-step');
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    const failure = await screen.findByTestId('matter-failure-screen');
    expect(failure).toHaveAttribute('data-code', 'interrupted');
    expect(screen.getByTestId('matter-failure-open-devices')).toBeInTheDocument();
    expect(screen.queryByTestId('matter-progress-error')).not.toBeInTheDocument();
    // Nothing is read any more once the session ended here.
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 3)));
    expect(commissioning.getSession).toHaveBeenCalledTimes(1);
  });

  it('shows a failed read translated, keeps reading, and never sends two reads at once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'pase' }));
    commissioning.getSession.mockRejectedValueOnce(new MatterApiError('', 503, 'sidecar_unavailable'));
    renderMatter('/matter/commissioning');
    await screen.findByTestId('matter-progress-step');
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    expect(await screen.findByTestId('matter-progress-error')).toHaveTextContent('cannot be reached');
    // The next read answers late: no second request is sent while it is outstanding.
    let answer: (value: CommissioningSessionView) => void = () => undefined;
    commissioning.getSession.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 5)));
    expect(commissioning.getSession).toHaveBeenCalledTimes(2);
    await act(async () => answer(session({ step: 'attestation' })));
    await waitFor(() => expect(screen.queryByTestId('matter-progress-error')).not.toBeInTheDocument());
    expect(screen.getByTestId('matter-progress-attestation')).toHaveAttribute('data-state', 'running');
  });

  it('drops an answer for a session that was replaced in the meantime', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'pase' }));
    let answer: (value: CommissioningSessionView) => void = () => undefined;
    commissioning.getSession.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    commissioning.cancelSession.mockResolvedValue(failed('cancelled'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderMatter('/matter/commissioning');
    await screen.findByTestId('matter-progress-step');
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await user.click(screen.getByTestId('matter-progress-cancel'));
    await user.click(await screen.findByTestId('matter-progress-cancel-confirm'));
    await screen.findByTestId('matter-failure-cancelled');
    // The read sent before the cancellation answers "running": it must not bring the progress back.
    await act(async () => answer(session({ step: 'case' })));
    expect(screen.getByTestId('matter-failure-cancelled')).toBeInTheDocument();
    expect(screen.queryByTestId('matter-progress-step')).not.toBeInTheDocument();
  });

  it('reports a failed cancellation, and a cancellation of a session the backend lost ends it as interrupted', async () => {
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'case' }));
    commissioning.cancelSession.mockRejectedValueOnce(new MatterApiError('', 0, 'network'));
    const user = userEvent.setup();
    renderMatter('/matter/commissioning');
    await user.click(await screen.findByTestId('matter-progress-cancel'));
    await user.click(await screen.findByTestId('matter-progress-cancel-confirm'));
    const error = await screen.findByTestId('matter-progress-cancel-error');
    expect(error).toHaveTextContent('The server could not be reached');
    expect(screen.getByTestId('matter-progress-step')).toBeInTheDocument();
    commissioning.cancelSession.mockRejectedValueOnce(gone());
    await user.click(screen.getByTestId('matter-progress-cancel'));
    await user.click(await screen.findByTestId('matter-progress-cancel-confirm'));
    expect(await screen.findByTestId('matter-failure-screen')).toHaveAttribute('data-code', 'interrupted');
  });
});

describe('the override retry and the kept code', () => {
  const attestation = (overrideAvailable: boolean) =>
    failed(
      'attestation_failed',
      { attestationFindings: ['PaaNotTrusted'] },
      { step: 'attestation', overrideAvailable },
    );

  it('shows a refused retry (409 busy) on the failure screen and keeps the code for another try', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commissioning.startCommissioning
      .mockResolvedValueOnce(session({ state: 'pending', step: null, overrideAvailable: true }))
      .mockRejectedValueOnce(new MatterApiError('Raw.', 409, 'busy'));
    commissioning.getSession.mockResolvedValue(attestation(true));
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), `${MANUAL_11}{Enter}`);
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await user.click(await screen.findByTestId('matter-failure-override'));
    await user.click(within(screen.getByTestId('matter-override-dialog')).getByRole('checkbox'));
    await user.click(screen.getByTestId('matter-override-confirm'));
    const error = await screen.findByTestId('matter-override-error');
    expect(error).toHaveTextContent('busy with another operation');
    expect(error).not.toHaveTextContent('Raw.');
    expect(commissioning.startCommissioning).toHaveBeenLastCalledWith({
      setupCode: MANUAL_11,
      attestationOverride: { confirmed: true },
    });
    expect(screen.getByTestId('matter-failure-override')).toBeInTheDocument();
  });

  it('drops the code at once when the sidecar does not allow the override', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commissioning.startCommissioning.mockResolvedValue(session({ state: 'pending', step: null }));
    commissioning.getSession.mockResolvedValue(attestation(false));
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), `${MANUAL_11}{Enter}`);
    await screen.findByTestId('matter-progress-step');
    // The sidecar later claims to allow it: the code is gone already, so nothing can be retried with it.
    commissioning.getSession.mockResolvedValue(attestation(true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await screen.findByTestId('matter-failure-attestation_failed');
    expect(screen.queryByTestId('matter-failure-override')).not.toBeInTheDocument();
  });
});

describe('accessibility of the flow', () => {
  it('moves the focus to the heading of each new step, and announces the current step in one status line', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = await openCodeStep();
    expect(screen.getByRole('heading', { name: 'Enter or scan the setup code' })).toHaveFocus();
    await user.type(screen.getByTestId('matter-code-input'), `${MANUAL_11}{Enter}`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Commissioning in progress' })).toHaveFocus());
    const current = screen.getByTestId('matter-progress-current');
    expect(current).toHaveAttribute('role', 'status');
    expect(current).toHaveTextContent('Current step: Finding the device');
    expect(screen.getByTestId('matter-progress-step').querySelector('[aria-live]')).toBeNull();
    commissioning.getSession.mockResolvedValue(failed('pase_failed'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(SESSION_POLL_MS)));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The code was not accepted' })).toHaveFocus());
  });

  it('leaves the focus alone when the page opens on a resumed session', async () => {
    commissioning.getCurrentSession.mockResolvedValue(session({ step: 'case' }));
    renderMatter('/matter/commissioning');
    const heading = await screen.findByRole('heading', { name: 'Commissioning in progress' });
    expect(heading).not.toHaveFocus();
    expect(screen.getByTestId('matter-progress-current')).toHaveTextContent('Current step: Connecting securely');
  });
});

describe('secrets', () => {
  it('never reach browser storage or the URL, and are not shown again once the session runs', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = await openCodeStep();
    await user.type(screen.getByTestId('matter-code-input'), MANUAL_11);
    await user.click(screen.getByTestId('matter-code-start'));
    await screen.findByTestId('matter-progress-step');
    expect(setItem.mock.calls.flat().join(' ')).not.toContain(MANUAL_11);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(MANUAL_11);
    expect(window.location.href).not.toContain(MANUAL_11);
    expect(screen.getByTestId('location').textContent).not.toContain(MANUAL_11);
    expect(document.body.textContent).not.toContain(MANUAL_11);
  });
});

describe('availability', () => {
  it('keeps the family notice and no input while the sidecar does not report commissioning', async () => {
    api.getStatus.mockResolvedValue(status());
    renderMatter('/matter/commissioning');
    expect(await screen.findByTestId('matter-commissioning-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('matter-code-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-commissioning-flow')).not.toBeInTheDocument();
  });

  it('shows the four steps of the flow', async () => {
    renderMatter('/matter/commissioning');
    const steps = await screen.findByTestId('matter-flow-steps');
    expect(steps.textContent).toMatch(/1\. Prepare device.*2\. Enter or scan code.*3\. Progress.*4\. Name and finish/);
  });
});
