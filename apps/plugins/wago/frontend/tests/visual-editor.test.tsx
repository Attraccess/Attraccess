import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { ConfigurationEditor } from '../src/ConfigurationEditor';
import { ConfigurationMetadataChanges } from '../src/ConfigurationChanges';
import type { WagoConfigurationSnapshot } from '../src/api';
import type { WagoDiagnostics } from '../src/diagnostics';

const state = vi.hoisted(() => ({
  snapshot: {
    version: 1,
    physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
    logicalChannels: [
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  },
  save: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  publish: vi.fn(),
  review: vi.fn(),
  history: vi.fn(),
  revisionPreview: vi.fn(),
  getDraft: vi.fn(),
  rollback: vi.fn(),
  diagnostics: vi.fn(),
}));
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  getDraft: state.getDraft,
  listPresets: vi.fn(async () => [
    { id: 'pulsed-lock-bank', name: 'Pulsed lock bank', description: 'Pulse output' },
    { id: 'generic-digital-output', name: 'Generic digital output', description: 'Output' },
  ]),
  listConfigurationRevisions: state.history,
  validateConfiguration: vi.fn(async () => ({ valid: true, errors: [] })),
  saveDraft: state.save,
  previewPreset: state.preview,
  applyPreset: state.apply,
  publishConfiguration: state.publish,
  reviewConfiguration: state.review,
  previewConfigurationRevision: state.revisionPreview,
  rollbackConfiguration: state.rollback,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function diagnosticsFixture(controllerId = 1): WagoDiagnostics {
  return {
    controllerId,
    generatedAt: new Date().toISOString(),
    name: `Fixture controller ${controllerId}`,
    connectivity: 'online',
    heartbeatAt: new Date().toISOString(),
    heartbeatFreshness: 'fresh',
    runtimeVersion: '1.0.0',
    protocolVersion: '1.0.0',
    capabilities: [],
    incompatible: false,
    sequenceGaps: null,
    sequenceExplanation: 'Fixture source',
    activeStream: null,
    trackingExhausted: false,
    stateConnected: true,
    stateHardwareAvailable: null,
    stateSourceAt: null,
    configuration: {
      draftUpdatedAt: null,
      draftChanged: false,
      validationErrorCount: 0,
      validationCodes: [],
      validationErrors: [],
      rejectionErrors: [],
      publishedRevision: 1,
      publishedState: 'applied',
      appliedRevision: 1,
      reportedRevision: 1,
      revisionMismatch: false,
      rejected: false,
    },
    hardwareReadiness: 'unknown',
    hardwareReadinessReason: 'An applied revision is not physical I/O proof.',
    channels: [],
    faults: [],
    references: [],
    referencesTruncated: false,
    events: [],
    limitations: [],
  };
}

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      if (/\/api\/wago\/controllers\/\d+\/diagnostics$/.test(url) && !options?.method)
        return state.diagnostics(url, options);
      throw new Error('Unexpected network access in visual editor test');
    }),
  );
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
  });
  state.diagnostics.mockImplementation(async (url: string) => {
    const controllerId = Number(/controllers\/(\d+)/.exec(url)?.[1]);
    return new Response(JSON.stringify(diagnosticsFixture(controllerId)));
  });
  state.history.mockResolvedValue({ revisions: [], offset: 0, limit: 20 });
  state.getDraft.mockResolvedValue({
    controllerId: 1,
    snapshot: JSON.stringify(state.snapshot),
    reviewedHash: null,
    presetProvenance: JSON.stringify({ editor: { names: { output: 'Door lock', point: 'DO1' }, presets: [] } }),
    updatedAt: '2026-09-05',
  });
  state.save.mockImplementation(async (_id, snapshot, metadata) => ({
    controllerId: 1,
    snapshot: JSON.stringify(snapshot),
    presetProvenance: JSON.stringify({ editor: metadata }),
    reviewedHash: null,
    updatedAt: '2026-09-05',
  }));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function mount() {
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ConfigurationEditor controllerId={1} onOpenChange={close} />
    </QueryClientProvider>,
  );
  return close;
}

describe('visual configuration workflow', () => {
  it('embeds real diagnostics polling without saving local edits or duplicating configuration controls', async () => {
    mount();
    const user = userEvent.setup();
    expect(await screen.findByText('Fixture controller 1: online')).toBeInTheDocument();
    expect(screen.getAllByText(/Hardware readiness: unknown/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open configuration' })).not.toBeInTheDocument();
    expect(state.diagnostics).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/wago\/controllers\/1\/diagnostics$/),
      expect.objectContaining({ credentials: 'include' }),
    );
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    await user.clear(name);
    await user.type(name, 'Unsaved diagnostic session');
    state.diagnostics.mockClear();
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    await waitFor(() => expect(state.diagnostics).toHaveBeenCalledTimes(1));
    expect(name).toHaveValue('Unsaved diagnostic session');
    expect(screen.getByText(/Unsaved local edits/)).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('hides cached online status on polling failure and recovers without losing local edits', async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByText('Fixture controller 1: online');
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    await user.clear(name);
    await user.type(name, 'Keep my draft');
    state.diagnostics.mockResolvedValue(new Response('{}', { status: 503 }));
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    expect(await screen.findByText(/Diagnostics unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Fixture controller 1: online')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hardware readiness:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(name).toHaveValue('Keep my draft');
    state.diagnostics.mockImplementation(async () => new Response(JSON.stringify(diagnosticsFixture())));
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    expect(await screen.findByText('Fixture controller 1: online')).toBeInTheDocument();
    expect(name).toHaveValue('Keep my draft');
    expect(state.save).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('scopes diagnostics to the selected controller and removes it when the editor closes', async () => {
    const view = (controllerId: number | null) => (
      <QueryClientProvider client={client}>
        <ConfigurationEditor controllerId={controllerId} onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1));
    await screen.findByText('Fixture controller 1: online');
    rerender(view(2));
    expect(await screen.findByText('Fixture controller 2: online')).toBeInTheDocument();
    expect(screen.queryByText('Fixture controller 1: online')).not.toBeInTheDocument();
    rerender(view(null));
    expect(screen.queryByRole('region', { name: 'Controller diagnostics' })).not.toBeInTheDocument();
    expect(
      client
        .getQueryCache()
        .find({ queryKey: ['wago', 'diagnostics', 1] })
        ?.getObserversCount(),
    ).toBe(0);
    expect(
      client
        .getQueryCache()
        .find({ queryKey: ['wago', 'diagnostics', 2] })
        ?.getObserversCount(),
    ).toBe(0);
  });

  it('renders literal editor names in metadata changes', () => {
    render(
      <ConfigurationMetadataChanges
        changes={[{ path: '$.names.output', previous: 'Pump-A', current: 'Pump A' }]}
        names={{ output: 'Pump A' }}
      />,
    );

    expect(screen.getByText('Before: Pump-A')).toBeInTheDocument();
    expect(screen.getByText('After: Pump A')).toBeInTheDocument();
  });

  it.each(['success', 'delivery failure', 'refresh failure'] as const)(
    'reconciles rollback after %s and sends the previewed draft identity',
    async (outcome) => {
      const revision = {
        revision: 1,
        contentHash: 'historical',
        state: 'applied',
        publishedAt: '2026-09-05',
        reportedAt: '2026-09-05',
        rejectionErrors: null,
        snapshot: JSON.stringify(state.snapshot),
      };
      state.history.mockResolvedValue({ revisions: [revision], offset: 0, limit: 20 });
      state.revisionPreview.mockResolvedValue({
        revision,
        current: revision,
        draftHash: 'snapshot-and-metadata',
        diff: [],
        impacts: [],
      });
      state.rollback.mockImplementation(async () => {
        if (outcome === 'refresh failure') state.getDraft.mockRejectedValue(new Error('refresh unavailable'));
        else
          state.getDraft.mockResolvedValue({
            controllerId: 1,
            snapshot: JSON.stringify({
              ...state.snapshot,
              logicalChannels: [
                { ...state.snapshot.logicalChannels[0], pulse: { durationMs: 250 }, capabilities: ['output', 'pulse'] },
              ],
            }),
            presetProvenance: JSON.stringify({
              editor: { names: { output: 'Persisted rollback', point: 'DO1' }, presets: [] },
            }),
            reviewedHash: 'historical',
            updatedAt: '2026-09-05',
          });
        state.history.mockResolvedValue({
          revisions: [{ ...revision, revision: 2, state: outcome === 'success' ? 'published' : 'pending' }, revision],
          offset: 0,
          limit: 20,
        });
        if (outcome !== 'success') throw new Error('delivery failed');
        return { ...revision, revision: 2 };
      });
      mount();
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Channel name' });
      await user.click(await screen.findByRole('button', { name: 'Preview rollback to revision 1' }));
      await user.click(await screen.findByRole('button', { name: 'Publish rollback as new revision' }));
      await waitFor(() =>
        expect(state.rollback).toHaveBeenCalledWith(1, 1, false, 'historical', 'historical', 'snapshot-and-metadata'),
      );
      if (outcome === 'refresh failure') {
        expect(await screen.findByText(/Could not reconcile the saved draft after rollback/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
        expect(screen.queryByRole('textbox', { name: 'Channel name' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
      } else {
        await waitFor(() =>
          expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Persisted rollback'),
        );
        expect(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' })).toHaveValue(250);
        expect(screen.queryByRole('button', { name: 'Publish rollback as new revision' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Publish reviewed draft' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
        if (outcome === 'delivery failure') {
          expect(screen.getByText('delivery failed')).toBeInTheDocument();
          expect(screen.getByText(/Pending delivery/)).toBeInTheDocument();
        }
      }
      expect(state.save).not.toHaveBeenCalled();
    },
  );

  it('can save after clearing and then removing a channel name', async () => {
    mount();
    const user = userEvent.setup();
    await user.clear(await screen.findByRole('textbox', { name: 'Channel name' }));
    await user.click(screen.getByRole('button', { name: 'Remove channel' }));
    await user.click(screen.getByRole('button', { name: /Release DO1/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].logicalChannels).toEqual([]);
    expect(state.save.mock.calls[0][2].names.output).toBeUndefined();
  });

  it('uses labelled terminals, keeps names outside the snapshot, and saves only explicitly', async () => {
    mount();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    expect(screen.queryByRole('textbox', { name: /JSON|Editable configuration draft/i })).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Workshop lock');
    expect(state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, snapshot, metadata] = state.save.mock.calls[0];
    expect(snapshot.logicalChannels[0].id).toBe('output');
    expect(snapshot.physicalPoints[0].channel).toBe(0);
    expect(metadata.names.output).toBe('Workshop lock');
    expect(JSON.stringify(snapshot)).not.toContain('Workshop lock');
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('reloads a refreshed saved draft while clean and blocks dirty local edits from overwriting it', async () => {
    mount();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    const cleanRefresh = {
      controllerId: 1,
      snapshot: JSON.stringify(state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Clean refresh', point: 'DO1' }, presets: [] } }),
      reviewedHash: null,
      updatedAt: '2026-09-06',
    };
    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], cleanRefresh);
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Clean refresh'));
    await user.clear(name);
    await user.type(name, 'Local edit');
    const refreshed = {
      controllerId: 1,
      snapshot: JSON.stringify(state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Saved elsewhere', point: 'DO1' }, presets: [] } }),
      reviewedHash: null,
      updatedAt: '2026-09-07',
    };
    state.getDraft.mockResolvedValue(refreshed);

    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], refreshed);
    });

    expect(await screen.findByText('Saved draft changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload saved draft' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Saved elsewhere'));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('blocks Save draft while copying a preset and leaves copied settings unsaved', async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Channel name' });
    const snapshot = state.snapshot as WagoConfigurationSnapshot;
    const candidate = {
      ...snapshot,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          pulse: { durationMs: 500 },
          capabilities: ['output', 'pulse'],
          profile: 'pulsed-lock-bank',
        },
      ],
    };
    state.preview.mockResolvedValue({
      draftHash: 'test-preview',
      snapshot: candidate,
      diff: [{ path: '$.logicalChannels[0].pulse', current: { durationMs: 500 } }],
      errors: [],
    });
    const pending = deferred<{ snapshot: string }>();
    state.apply.mockReturnValue(pending.promise);
    await user.click(screen.getByRole('button', { name: /Preset/ }));
    await user.click(await screen.findByRole('option', { name: 'Pulsed lock bank' }));
    await user.click(screen.getByRole('button', { name: /Apply to channel/ }));
    await user.click(await screen.findByRole('option', { name: 'Door lock' }));
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    await user.click(await screen.findByRole('button', { name: 'Copy selected changes to local edits' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled());
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ snapshot: JSON.stringify(candidate) });
    });
    await screen.findByRole('spinbutton', { name: 'Pulse duration (ms)' });
    expect(screen.getByText(/Unsaved local edits/)).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('freezes editing and close during publication and keeps readiness unknown', async () => {
    const close = mount();
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Channel name' });
    state.review.mockResolvedValue({
      draft: { snapshot: JSON.stringify(state.snapshot), reviewedHash: 'reviewed' },
      previous: null,
      changed: true,
      diff: [],
      impacts: [],
    });
    const pending = deferred<unknown>();
    state.publish.mockReturnValue(pending.promise);
    await user.click(screen.getByRole('button', { name: 'Review saved draft' }));
    await user.click(await screen.findByRole('button', { name: 'Publish reviewed draft' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled());
    expect(screen.getByRole('textbox', { name: 'Channel name' })).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ revision: 1, state: 'rejected' });
    });
    expect(await screen.findByText(/Hardware readiness: unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the controller report/)).not.toBeInTheDocument();
  });

  it('renders controller rejection fields with the rejected channel name and human field label', async () => {
    const revision = {
      revision: 2,
      state: 'rejected',
      contentHash: 'rejected',
      snapshot: JSON.stringify(state.snapshot),
      publishedAt: '2026-09-05',
      reportedAt: '2026-09-05',
      rejectionErrors: JSON.stringify([
        {
          path: 'logicalChannels[0].physicalPointId',
          code: 'direction_mismatch',
          message: 'Select a compatible terminal',
        },
      ]),
    };
    state.history.mockResolvedValue({ revisions: [revision], offset: 0, limit: 20 });
    state.revisionPreview.mockResolvedValue({ revision, current: revision, diff: [], impacts: [] });
    mount();
    expect(await screen.findByText('Door lock · Physical terminal: Select a compatible terminal')).toBeInTheDocument();
    expect(screen.getByText(/Rejected by controller/)).toBeInTheDocument();
    expect(screen.queryByText(/logicalChannels\[0\]/)).not.toBeInTheDocument();
  });
});
