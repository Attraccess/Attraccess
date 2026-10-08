// Tests live controls and apply behavior with isolated controller endpoints.
// FEATURE: WAGO front panel edits never replace applied control routing.
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeasurement } from '../../measurement-contract';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { FrontPanel } from '../src/front-panel/FrontPanel';
import { addDevice } from '../src/front-panel/model';
import { useFrontPanel } from '../src/front-panel/useFrontPanel';
import { DIGITAL_TERMINALS } from '../../backend/configuration/digital';
import { updateTerminal } from '../src/front-panel/model';

const api = vi.hoisted(() => ({
  getDraft: vi.fn(),
  baseline: vi.fn(),
  save: vi.fn(),
  validate: vi.fn(),
  review: vi.fn(),
  publish: vi.fn(),
  manual: vi.fn(),
  diagnostics: vi.fn(),
}));
vi.mock('../src/api/client', async (original) => ({
  ...(await original<typeof import('../src/api/client')>()),
  getDraft: api.getDraft,
  getConfigurationBaseline: api.baseline,
  saveDraft: api.save,
  validateConfiguration: api.validate,
  reviewConfiguration: api.review,
  publishConfiguration: api.publish,
  manualCommand: api.manual,
}));
vi.mock('../src/diagnostics/diagnostics', () => ({ useWagoDiagnostics: () => api.diagnostics() }));

const snapshot = {
  version: 1,
  physicalPoints: [{ id: 'relay', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'output',
      physicalPointId: 'relay',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'hold' },
    },
  ],
};
const draft = {
  controllerId: 1,
  snapshot: JSON.stringify(snapshot),
  presetProvenance: JSON.stringify({ editor: { names: { output: 'Laser power' }, presets: [] } }),
  updatedAt: '2026-09-30T10:00:00.000Z',
  reviewedHash: null,
};
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

it('shows all meter sections and keeps available phases current when one register faults', async () => {
  const configuration = addDevice(
    { snapshot: { version: 1, physicalPoints: [], logicalChannels: [] }, metadata: { names: {}, presets: [] } },
    'Three-phase meter',
  ).configuration;
  const meterDraft = {
    ...draft,
    snapshot: JSON.stringify(configuration.snapshot),
    presetProvenance: JSON.stringify({ editor: configuration.metadata }),
  };
  api.getDraft.mockResolvedValue(meterDraft);
  api.baseline.mockResolvedValue({ ...meterDraft, revision: 7, state: 'applied' });
  const data = api.diagnostics().data;
  api.diagnostics.mockReturnValue({
    ...api.diagnostics(),
    data: {
      ...data,
      channels: configuration.snapshot.logicalChannels.map((channel) => {
        const point = configuration.snapshot.physicalPoints.find((point) => point.id === channel.physicalPointId);
        const measurement = BUILTIN_MODBUS_PROFILES[0].measurements.find((m) => m.id === point?.modbus?.measurementId);
        if (!measurement) throw new Error('Missing measurement fixture');
        const fault = measurement.id === 'ct-ratio' ? { code: 'modbus_exception' } : null;
        const value = measurement.id === 'meter-code' ? 0x1112 : measurement.id === 'frequency' ? 50.123 : 0;
        return {
          id: channel.id,
          current: !fault,
          fault,
          samples: [
            {
              ...encodeMeasurement(channel.id, value, {
                unit: measurement.unit,
                scale: 1,
                offset: 0,
                kind: measurement.kind,
              }),
              kind: 'measurement',
              current: !fault,
            },
          ],
        };
      }),
    },
  });
  render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
  await screen.findByText('L2 voltage');
  expect(screen.getByText('L3 voltage')).toBeTruthy();
  expect(screen.getByText('50.123 Hz')).toBeTruthy();
  expect(screen.getByLabelText('Online')).toBeTruthy();
  expect(screen.queryByText(/No response from address/)).toBeNull();
  expect(screen.getByText('Some registers could not be read. Available readings remain current.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Active energy & tariffs' }));
  expect(await screen.findByText('Imported energy T4')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Meter information & settings' }));
  expect(await screen.findByText('0x1112')).toBeTruthy();
});

beforeEach(() => {
  vi.clearAllMocks();
  useTranslationState.getState().setLanguage('en');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.getDraft.mockResolvedValue(draft);
  api.baseline.mockResolvedValue({ ...draft, revision: 7, state: 'applied' });
  api.save.mockImplementation(async (_id, snapshot, metadata) => ({
    ...draft,
    snapshot: JSON.stringify(snapshot),
    presetProvenance: JSON.stringify({ editor: metadata }),
  }));
  api.validate.mockResolvedValue({ valid: true, errors: [] });
  api.review.mockResolvedValue({ draft: { ...draft, reviewedHash: 'reviewed' }, impacts: [] });
  api.publish.mockResolvedValue({ revision: 8, state: 'published' });
  api.manual.mockResolvedValue({ result: 'acknowledged' });
  api.diagnostics.mockReturnValue({
    isSuccess: true,
    data: {
      name: 'Workshop CC100',
      connectivity: 'online',
      capabilities: ['front-panel-v1'],
      incompatible: false,
      manualOutputChannelIds: [],
      channels: [{ id: 'output', samples: [{ kind: 'output', value: false, current: true }] }],
      configuration: { appliedRevision: 7, revisionMismatch: false, rejected: false },
    },
    refetch: vi.fn(),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* No layout in jsdom. */
      }
      unobserve() {
        /* No layout in jsdom. */
      }
      disconnect() {
        /* No layout in jsdom. */
      }
    },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test fixture value');
  return value;
}

describe('front panel', () => {
  it('exposes an interactive output switch and sends a manual command when clicked', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    const control = await screen.findByRole('switch', { name: 'Switch DO1 Laser power' });
    await waitFor(() => expect(control.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(control);
    await waitFor(() =>
      expect(api.manual).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ channelId: 'output', action: 'set', value: true, expectedConfigurationRevision: 7 }),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes an interactive input inversion switch in the terminal settings', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Configure DI1' }));
    const control = await screen.findByRole('switch', { name: 'Invert input' });
    fireEvent.click(control);
    expect(control).toHaveProperty('checked', true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Door contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to controller' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          logicalChannels: expect.arrayContaining([expect.objectContaining({ invert: true })]),
        }),
        expect.anything(),
        draft,
      ),
    );
  });

  it('shows every terminal and switches languages through the host store', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    await screen.findByText('CC100 onboard I/O');
    for (const terminal of DIGITAL_TERMINALS) expect(screen.getByText(terminal.label)).toBeTruthy();
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Integrierte CC100-Ein- und Ausgänge')).toBeTruthy();
    expect(screen.getByText('Laser power')).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('translates the shared bus baud rate while its drawer is open', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'RS-485 port · 9600 E1' }));
    expect(await screen.findByText('Baud rate')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Baudrate')).toBeTruthy();
    expect(document.body.textContent).not.toContain('!!!');
  });

  it('cancels a new device without changing the working configuration', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Modbus device' }, { timeout: 10000 }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('retains the pending apply state when returning to the page', async () => {
    api.diagnostics.mockReturnValue({
      isSuccess: true,
      data: {
        connectivity: 'online',
        capabilities: ['front-panel-v1'],
        channels: [],
        configuration: {
          appliedRevision: 7,
          publishedRevision: 8,
          publishedState: 'published',
          revisionMismatch: false,
          rejected: false,
        },
      },
      refetch: vi.fn(),
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.pending).toBe(true);
    expect(result.current.live.enabled).toBe(false);
  });

  it('keeps live commands on the applied channel and revision while edits are unapplied', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const configuration = required(result.current.configuration);
    act(() =>
      result.current.edit(
        updateTerminal(configuration, DIGITAL_TERMINALS[0], 'Door lock', {
          capabilities: ['output', 'pulse'],
          pulse: { durationMs: 3000 },
        }),
      ),
    );
    expect(result.current.dirty).toBe(true);
    act(() => result.current.live.command(required(result.current.applied).snapshot.logicalChannels[0], true));
    await waitFor(() =>
      expect(api.manual).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ channelId: 'output', action: 'set', value: true, expectedConfigurationRevision: 7 }),
      ),
    );
    expect(api.save).not.toHaveBeenCalled();
  });

  it('preserves a saved unapplied draft when another session applies a new revision', async () => {
    const savedDraft = {
      ...draft,
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Saved draft name' }, presets: [] } }),
    };
    api.getDraft.mockResolvedValue(savedDraft);
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.configuration?.metadata.names.output).toBe('Saved draft name');
    act(() =>
      client.setQueryData(['wago', 'configuration-baseline', 1], {
        ...draft,
        presetProvenance: JSON.stringify({ editor: { names: { output: 'External applied name' }, presets: [] } }),
        revision: 8,
        state: 'applied',
      }),
    );
    await waitFor(() => expect(result.current.applied?.metadata.names.output).toBe('External applied name'));
    expect(result.current.configuration?.metadata.names.output).toBe('Saved draft name');
    expect(result.current.dirty).toBe(true);
  });

  it('requires confirmation even without flow impacts and retains the revision acknowledgement wait', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.edit(
        updateTerminal(required(result.current.configuration), DIGITAL_TERMINALS[0], 'Renamed output', {}),
      ),
    );
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(api.publish).not.toHaveBeenCalled();
    act(() => result.current.confirmApply());
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(1, expect.anything(), expect.anything(), draft);
    await waitFor(() => expect(result.current.pending).toBe(true));
  });

  it.each([
    { value: true, current: true, label: 'HIGH (on)' },
    { value: false, current: true, label: 'LOW (off)' },
    { value: true, current: false, label: 'State unavailable' },
  ])('shows $label and allows confirmation regardless of output state', async ({ value, current, label }) => {
    const diagnostics = api.diagnostics();
    diagnostics.data.channels[0].samples[0] = { kind: 'output', value, current };
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /^Configure DO1/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Changed label' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to controller' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apply configuration?' });
    expect(within(dialog).getByText(label)).toBeTruthy();
    expect(dialog.textContent).toContain('DO1 · Laser power');
    expect(api.publish).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: 'Apply to controller' });
    await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
  });

  it('cancels apply confirmation without publishing', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review).not.toBeNull());
    act(() => result.current.cancelReview());
    expect(result.current.review).toBeNull();
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('requires flow impact confirmation before publication', async () => {
    api.review.mockResolvedValue({
      draft: { ...draft, reviewedHash: 'reviewed' },
      impacts: [{ channelId: 'output', references: [{ resourceId: 1, nodeId: 'flow' }] }],
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review?.impacts).toHaveLength(1));
    expect(api.publish).not.toHaveBeenCalled();
    act(() => result.current.confirmApply());
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
  });

  it('discards persisted draft changes back to the applied configuration', async () => {
    api.getDraft.mockResolvedValue({
      ...draft,
      snapshot: JSON.stringify({ ...snapshot, logicalChannels: [] }),
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: wrapper });
    await waitFor(() => expect(result.current.dirty).toBe(true));
    act(() => result.current.discard());
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(api.save).toHaveBeenCalledWith(
      1,
      snapshot,
      { names: { output: 'Laser power' }, presets: [] },
      expect.objectContaining({ snapshot: JSON.stringify({ ...snapshot, logicalChannels: [] }) }),
    );
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('disables live commands when diagnostics fail or the runtime lacks support', async () => {
    api.diagnostics.mockReturnValue({ isSuccess: false, data: undefined, refetch: vi.fn() });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.live.enabled).toBe(false);
  });
});
