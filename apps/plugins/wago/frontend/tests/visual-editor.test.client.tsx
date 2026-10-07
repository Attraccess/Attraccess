import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { ConfigurationEditor } from '../src/ConfigurationEditor';
import type { WagoConfigurationSnapshot } from '../src/api';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import { registerSwitchesDiagnosticStatusValuesWithTheHostLanguageWhilePreservingSourceIdentifiers } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerLocalizesAcknowledgementAndProtocolEventDatesWhenTheHostLanguageChanges } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerReceivesLiveDiagnosticSnapshotsWithoutHttpPolling } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerHidesCachedOnlineStatusOnPollingFailureAndRecoversWithoutLosingLocalEdits } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerScopesDiagnosticsToTheSelectedControllerAndRemovesItWhenTheEditorCloses } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerRendersLiteralEditorNamesInMetadataChanges } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import { registerReconcilesRollbackAfterSAndSendsThePreviewedDraftIdentity } from './visual-editor.reconciles-rollback-after-s-and-sends-the-previewed-draft-identity.test-cases';
import { registerCanSaveAfterClearingAndThenRemovingAChannelName } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerUsesLabelledTerminalsKeepsNamesOutsideTheSnapshotAndSavesOnlyExplicitly } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerReloadsARefreshedSavedDraftWhileCleanAndBlocksDirtyLocalEditsFromOverwritingIt } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import { registerBlocksSaveDraftWhileCopyingAPresetAndLeavesCopiedSettingsUnsaved } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerFreezesEditingAndCloseDuringPublicationAndKeepsReadinessUnknown } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerRendersControllerRejectionFieldsWithTheRejectedChannelNameAndHumanFieldLabel } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import { registerReplacesACleanFocusedHostAuthoritativelyBeforeTheNextKeystroke } from './visual-editor.reloads-a-refreshed-saved-draft-while-clean-and-blocks-dirty-local-edits-from-overwriting-it.test-cases';
import { registerConvertsARangedMeasurementIntoAPlainOutputWithoutAHiddenInvalidRange } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerRetainsTheCustomizedInputDisconnectPolicyWhenSelectingAnotherMeasurement } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerExposesAnOrphanBindingForRepairAfterMapDeletionAndReleaseAfterDeviceDeletion } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerStartsFromTheAppliedConfigurationWhenNoSavedDraftExists } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerBlocksEditingIfTheAppliedConfigurationCannotBeRead } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerLetsAPulsePresetBecomeSwitchedAndPersistOnlyItsChosenBehavior } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerGuidesCreationFromAFreeTerminalAndKeepsTheListMapAndSavedPayloadConsistent } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerRetainsLocalEditsAcrossRouteUnmountsAndRequiresConfirmationToDiscardThem } from './visual-editor.retains-local-edits-across-route-unmounts-and-requires-confirmation-to-discard-them.test-cases';
import { registerMountsNamedBindingsAndSavesExactModbusConfigurationWithStableIdentities } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { registerBlocksInvalidTransportAndBindingEditsAndDisplaysServerValidation } from './visual-editor.blocks-editing-if-the-applied-configuration-cannot-be-read.test-cases';
import { registerFreezesModbusControlsAndRejectsSavingADirtyEditorOverARefreshedDraft } from './visual-editor.freezes-editing-and-close-during-publication-and-keeps-readiness-unknown.test-cases';
import { diagnosticsFixture } from './visual-editor.setup.test-fixture.helpers';
import { state } from './visual-editor.test.state';
import { section } from './visual-editor.test.external.helpers';
import { deferred } from './visual-editor.setup.test-fixture.helpers';
import { external } from './visual-editor.test.external.helpers';

export let client: QueryClient;

export function mount(liveClient: PluginLiveUpdatesClient | null = null) {
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

export function defineVisualConfigurationWorkflowTests() {
  const scope = {
    diagnosticsFixture,
    get state() {
      return state;
    },
    mount,
    section,
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    deferred,
  };
  registerSwitchesDiagnosticStatusValuesWithTheHostLanguageWhilePreservingSourceIdentifiers(scope);

  registerLocalizesAcknowledgementAndProtocolEventDatesWhenTheHostLanguageChanges(scope);

  registerReceivesLiveDiagnosticSnapshotsWithoutHttpPolling(scope);

  registerHidesCachedOnlineStatusOnPollingFailureAndRecoversWithoutLosingLocalEdits(scope);

  registerScopesDiagnosticsToTheSelectedControllerAndRemovesItWhenTheEditorCloses(scope);

  registerRendersLiteralEditorNamesInMetadataChanges(scope);

  registerReconcilesRollbackAfterSAndSendsThePreviewedDraftIdentity(scope);

  registerCanSaveAfterClearingAndThenRemovingAChannelName(scope);

  registerUsesLabelledTerminalsKeepsNamesOutsideTheSnapshotAndSavesOnlyExplicitly(scope);

  registerReloadsARefreshedSavedDraftWhileCleanAndBlocksDirtyLocalEditsFromOverwritingIt(scope);

  registerBlocksSaveDraftWhileCopyingAPresetAndLeavesCopiedSettingsUnsaved(scope);

  registerFreezesEditingAndCloseDuringPublicationAndKeepsReadinessUnknown(scope);

  registerRendersControllerRejectionFieldsWithTheRejectedChannelNameAndHumanFieldLabel(scope);

  return scope;
}

export function defineModbusReviewRegressionsTests() {
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
  const scope = {
    get fixture() {
      return fixture;
    },
    get start() {
      return start;
    },
    external,
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get draftRecord() {
      return draftRecord;
    },
    get state() {
      return state;
    },
    section,
  };

  registerReplacesACleanFocusedHostAuthoritativelyBeforeTheNextKeystroke(scope);

  registerConvertsARangedMeasurementIntoAPlainOutputWithoutAHiddenInvalidRange(scope);

  registerRetainsTheCustomizedInputDisconnectPolicyWhenSelectingAnotherMeasurement(scope);

  registerExposesAnOrphanBindingForRepairAfterMapDeletionAndReleaseAfterDeviceDeletion(scope);

  return scope;
}

export function defineConfigurationWorkspaceTests() {
  const scope = {
    get state() {
      return state;
    },
    mount,
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
  };
  registerStartsFromTheAppliedConfigurationWhenNoSavedDraftExists(scope);

  registerBlocksEditingIfTheAppliedConfigurationCannotBeRead(scope);

  registerLetsAPulsePresetBecomeSwitchedAndPersistOnlyItsChosenBehavior(scope);

  registerGuidesCreationFromAFreeTerminalAndKeepsTheListMapAndSavedPayloadConsistent(scope);

  registerRetainsLocalEditsAcrossRouteUnmountsAndRequiresConfirmationToDiscardThem(scope);

  return scope;
}

export function defineMountedModbusConfigurationTests() {
  async function addMeter() {
    mount();
    const user = userEvent.setup();
    await external(user, 'Connections');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Host' }), 'meter.fixture.invalid');
    await external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    await user.clear(screen.getByRole('textbox', { name: 'Device name' }));
    await user.type(screen.getByRole('textbox', { name: 'Device name' }), 'Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Add Active power from Workshop meter' }));
    await section(user, 'Channels');
    return user;
  }
  const scope = {
    get addMeter() {
      return addMeter;
    },
    get state() {
      return state;
    },
    external,
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
  };

  registerMountsNamedBindingsAndSavesExactModbusConfigurationWithStableIdentities(scope);

  registerBlocksInvalidTransportAndBindingEditsAndDisplaysServerValidation(scope);

  registerFreezesModbusControlsAndRejectsSavingADirtyEditorOverARefreshedDraft(scope);

  return scope;
}

export function getSetupScope() {
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
