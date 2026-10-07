import { expect } from 'vitest';
import { it } from 'vitest';
import { act } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VisualConfigurationWorkflowTestScope } from './visual-editor.test';
import type { MountedModbusConfigurationTestScope } from './visual-editor.test';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import type { ConfigurationWorkspaceTestScope } from './visual-editor.test';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { RootTestRegistrationsTestScope } from './visual-editor.test';

export function registerFreezesEditingAndCloseDuringPublicationAndKeepsReadinessUnknown(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('freezes editing and close during publication and keeps readiness unknown', async () => {
    const close = scope.mount();
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Channel name' });
    scope.state.review.mockResolvedValue({
      draft: { snapshot: JSON.stringify(scope.state.snapshot), reviewedHash: 'reviewed' },
      previous: null,
      changed: true,
      diff: [],
      impacts: [],
    });
    const pending = scope.deferred<unknown>();
    scope.state.publish.mockReturnValue(pending.promise);
    await scope.section(user, 'Review & publish');
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
}

export function registerFreezesModbusControlsAndRejectsSavingADirtyEditorOverARefreshedDraft(
  scope: MountedModbusConfigurationTestScope,
): void {
  it('freezes Modbus controls and rejects saving a dirty editor over a refreshed draft', async () => {
    const user = await scope.addMeter();
    await scope.external(user, 'Connections');
    const fresh = {
      controllerId: 1,
      snapshot: JSON.stringify(scope.state.snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: '2026-09-07',
    };
    await act(async () => {
      scope.client.setQueryData(['wago', 'configuration-draft', 1], fresh);
    });
    expect(await screen.findByText('Saved draft changed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(scope.state.save).not.toHaveBeenCalled();
  });
}

export function registerGuidesCreationFromAFreeTerminalAndKeepsTheListMapAndSavedPayloadConsistent(
  scope: ConfigurationWorkspaceTestScope,
): void {
  it('guides creation from a free terminal and keeps the list, map and saved payload consistent', async () => {
    scope.state.getDraft.mockResolvedValue(null);
    scope.mount();
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
    expect(scope.state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add to configuration' }));
    expect(screen.getByRole('button', { name: 'DO3: Workshop lock' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Workshop lock');
    await user.click(screen.getByRole('button', { name: 'Channel list' }));
    expect(screen.getAllByRole('textbox', { name: 'Channel name' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const [, snapshot, metadata] = scope.state.save.mock.calls[0];
    expect(validateEditorSnapshot(snapshot)).toEqual([]);
    expect(snapshot.physicalPoints[0].channel).toBe(2);
    expect(snapshot.logicalChannels[0]).toMatchObject({ profile: 'pulsed-lock-bank', pulse: { durationMs: 750 } });
    expect(metadata.names[snapshot.logicalChannels[0].id]).toBe('Workshop lock');
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerHidesCachedOnlineStatusOnPollingFailureAndRecoversWithoutLosingLocalEdits(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('hides cached online status on polling failure and recovers without losing local edits', async () => {
    scope.mount();
    const user = userEvent.setup();
    await screen.findByText('Fixture controller 1: online');
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    await user.clear(name);
    await user.type(name, 'Keep my draft');
    scope.state.diagnostics.mockResolvedValue(new Response('{}', { status: 503 }));
    await scope.section(user, 'Diagnostics');
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    expect(await screen.findByText(/Diagnostics unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Fixture controller 1: online')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hardware readiness:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(name).toHaveValue('Keep my draft');
    scope.state.diagnostics.mockImplementation(async () => new Response(JSON.stringify(scope.diagnosticsFixture())));
    await scope.section(user, 'Diagnostics');
    await user.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    expect(await screen.findByText('Fixture controller 1: online')).toBeInTheDocument();
    expect(name).toHaveValue('Keep my draft');
    expect(scope.state.save).not.toHaveBeenCalled();
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerLetsAPulsePresetBecomeSwitchedAndPersistOnlyItsChosenBehavior(
  scope: ConfigurationWorkspaceTestScope,
): void {
  it('lets a pulse preset become switched and persist only its chosen behavior', async () => {
    scope.state.getDraft.mockResolvedValue({
      snapshot: JSON.stringify({
        ...scope.state.snapshot,
        logicalChannels: [
          {
            ...scope.state.snapshot.logicalChannels[0],
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
    scope.mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Output behavior/ }));
    await user.click(await screen.findByRole('option', { name: /Switched —/ }));
    expect(screen.queryByRole('spinbutton', { name: 'Pulse duration (ms)' })).not.toBeInTheDocument();
    expect(screen.getByText(/Flows can turn this output on or off/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const saved = scope.state.save.mock.calls[0][1];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.logicalChannels[0]).toMatchObject({ profile: 'pulsed-lock-bank', capabilities: ['output'] });
    expect(saved.logicalChannels[0]).not.toHaveProperty('pulse');
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerLocalizesAcknowledgementAndProtocolEventDatesWhenTheHostLanguageChanges(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('localizes acknowledgement and protocol event dates when the host language changes', async () => {
    const diagnostics = scope.diagnosticsFixture();
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
    scope.state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostics)));
    scope.mount();
    await scope.section(userEvent.setup(), 'Diagnostics');
    expect(await screen.findByText(/command\.v1/)).toHaveTextContent('9/6/2026');
    expect(screen.getByText(/state\.changed/)).toHaveTextContent('9/6/2026');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/command\.v1/)).toHaveTextContent('6.9.2026');
    expect(screen.getByText(/command\.v1/)).toHaveTextContent('Akzeptiert');
    expect(screen.getByText(/state\.changed/)).toHaveTextContent('6.9.2026');
    expect(scope.state.diagnostics).toHaveBeenCalledTimes(1);
  });
}

export function registerMountsNamedBindingsAndSavesExactModbusConfigurationWithStableIdentities(
  scope: MountedModbusConfigurationTestScope,
): void {
  it('mounts named bindings and saves exact Modbus configuration with stable identities', async () => {
    const user = await scope.addMeter();
    expect(screen.queryByRole('textbox', { name: 'Device ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Connection ID' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modbus device/ })).toHaveTextContent('Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const [, first] = scope.state.save.mock.calls[0];
    expect(validateEditorSnapshot(first)).toEqual([]);
    expect(first.modbus.devices[0]).toMatchObject({
      name: 'Workshop meter',
      profileId: 'wago-879-3020',
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
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(2));
    const [, second] = scope.state.save.mock.calls[1];
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
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerRecoversAnAppliedBaselineAfterAFailedInitialFetchWithoutClaimingASavedDraft(
  scope: RootTestRegistrationsTestScope,
): void {
  it('recovers an applied baseline after a failed initial fetch without claiming a saved draft', async () => {
    scope.state.getDraft.mockResolvedValue(null);
    scope.state.baseline.mockRejectedValueOnce(new Error('baseline temporarily unavailable')).mockResolvedValue({
      revision: 3,
      snapshot: JSON.stringify(scope.state.snapshot),
      presetProvenance: null,
    });
    scope.mount();
    expect(
      await screen.findByText(/Could not load applied configuration: baseline temporarily unavailable/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading configuration' }));
    expect(await screen.findByText('Starting from applied revision 3')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
    expect(scope.state.save).not.toHaveBeenCalled();
  });
}

export function registerRecoversFromAnInitialDraftReadFailureThroughTheRetryControl(
  scope: RootTestRegistrationsTestScope,
): void {
  it('recovers from an initial draft read failure through the retry control', async () => {
    scope.state.getDraft.mockRejectedValueOnce(new Error('draft temporarily unavailable'));
    scope.mount();
    expect(await screen.findByText(/Could not load draft: draft temporarily unavailable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading draft' }));
    expect(await screen.findByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(await screen.findByText('Draft is saved')).toBeInTheDocument();
  });
}
