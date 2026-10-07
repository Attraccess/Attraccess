import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { SetupScope } from './visual-editor.test';
import { registerBindsANamedActionAndLiveMeasurementRetainingOutputControlsAndValidMeteredPayloads } from './visual-editor.binds-a-named-action-and-live-measurement-retaining-output-controls-and-valid-metered-payloads.test-cases';
import { registerUsesTheActualTransportSelectorToReplaceTcpFieldsWithValidSerialConfiguration } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { state } from './visual-editor.test.state';
import { mount } from './visual-editor.test.client';
import { external } from './visual-editor.test.external.helpers';
import { section } from './visual-editor.test.external.helpers';
import { registerRecoversFromAnInitialDraftReadFailureThroughTheRetryControl } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerRecoversAnAppliedBaselineAfterAFailedInitialFetchWithoutClaimingASavedDraft } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerShowsFieldValidationFailuresAndPreventsPersistenceUntilTheDraftIsValid } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerRendersReportedConfigurationHardwareFaultsAndChannelSamplesWithoutTreatingThemAsReadines } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import { registerRequiresASelectedInputForAGuardedOutputAndPreservesItsWatchdogConfiguration } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import type { WagoDiagnostics } from '../src/diagnostics';

export function resetTestFixture(scope: SetupScope) {
  vi.clearAllMocks();
  scope.state.baseline.mockResolvedValue(null);
  scope.state.validate.mockResolvedValue({ valid: true, errors: [] });
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
        return scope.state.diagnostics(url, options);
      throw new Error('Unexpected network access in visual editor test');
    }),
  );
  scope.client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
  });
  scope.state.diagnostics.mockImplementation(async (url: string) => {
    const controllerId = Number(/controllers\/(\d+)/.exec(url)?.[1]);
    return new Response(JSON.stringify(scope.diagnosticsFixture(controllerId)));
  });
  scope.state.history.mockResolvedValue({ revisions: [], offset: 0, limit: 20 });
  scope.state.getDraft.mockResolvedValue({
    controllerId: 1,
    snapshot: JSON.stringify(scope.state.snapshot),
    reviewedHash: null,
    presetProvenance: JSON.stringify({ editor: { names: { output: 'Door lock', point: 'DO1' }, presets: [] } }),
    updatedAt: '2026-09-05',
  });
  scope.state.save.mockImplementation(async (_id, snapshot, metadata) => ({
    controllerId: 1,
    snapshot: JSON.stringify(snapshot),
    presetProvenance: JSON.stringify({ editor: metadata }),
    reviewedHash: null,
    updatedAt: '2026-09-05',
  }));
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function defineModbusOutputAndSerialCompositionTests() {
  const scope = {
    get state() {
      return state;
    },
    mount,
    external,
    section,
  };
  registerBindsANamedActionAndLiveMeasurementRetainingOutputControlsAndValidMeteredPayloads(scope);

  registerUsesTheActualTransportSelectorToReplaceTcpFieldsWithValidSerialConfiguration(scope);

  return scope;
}

export function diagnosticsFixture(controllerId = 1): WagoDiagnostics {
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

export function defineRootTestRegistrationsTests() {
  const scope = {
    get state() {
      return state;
    },
    mount,
    diagnosticsFixture,
  };

  registerRecoversFromAnInitialDraftReadFailureThroughTheRetryControl(scope);

  registerRecoversAnAppliedBaselineAfterAFailedInitialFetchWithoutClaimingASavedDraft(scope);

  registerShowsFieldValidationFailuresAndPreventsPersistenceUntilTheDraftIsValid(scope);

  registerRendersReportedConfigurationHardwareFaultsAndChannelSamplesWithoutTreatingThemAsReadines(scope);

  registerRequiresASelectedInputForAGuardedOutputAndPreservesItsWatchdogConfiguration(scope);

  return scope;
}
