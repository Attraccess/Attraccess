// Tests live controls and apply behavior with isolated controller endpoints.
// FEATURE: WAGO front panel edits never replace applied control routing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { FrontPanel } from '../src/front-panel/FrontPanel';
import { useFrontPanel } from '../src/front-panel/useFrontPanel';
import { addDevice } from '../src/front-panel/model';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { encodeMeasurement } from '../../measurement-contract';
import { registerExposesAnInteractiveOutputSwitchAndSendsAManualCommandWhenClicked } from './front-panel.test-cases';
import { registerExposesAnInteractiveInputInversionSwitchInTheTerminalSettings } from './front-panel.test-cases';
import { registerShowsEveryTerminalAndSwitchesLanguagesThroughTheHostStore } from './front-panel.test-cases';
import { registerTranslatesTheSharedBusBaudRateWhileItsDrawerIsOpen } from './front-panel.test-cases';
import { registerCancelsANewDeviceWithoutChangingTheWorkingConfiguration } from './front-panel.test-cases';
import { registerRetainsThePendingApplyStateWhenReturningToThePage } from './front-panel.test-cases';
import { registerKeepsLiveCommandsOnTheAppliedChannelAndRevisionWhileEditsAreUnapplied } from './front-panel.test-cases';
import { registerPreservesASavedUnappliedDraftWhenAnotherSessionAppliesANewRevision } from './front-panel.test-cases';
import { registerRequiresConfirmationEvenWithoutFlowImpactsAndRetainsTheRevisionAcknowledgementWait } from './front-panel.test-cases';
import { registerShowsLabelAndAllowsConfirmationRegardlessOfOutputState } from './front-panel.test-cases';
import { registerCancelsApplyConfirmationWithoutPublishing } from './front-panel.test-cases';
import { registerRequiresFlowImpactConfirmationBeforePublication } from './front-panel.test-cases';
import { registerDiscardsPersistedDraftChangesBackToTheAppliedConfiguration } from './front-panel.test-cases';

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
  defineFrontPanelTests();
});

export function defineFrontPanelTests() {
  const scope = {
    get wrapper() {
      return wrapper;
    },
    get api() {
      return api;
    },
    get draft() {
      return draft;
    },
    required,
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get snapshot() {
      return snapshot;
    },
  };
  registerExposesAnInteractiveOutputSwitchAndSendsAManualCommandWhenClicked(scope);

  registerExposesAnInteractiveInputInversionSwitchInTheTerminalSettings(scope);

  registerShowsEveryTerminalAndSwitchesLanguagesThroughTheHostStore(scope);

  registerTranslatesTheSharedBusBaudRateWhileItsDrawerIsOpen(scope);

  registerCancelsANewDeviceWithoutChangingTheWorkingConfiguration(scope);

  registerRetainsThePendingApplyStateWhenReturningToThePage(scope);

  registerKeepsLiveCommandsOnTheAppliedChannelAndRevisionWhileEditsAreUnapplied(scope);

  registerPreservesASavedUnappliedDraftWhenAnotherSessionAppliesANewRevision(scope);

  registerRequiresConfirmationEvenWithoutFlowImpactsAndRetainsTheRevisionAcknowledgementWait(scope);

  registerShowsLabelAndAllowsConfirmationRegardlessOfOutputState(scope);

  registerCancelsApplyConfirmationWithoutPublishing(scope);

  registerRequiresFlowImpactConfirmationBeforePublication(scope);

  registerDiscardsPersistedDraftChangesBackToTheAppliedConfiguration(scope);

  it('disables live commands when diagnostics fail or the runtime lacks support', async () => {
    api.diagnostics.mockReturnValue({ isSuccess: false, data: undefined, refetch: vi.fn() });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.live.enabled).toBe(false);
  });

  return scope;
}

export type FrontPanelTestScope = ReturnType<typeof defineFrontPanelTests>;
