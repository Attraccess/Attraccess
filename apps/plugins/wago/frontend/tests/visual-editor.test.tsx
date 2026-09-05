import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { ConfigurationEditor } from '../src/ConfigurationEditor';
import { ConfigurationMetadataChanges } from '../src/ConfigurationChanges';
import type { WagoConfigurationSnapshot } from '../src/api';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
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
  acknowledge: vi.fn(),
  diagnostics: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  getDraft: state.getDraft,
  listPresets: vi.fn(async () => [
    { id: 'pulsed-lock-bank', name: 'Pulsed lock bank', description: 'Pulse output' },
    { id: 'generic-digital-output', name: 'Generic digital output', description: 'Output' },
  ]),
  listConfigurationRevisions: state.history,
  validateConfiguration: state.validate,
  saveDraft: state.save,
  previewPreset: state.preview,
  applyPreset: state.apply,
  publishConfiguration: state.publish,
  reviewConfiguration: state.review,
  previewConfigurationRevision: state.revisionPreview,
  rollbackConfiguration: state.rollback,
  acknowledgeConfigurationRejection: state.acknowledge,
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
  state.validate.mockResolvedValue({ valid: true, errors: [] });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* No layout observer in this DOM fixture. */
      }
      unobserve() {
        /* No layout observer in this DOM fixture. */
      }
      disconnect() {
        /* No layout observer in this DOM fixture. */
      }
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
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const application = { presetId: 'pulsed-lock-bank', channelId: 'output', physicalPointId: 'point' };
    expect(state.save.mock.calls[0][2].presets).toEqual([application]);
    // Reapply through the mounted UI, even when the copied settings are unchanged.
    state.apply.mockResolvedValue({ snapshot: JSON.stringify(candidate) });
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    await user.click(await screen.findByRole('button', { name: 'Copy selected changes to local edits' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][2].presets).toEqual([application, application]);
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
    state.acknowledge.mockImplementation(async () => {
      const saved = { ...revision, rejectionAcknowledgedAt: '2026-09-06', rejectionAcknowledgedBy: 7 };
      state.history.mockResolvedValue({ revisions: [saved], offset: 0, limit: 20 });
      return saved;
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    await waitFor(() => expect(state.acknowledge).toHaveBeenCalledWith(1, 2, 'rejected', '2026-09-05'));
    expect(await screen.findByText(/Rejection acknowledged by user 7/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge rejection of revision 2' })).not.toBeInTheDocument();
  });
});

describe('mounted Modbus configuration', () => {
  async function addMeter() {
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Host' }), 'meter.fixture.invalid');
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    await user.clear(screen.getByRole('textbox', { name: 'Device name' }));
    await user.type(screen.getByRole('textbox', { name: 'Device name' }), 'Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Add Active power from Workshop meter' }));
    return user;
  }

  it('mounts named bindings and saves exact Modbus configuration with stable identities', async () => {
    const user = await addMeter();
    expect(screen.queryByRole('textbox', { name: 'Device ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Connection ID' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modbus device/ })).toHaveTextContent('Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, first] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(first)).toEqual([]);
    expect(first.modbus.devices[0]).toMatchObject({
      name: 'Workshop meter',
      profileId: 'wago-879-3000-unverified',
      profileVersion: 1,
    });
    expect(first.physicalPoints[1]).toMatchObject({
      hardwareProfile: 'modbus',
      channel: 0,
      modbus: { deviceId: first.modbus.devices[0].id, measurementId: 'active-power' },
    });
    expect(first.logicalChannels[1]).toMatchObject({
      physicalPointId: first.physicalPoints[1].id,
      capabilities: ['input', 'measurement'],
      measurement: { unit: 'watt', kind: 'live', scale: 1, offset: 0 },
    });
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Imported energy/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    const [, second] = state.save.mock.calls[1];
    expect(second.physicalPoints[1].id).toBe(first.physicalPoints[1].id);
    expect(second.logicalChannels[1].id).toBe(first.logicalChannels[1].id);
    expect(second.physicalPoints[1].modbus.measurementId).toBe('import-energy');
    expect(second.logicalChannels[1].measurement).toEqual({
      unit: 'watt-hour',
      kind: 'cumulative',
      scale: 1,
      offset: 0,
    });
    expect(second.logicalChannels[0]).toEqual(first.logicalChannels[0]);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('blocks invalid transport and binding edits and displays server validation', async () => {
    const user = await addMeter();
    const port = screen.getByRole('textbox', { name: 'Port' });
    await user.clear(port);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(port, '502');
    state.validate.mockResolvedValue({
      valid: false,
      errors: [{ path: 'modbus.devices[0].unitId', code: 'invalid_modbus', message: 'Fixture unit is unavailable' }],
    });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Workshop meter · unit Id: Fixture unit is unavailable')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText(/existing device and named measurement\/action required/)).toBeInTheDocument();
  });

  it('freezes Modbus controls and rejects saving a dirty editor over a refreshed draft', async () => {
    const user = await addMeter();
    const fresh = {
      controllerId: 1,
      snapshot: JSON.stringify(state.snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: '2026-09-07',
    };
    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], fresh);
    });
    expect(await screen.findByText('Saved draft changed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(state.save).not.toHaveBeenCalled();
  });
});

describe('Modbus output and serial composition', () => {
  it('binds a named action and live measurement, retaining output controls and valid metered payloads', async () => {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'fixture-map');
    profile.actions = [
      {
        id: 'switch',
        name: 'Relay',
        functionCode: 5,
        address: 0,
        addressBase: 0,
        dataType: 'uint16',
        byteOrder: 'big',
        wordOrder: 'big',
        scale: 1,
        offset: 0,
        onValue: 1,
        offValue: 0,
      },
    ];
    const snapshot = {
      ...state.snapshot,
      modbus: {
        profiles: [profile],
        connections: [
          {
            id: 'connection',
            transport: 'tcp',
            host: 'meter.fixture.invalid',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 250,
            queueLimit: 16,
          },
        ],
        devices: [
          {
            id: 'meter',
            name: 'Meter',
            connectionId: 'connection',
            unitId: 1,
            profileId: profile.id,
            profileVersion: 1,
          },
        ],
      },
    };
    state.getDraft.mockResolvedValue({
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: 'initial',
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add Relay from Meter' }));
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Active power/ }));
    await user.click(screen.getAllByRole('checkbox', { name: 'Pulse output' })[1]);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, saved] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.modbus).toEqual(snapshot.modbus);
    expect(saved.physicalPoints[1].modbus).toEqual({
      deviceId: 'meter',
      actionId: 'switch',
      measurementId: 'active-power',
    });
    expect(saved.logicalChannels[1]).toMatchObject({
      profile: 'metered-switched-load',
      capabilities: ['output', 'measurement', 'pulse'],
      pulse: { durationMs: 500 },
      disconnectPolicy: { mode: 'immediate' },
    });
    await user.click(screen.getByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' })).toHaveValue(500);
    await user.click(screen.getByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'Relay' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][1]).toEqual(saved);
  });

  it('uses the actual transport selector to replace TCP fields with valid serial configuration', async () => {
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    await user.click(await screen.findByRole('option', { name: 'rtu' }));
    expect(screen.queryByRole('textbox', { name: 'Host' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, saved] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.modbus.connections[0]).toMatchObject({
      transport: 'rtu',
      path: '/dev/serial',
      baudRate: 19200,
      parity: 'even',
      stopBits: 1,
    });
    expect(saved.modbus.connections[0]).not.toHaveProperty('host');
    expect(saved.modbus.connections[0]).not.toHaveProperty('port');
  });
});

describe('Modbus review regressions', () => {
  function fixture(orphan = false): WagoConfigurationSnapshot {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom-map');
    profile.name = 'Fixture map';
    profile.actions = [
      {
        id: 'relay',
        name: 'Relay',
        functionCode: 5,
        address: 0,
        addressBase: 0,
        dataType: 'uint16',
        byteOrder: 'big',
        wordOrder: 'big',
        scale: 1,
        offset: 0,
        onValue: 1,
        offValue: 0,
      },
    ];
    return {
      version: 1,
      modbus: {
        connections: [
          {
            id: 'bus',
            transport: 'tcp',
            host: 'old.fixture.invalid',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 250,
            queueLimit: 16,
          },
        ],
        devices: [
          { id: 'meter', name: 'Meter', connectionId: 'bus', unitId: 1, profileId: profile.id, profileVersion: 1 },
        ],
        profiles: [profile],
      },
      physicalPoints: [
        {
          id: 'meter-point',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'meter', measurementId: 'active-power' },
        },
      ],
      logicalChannels: orphan
        ? []
        : [
            {
              id: 'reading',
              physicalPointId: 'meter-point',
              profile: 'generic-monitored-input',
              capabilities: ['input', 'measurement'],
              measurement: { unit: 'watt', kind: 'live', scale: 1, offset: 0 },
              disconnectPolicy: { mode: 'watchdog', timeoutMs: 2345 },
              range: { minimum: 0, maximum: 1000 },
            },
          ],
    };
  }
  function draftRecord(snapshot: WagoConfigurationSnapshot, updatedAt = 'initial') {
    return {
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      presetProvenance: JSON.stringify({
        editor: { names: { 'meter-point': 'Spare meter point', reading: 'Meter reading' }, presets: [] },
      }),
      reviewedHash: null,
      updatedAt,
    };
  }
  function start(snapshot: WagoConfigurationSnapshot) {
    state.getDraft.mockResolvedValue(draftRecord(snapshot));
    // Exercise the full backend validator as a read-only oracle for the submitted candidate.
    state.validate.mockImplementation(async (_id, candidate) => {
      const errors = validateEditorSnapshot(candidate);
      return { valid: errors.length === 0, errors };
    });
    mount();
    return userEvent.setup();
  }

  it('replaces a clean focused host authoritatively before the next keystroke', async () => {
    const snapshot = fixture();
    const user = start(snapshot);
    const host = await screen.findByRole('textbox', { name: 'Host' });
    await user.click(host);
    const refreshed = fixture();
    const connection = refreshed.modbus!.connections[0];
    if (connection.transport === 'tcp') connection.host = 'new.fixture.invalid';
    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], draftRecord(refreshed, 'refreshed'));
    });
    expect(host).toHaveFocus();
    await waitFor(() => expect(host).toHaveValue('new.fixture.invalid'));
    await user.keyboard('{End}-edited');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].modbus.connections[0].host).toBe('new.fixture.invalid-edited');
  });

  it('converts a ranged measurement into a plain output without a hidden invalid range', async () => {
    const user = start(fixture());
    await user.click(await screen.findByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'Relay' }));
    expect(screen.getByRole('spinbutton', { name: 'Maximum' })).toHaveValue(1000);
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const saved = state.save.mock.calls[0][1];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.logicalChannels[0]).toMatchObject({
      id: 'reading',
      physicalPointId: 'meter-point',
      profile: 'generic-digital-output',
      capabilities: ['output'],
    });
    expect(saved.logicalChannels[0]).not.toHaveProperty('range');
    expect(saved.logicalChannels[0]).not.toHaveProperty('measurement');
  });

  it('retains the customized input disconnect policy when selecting another measurement', async () => {
    const user = start(fixture());
    await user.click(await screen.findByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Imported energy/ }));
    expect(screen.getByRole('spinbutton', { name: 'Watchdog timeout (ms)' })).toHaveValue(2345);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].logicalChannels[0]).toMatchObject({
      id: 'reading',
      disconnectPolicy: { mode: 'watchdog', timeoutMs: 2345 },
      range: { minimum: 0, maximum: 1000 },
    });
  });

  it('exposes an orphan binding for repair after map deletion and release after device deletion', async () => {
    const user = start(fixture(true));
    await user.click(await screen.findByText('Fixture map v1', { selector: 'summary' }));
    await user.click(screen.getAllByRole('button', { name: 'Remove measurement' })[0]);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Imported energy/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].physicalPoints[0]).toMatchObject({
      id: 'meter-point',
      modbus: { measurementId: 'import-energy' },
    });
    expect(state.save.mock.calls[0][1].logicalChannels).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Release Spare meter point/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][1].physicalPoints).toEqual([]);
  });
});
