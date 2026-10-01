// Tests live controls and apply behavior with isolated controller endpoints.
// FEATURE: WAGO front panel edits never replace applied control routing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { FrontPanel } from '../src/front-panel/FrontPanel';
import { useFrontPanel } from '../src/front-panel/useFrontPanel';
import { DIGITAL_TERMINALS } from '../../backend/configuration-digital';
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
vi.mock('../src/api', async (original) => ({
  ...(await original<typeof import('../src/api')>()),
  getDraft: api.getDraft,
  getConfigurationBaseline: api.baseline,
  saveDraft: api.save,
  validateConfiguration: api.validate,
  reviewConfiguration: api.review,
  publishConfiguration: api.publish,
  manualCommand: api.manual,
}));
vi.mock('../src/diagnostics', () => ({ useWagoDiagnostics: () => api.diagnostics() }));

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
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
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
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
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
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
    await screen.findByText('CC100 onboard I/O');
    for (const terminal of DIGITAL_TERMINALS) expect(screen.getByText(terminal.label)).toBeTruthy();
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Integrierte CC100-Ein- und Ausgänge')).toBeTruthy();
    expect(screen.getByText('Laser power')).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('translates the shared bus baud rate while its drawer is open', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'RS-485 port · 9600 E1' }));
    expect(await screen.findByText('Baud rate')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Baudrate')).toBeTruthy();
    expect(document.body.textContent).not.toContain('!!!');
  });

  it('cancels a new device without changing the working configuration', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper });
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
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.pending).toBe(true);
    expect(result.current.live.enabled).toBe(false);
  });

  it('keeps live commands on the applied channel and revision while edits are unapplied', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
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

  it('saves, reviews and publishes from one apply action and retains the revision acknowledgement wait', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.edit(
        updateTerminal(required(result.current.configuration), DIGITAL_TERMINALS[0], 'Renamed output', {}),
      ),
    );
    act(() => result.current.apply());
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(1, false, 'reviewed'));
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(1, expect.anything(), expect.anything(), draft);
    await waitFor(() => expect(result.current.pending).toBe(true));
  });

  it('requires flow impact confirmation before publication', async () => {
    api.review.mockResolvedValue({
      draft: { ...draft, reviewedHash: 'reviewed' },
      impacts: [{ channelId: 'output', references: [{ resourceId: 1, nodeId: 'flow' }] }],
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review?.impacts).toHaveLength(1));
    expect(api.publish).not.toHaveBeenCalled();
    act(() => result.current.confirmApply());
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
  });

  it('discards persisted draft changes back to the applied configuration', async () => {
    api.getDraft.mockResolvedValue({ ...draft, snapshot: JSON.stringify({ ...snapshot, logicalChannels: [] }) });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
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
