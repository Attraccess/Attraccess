// Register API mocks before the editor and its fixture helpers are imported.
import { state } from './visual-editor.test.state';
import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import type { WagoConfigurationSnapshot } from '../src/api';
import { ConfigurationEditor } from '../src/ConfigurationEditor';
import { ConfigurationMetadataChanges } from './../src/ConfigurationChanges';
import { deferred, diagnosticsFixture, resetTestFixture } from './visual-editor.setup.test-fixture.helpers';
import { section } from './visual-editor.test.external.helpers';

let client: QueryClient;

function mount(liveClient: PluginLiveUpdatesClient | null = null) {
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PluginLiveUpdatesProvider client={liveClient}>
        <ConfigurationEditor controllerId={1} onOpenChange={close} />
      </PluginLiveUpdatesProvider>
    </QueryClientProvider>,
  );
  return close;
}

function getSetupScope() {
  return {
    get state() {
      return state;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    diagnosticsFixture,
  };
}

const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');

beforeAll(() => {
  // JSDOM has no layout scrolling; React Aria calls this when opening a collection.
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(Element.prototype, 'scrollTo');
});

beforeEach(() => {
  resetTestFixture(getSetupScope());
});

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.unstubAllGlobals();
});

describe('visual configuration workflow', () => {
  it('switches diagnostic status values with the host language while preserving source identifiers', async () => {
    const diagnostics = diagnosticsFixture();
    diagnostics.capabilities = ['input', 'measurement', 'vendor.capability-v2'];
    diagnostics.hardwareReadinessReason =
      'Reported hardware availability is shown when supplied; it does not prove physical I/O readiness. Applied configuration and cached output state are not physical proof.';
    diagnostics.channels = [
      {
        id: 'sensor.v1',
        profile: 'generic-digital-output',
        capabilities: ['output', 'pulse', 'vendor.channel-v2'],
        disconnectPolicy: { mode: 'hold' },
        safeState: 'off (runtime default)',
        samples: [
          {
            kind: 'output',
            value: true,
            sourceAt: null,
            sourceFreshness: 'stale',
            receivedAt: '2026-09-06T18:00:00.000Z',
            streamId: 'boot.v1',
            sequence: 1,
            current: false,
            availabilityReason: 'vendor.diagnostic-v2',
          },
          {
            kind: 'measurement',
            value: 12.4,
            unit: 'volt',
            measurementKind: 'live',
            sourceAt: null,
            sourceFreshness: 'fresh',
            receivedAt: '2026-09-06T18:00:00.000Z',
            streamId: 'boot.v1',
            sequence: 2,
            current: false,
            availabilityReason: 'configuration-mismatch',
          },
        ],
        current: false,
        fault: null,
        acknowledgement: null,
      },
    ];
    state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostics)));
    mount();
    await section(userEvent.setup(), 'Diagnostics');
    expect(await screen.findByText(/Permanent heartbeat:.*\(fresh\)/)).toBeInTheDocument();
    expect(screen.getByText('Capabilities: input, measurement, vendor.capability-v2')).toBeInTheDocument();
    expect(
      screen.getByText('Setup preset: Generic digital output · Capabilities: output, pulse, vendor.channel-v2'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Latest output:/)).toBeInTheDocument();
    expect(screen.getByText(/Latest measurement: 12.4 volt live/)).toBeInTheDocument();
    expect(screen.getByText('Safe state: off (runtime default). Disconnect: hold.')).toBeInTheDocument();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/Dauerhaftes Lebenszeichen:.*\(Aktuell\)/)).toBeInTheDocument();
    expect(screen.getByText(/Quellzeit:.*\(Veraltet\)/)).toBeInTheDocument();
    expect(screen.getByText('Funktionen: Eingang, Messwert, vendor.capability-v2')).toBeInTheDocument();
    expect(screen.getByText(/Funktionen: Ausgang, Impuls, vendor.channel-v2/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Einrichtungsvorlage: Allgemeiner digitaler Ausgang · Funktionen: Ausgang, Impuls, vendor.channel-v2',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Letzter Wert für Ausgang:/)).toBeInTheDocument();
    expect(screen.getByText(/Letzter Wert für Messwert: 12.4 Volt Aktuell/)).toBeInTheDocument();
    expect(screen.getByText(/nicht aktuell: Konfigurationsabweichung/)).toBeInTheDocument();
    expect(screen.getByText(/Gemeldete Hardware-Verfügbarkeit/)).toBeInTheDocument();
    expect(
      screen.getByText('Sicherer Zustand: Aus (Standard der Laufzeitumgebung). Bei Verbindungsabbruch: Halten.'),
    ).toBeInTheDocument();
    expect(screen.getByText('sensor.v1')).toBeInTheDocument();
    expect(screen.getByText(/vendor\.diagnostic-v2/)).toBeInTheDocument();
    expect(screen.getAllByText(/boot\.v1/)).toHaveLength(2);
    expect(state.diagnostics).toHaveBeenCalledTimes(1);
  });

  it('localizes acknowledgement and protocol event dates when the host language changes', async () => {
    const diagnostics = diagnosticsFixture();
    diagnostics.channels = [
      {
        id: 'sensor.v1',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'hold' },
        safeState: 'on',
        samples: [],
        current: false,
        fault: null,
        acknowledgement: { id: 'command.v1', status: 'accepted', receivedAt: '2026-09-06T18:24:00.000Z' },
      },
    ];
    diagnostics.events = [{ kind: 'state.changed', receivedAt: '2026-09-06T18:25:00.000Z' }];
    state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostics)));
    mount();
    await section(userEvent.setup(), 'Diagnostics');
    expect(await screen.findByText(/command\.v1/)).toHaveTextContent('9/6/2026');
    expect(screen.getByText(/state\.changed/)).toHaveTextContent('9/6/2026');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/command\.v1/)).toHaveTextContent('6.9.2026');
    expect(screen.getByText(/command\.v1/)).toHaveTextContent('Akzeptiert');
    expect(screen.getByText(/state\.changed/)).toHaveTextContent('6.9.2026');
    expect(state.diagnostics).toHaveBeenCalledTimes(1);
  });

  it('receives live diagnostic snapshots without HTTP polling, saving local edits or duplicating controls', async () => {
    const callbacks = new Set<(payload: unknown) => void>();
    mount({
      subscribe: (subscription, callback) => {
        if (subscription.topic === 'plugin:wago:diagnostics') callbacks.add(callback);
        return () => {
          callbacks.delete(callback);
        };
      },
    });
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
    await user.type(name, 'Live draft');
    act(() =>
      callbacks.forEach((callback) =>
        callback({ eventType: 'snapshot', value: { ...diagnosticsFixture(), name: 'Streamed controller' } }),
      ),
    );
    expect(await screen.findByText('Streamed controller: online')).toBeInTheDocument();
    expect(state.diagnostics).toHaveBeenCalledTimes(1);
    expect(name).toHaveValue('Live draft');
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
    await section(user, 'Diagnostics');
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    expect(await screen.findByText(/Diagnostics unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Fixture controller 1: online')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hardware readiness:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(name).toHaveValue('Keep my draft');
    state.diagnostics.mockImplementation(async () => new Response(JSON.stringify(diagnosticsFixture())));
    await section(user, 'Diagnostics');
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

  {
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
  }

  it.each(['success', 'delivery failure', 'refresh failure', 'unsupported refresh'] as const)(
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
        else if (outcome === 'unsupported refresh')
          state.getDraft.mockResolvedValue({
            controllerId: 1,
            snapshot: '{"version":2}',
            updatedAt: '2026-09-05',
          });
        else
          state.getDraft.mockResolvedValue({
            controllerId: 1,
            snapshot: JSON.stringify({
              ...state.snapshot,
              logicalChannels: [
                {
                  ...state.snapshot.logicalChannels[0],
                  pulse: { durationMs: 250 },
                  capabilities: ['output', 'pulse'],
                },
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
      await section(user, 'History');
      await user.click(await screen.findByRole('button', { name: 'Preview rollback to revision 1' }));
      await user.click(await screen.findByRole('button', { name: 'Publish rollback as new revision' }));
      await waitFor(() =>
        expect(state.rollback).toHaveBeenCalledWith(1, 1, false, 'historical', 'historical', 'snapshot-and-metadata'),
      );
      if (outcome === 'refresh failure' || outcome === 'unsupported refresh') {
        expect(
          await screen.findByText(
            outcome === 'unsupported refresh'
              ? /unsupported configuration structure/
              : /Could not reconcile the saved draft after rollback/,
          ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
        expect(screen.queryByRole('textbox', { name: 'Channel name' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'WAGO controllers' })).toBeEnabled();
        if (outcome === 'unsupported refresh') {
          act(() => useTranslationState.setState({ language: 'de' }));
          expect(screen.getByText(/nicht unterstützt/)).toBeInTheDocument();
          expect(screen.queryByText(/unsupported/)).not.toBeInTheDocument();
        }
      } else {
        await section(user, 'Channels');
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
    const selectedChange = await screen.findByRole('checkbox', { name: /Door lock/ });
    await user.click(selectedChange);
    expect(screen.getByRole('button', { name: 'Copy selected changes to local edits' })).toBeDisabled();
    await user.click(selectedChange);
    await user.click(await screen.findByRole('button', { name: 'Copy selected changes to local edits' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Copy selected changes to local edits' })).toBeDisabled();
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
    state.preview.mockResolvedValue({
      draftHash: 'unchanged-preview',
      snapshot: candidate,
      diff: [],
      errors: [{ path: '$.logicalChannels[0]', code: 'invalid', message: 'Invalid preset preview' }],
    });
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    expect(await screen.findByRole('button', { name: 'Reapply preset to local edits' })).toBeDisabled();
    expect(state.apply).toHaveBeenCalledTimes(1);
    state.preview.mockResolvedValue({
      draftHash: 'unchanged-preview',
      snapshot: candidate,
      diff: [],
      errors: [],
    });
    state.apply.mockResolvedValue({ snapshot: JSON.stringify(candidate) });
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeEnabled());
    expect(screen.getByText('No configuration changes.')).toBeInTheDocument();
    expect(state.apply).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledTimes(1);
    // Saving a no-op preview alone must not append audit intent.
    const saving = deferred<unknown>();
    state.save.mockReturnValueOnce(saving.promise);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][2].presets).toEqual([application]);
    expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeDisabled();
    await act(async () => saving.resolve(await state.save.mock.results[0].value));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Reapply preset to local edits' }));
    expect(state.apply).toHaveBeenLastCalledWith(1, application, [], 'unchanged-preview', candidate);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(3));
    expect(state.save.mock.calls[2][2].presets).toEqual([application, application]);
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
    await section(user, 'Review & publish');
    await user.click(screen.getByRole('button', { name: 'Review saved draft' }));
    await user.click(await screen.findByRole('button', { name: 'Publish reviewed draft' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'WAGO controllers' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Channels' })).toBeDisabled();
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
    const user = userEvent.setup();
    await section(user, 'History');
    await user.click(screen.getByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    await waitFor(() => expect(state.acknowledge).toHaveBeenCalledWith(1, 2, 'rejected', '2026-09-05'));
    expect(await screen.findByText(/Rejection acknowledged by user 7/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge rejection of revision 2' })).not.toBeInTheDocument();
  });
});

describe('configuration workspace', () => {
  it('starts from the applied configuration when no saved draft exists', async () => {
    state.getDraft.mockResolvedValue(null);
    state.baseline.mockResolvedValue({
      revision: 4,
      snapshot: JSON.stringify(state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Applied lock', point: 'DO1' }, presets: [] } }),
    });
    mount();
    expect(await screen.findByRole('textbox', { name: 'Channel name' })).toHaveValue('Applied lock');
    expect(screen.getByText('Starting from applied revision 4')).toBeVisible();
    expect(state.save).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1]).toEqual(state.snapshot);
    expect(state.save.mock.calls[0][3]).toBeNull();
  });

  it('blocks editing if the applied configuration cannot be read', async () => {
    state.getDraft.mockResolvedValue(null);
    state.baseline.mockRejectedValue(new Error('Baseline unavailable'));
    mount();
    expect(await screen.findByText(/Could not load applied configuration/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add channel' })).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('lets a pulse preset become switched and persist only its chosen behavior', async () => {
    state.getDraft.mockResolvedValue({
      snapshot: JSON.stringify({
        ...state.snapshot,
        logicalChannels: [
          {
            ...state.snapshot.logicalChannels[0],
            profile: 'pulsed-lock-bank',
            capabilities: ['output', 'pulse'],
            pulse: { durationMs: 750 },
          },
        ],
      }),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: 'initial',
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Output behavior/ }));
    await user.click(await screen.findByRole('option', { name: /Switched —/ }));
    expect(screen.queryByRole('spinbutton', { name: 'Pulse duration (ms)' })).not.toBeInTheDocument();
    expect(screen.getByText(/Flows can turn this output on or off/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const saved = state.save.mock.calls[0][1];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.logicalChannels[0]).toMatchObject({ profile: 'pulsed-lock-bank', capabilities: ['output'] });
    expect(saved.logicalChannels[0]).not.toHaveProperty('pulse');
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('guides creation from a free terminal and keeps the list, map and saved payload consistent', async () => {
    state.getDraft.mockResolvedValue(null);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Terminal map' }));
    await user.click(screen.getByRole('button', { name: 'DO3: Available' }));
    await user.click(screen.getByRole('button', { name: /Pulse a lock or relay/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'New channel name' }), 'Workshop lock');
    await user.clear(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.type(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' }), '750');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Pulse duration: 750 ms')).toBeVisible();
    expect(state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add to configuration' }));
    expect(screen.getByRole('button', { name: 'DO3: Workshop lock' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Workshop lock');
    await user.click(screen.getByRole('button', { name: 'Channel list' }));
    expect(screen.getAllByRole('textbox', { name: 'Channel name' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, snapshot, metadata] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(snapshot)).toEqual([]);
    expect(snapshot.physicalPoints[0].channel).toBe(2);
    expect(snapshot.logicalChannels[0]).toMatchObject({ profile: 'pulsed-lock-bank', pulse: { durationMs: 750 } });
    expect(metadata.names[snapshot.logicalChannels[0].id]).toBe('Workshop lock');
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('retains local edits across route unmounts and requires confirmation to discard them', async () => {
    const close = vi.fn();
    const view = (id: number | null) => (
      <QueryClientProvider client={client}>
        <ConfigurationEditor controllerId={id} onOpenChange={close} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1));
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    await user.clear(name);
    await user.type(name, 'Retained local edit');
    rerender(view(null));
    rerender(view(1));
    expect(await screen.findByRole('textbox', { name: 'Channel name' })).toHaveValue('Retained local edit');
    await user.click(screen.getByRole('button', { name: 'WAGO controllers' }));
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved local edits?' })).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][3]).toMatchObject({
      snapshot: JSON.stringify(state.snapshot),
      updatedAt: '2026-09-05',
    });
    expect(screen.queryByText('Saved draft changed')).not.toBeInTheDocument();
  });
});

it('recovers from an initial draft read failure through the retry control', async () => {
  state.getDraft.mockRejectedValueOnce(new Error('draft temporarily unavailable'));
  mount();
  expect(await screen.findByText(/Could not load draft: draft temporarily unavailable/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading draft' }));
  expect(await screen.findByRole('button', { name: 'Save draft' })).toBeEnabled();
  expect(await screen.findByText('Draft is saved')).toBeInTheDocument();
});

it('recovers an applied baseline after a failed initial fetch without claiming a saved draft', async () => {
  state.getDraft.mockResolvedValue(null);
  state.baseline.mockRejectedValueOnce(new Error('baseline temporarily unavailable')).mockResolvedValue({
    revision: 3,
    snapshot: JSON.stringify(state.snapshot),
    presetProvenance: null,
  });
  mount();
  expect(
    await screen.findByText(/Could not load applied configuration: baseline temporarily unavailable/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading configuration' }));
  expect(await screen.findByText('Starting from applied revision 3')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
  expect(state.save).not.toHaveBeenCalled();
});

it('shows field validation failures and prevents persistence until the draft is valid', async () => {
  state.validate.mockResolvedValue({
    valid: false,
    errors: [{ path: 'logicalChannels[0].profile', code: 'invalid_profile', message: 'Choose a supported profile' }],
  });
  mount();
  const save = await screen.findByRole('button', { name: 'Save draft' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
  expect(await screen.findByText('Resolve these configuration fields')).toBeInTheDocument();
  expect(screen.getAllByText(/Choose a supported profile/).length).toBeGreaterThan(0);
  expect(state.save).not.toHaveBeenCalled();
});

it('renders reported configuration, hardware faults, and channel samples without treating them as readiness proof', async () => {
  const diagnostic = diagnosticsFixture();
  Object.assign(diagnostic, {
    stateHardwareAvailable: false,
    trackingExhausted: true,
    incompatible: true,
    faults: [{ channelId: 'output', code: 'io-unavailable', receivedAt: '2026-09-22T10:00:00Z' }],
  });
  Object.assign(diagnostic.configuration, {
    draftUpdatedAt: '2026-09-22T10:00:00Z',
    draftChanged: true,
    revisionMismatch: true,
    rejected: true,
    validationErrorCount: 1,
    validationCodes: ['invalid_channel'],
    validationErrors: [{ path: 'logicalChannels[0]', code: 'invalid_channel' }],
    rejectionErrors: [{ path: 'physicalPoints[0]', code: 'unavailable' }],
  });
  diagnostic.channels = [
    {
      id: 'output',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'watchdog', timeoutMs: 800 },
      safeState: 'off',
      current: false,
      fault: null,
      samples: [
        {
          kind: 'output',
          value: false,
          sourceAt: null,
          receivedAt: '2026-09-22T10:00:00Z',
          streamId: 'boot-1',
          sequence: 3,
          sourceFreshness: 'stale',
          current: false,
          availabilityReason: 'source stale',
        },
      ],
      acknowledgement: { id: 'cmd-1', status: 'accepted', receivedAt: '2026-09-22T10:00:01Z' },
    },
  ];
  state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostic)));
  mount();
  expect(await screen.findByText(/Runtime reports hardware unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/Stream tracking limit reached/)).toBeInTheDocument();
  expect(screen.getByText(/controller rejected publication/)).toBeInTheDocument();
  expect(screen.getByText(/Recent fault on output: io-unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/Latest output: false/)).toHaveTextContent('not current: source stale');
  expect(screen.getByText(/Last correlated acknowledgement:/)).toHaveTextContent('accepted · cmd-1');
  expect(screen.getByText(/Hardware readiness: unknown/)).toBeInTheDocument();
});

it('requires a selected input for a guarded output and preserves its watchdog configuration', async () => {
  const snapshot: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [{ id: 'input-point', hardwareProfile: '751-9301', channel: 4 }],
    logicalChannels: [
      {
        id: 'guard-input',
        physicalPointId: 'input-point',
        profile: 'generic-monitored-input',
        capabilities: ['input'],
        disconnectPolicy: { mode: 'hold' },
      },
    ],
  };
  state.getDraft.mockResolvedValue({
    controllerId: 1,
    snapshot: JSON.stringify(snapshot),
    reviewedHash: null,
    updatedAt: '2026-09-05',
    presetProvenance: JSON.stringify({ editor: { names: { 'guard-input': 'Door contact' }, presets: [] } }),
  });
  mount();
  const user = userEvent.setup();
  const add = await screen.findByRole('button', { name: 'Add channel' });
  await waitFor(() => expect(add).toBeEnabled());
  await user.click(add);
  await user.click(screen.getByRole('button', { name: /Request an enable/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByRole('textbox', { name: 'New channel name' }), 'Guarded lock');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: /Guard input/ }));
  await user.click(screen.getByRole('option', { name: 'Door contact' }));
  await user.click(screen.getByRole('button', { name: /On disconnect/ }));
  await user.click(screen.getByRole('option', { name: 'Off after watchdog timeout' }));
  await user.clear(screen.getByRole('spinbutton', { name: 'Watchdog timeout (ms)' }));
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.type(screen.getByRole('spinbutton', { name: 'Watchdog timeout (ms)' }), '2000');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Add to configuration' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  const saved = state.save.mock.calls[0][1] as WagoConfigurationSnapshot;
  expect(saved.logicalChannels.find((channel) => channel.profile === 'guarded-enable-request')).toMatchObject({
    guard: { channelId: 'guard-input', when: 'on' },
    disconnectPolicy: { mode: 'watchdog', timeoutMs: 2000 },
  });
  expect(validateEditorSnapshot(saved)).toEqual([]);
});
