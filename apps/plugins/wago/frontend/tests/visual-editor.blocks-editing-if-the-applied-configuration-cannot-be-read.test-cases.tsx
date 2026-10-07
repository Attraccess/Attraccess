import { expect } from 'vitest';
import { it } from 'vitest';
import { screen } from '@testing-library/react';
import type { ConfigurationWorkspaceTestScope } from './visual-editor.test';
import type { MountedModbusConfigurationTestScope } from './visual-editor.test';
import { act } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WagoConfigurationSnapshot } from '../src/api';
import type { VisualConfigurationWorkflowTestScope } from './visual-editor.test';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import type { ModbusReviewRegressionsTestScope } from './visual-editor.test';

export function registerBlocksEditingIfTheAppliedConfigurationCannotBeRead(
  scope: ConfigurationWorkspaceTestScope,
): void {
  it('blocks editing if the applied configuration cannot be read', async () => {
    scope.state.getDraft.mockResolvedValue(null);
    scope.state.baseline.mockRejectedValue(new Error('Baseline unavailable'));
    scope.mount();
    expect(await screen.findByText(/Could not load applied configuration/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add channel' })).not.toBeInTheDocument();
    expect(scope.state.save).not.toHaveBeenCalled();
  });
}

export function registerBlocksInvalidTransportAndBindingEditsAndDisplaysServerValidation(
  scope: MountedModbusConfigurationTestScope,
): void {
  it('blocks invalid transport and binding edits and displays server validation', async () => {
    const user = await scope.addMeter();
    await scope.external(user, 'Connections');
    const port = screen.getByRole('textbox', { name: 'Port' });
    await user.clear(port);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(port, '502');
    scope.state.validate.mockResolvedValue({
      valid: false,
      errors: [{ path: 'modbus.devices[0].unitId', code: 'invalid_modbus', message: 'Fixture unit is unavailable' }],
    });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText('Workshop meter · Unit ID (1–247): Fixture unit is unavailable'),
    ).toBeInTheDocument();
    expect(scope.state.save).not.toHaveBeenCalled();
    await scope.external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText(/existing device and named measurement\/action required/)).toBeInTheDocument();
  });
}

export function registerBlocksSaveDraftWhileCopyingAPresetAndLeavesCopiedSettingsUnsaved(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('blocks Save draft while copying a preset and leaves copied settings unsaved', async () => {
    scope.mount();
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Channel name' });
    const snapshot = scope.state.snapshot as WagoConfigurationSnapshot;
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
    scope.state.preview.mockResolvedValue({
      draftHash: 'test-preview',
      snapshot: candidate,
      diff: [{ path: '$.logicalChannels[0].pulse', current: { durationMs: 500 } }],
      errors: [],
    });
    const pending = scope.deferred<{ snapshot: string }>();
    scope.state.apply.mockReturnValue(pending.promise);
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
    expect(scope.state.save).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ snapshot: JSON.stringify(candidate) });
    });
    await screen.findByRole('spinbutton', { name: 'Pulse duration (ms)' });
    expect(screen.getByText(/Unsaved local edits/)).toBeInTheDocument();
    expect(scope.state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const application = { presetId: 'pulsed-lock-bank', channelId: 'output', physicalPointId: 'point' };
    expect(scope.state.save.mock.calls[0][2].presets).toEqual([application]);
    // Reapply through the mounted UI, even when the copied settings are unchanged.
    scope.state.preview.mockResolvedValue({
      draftHash: 'unchanged-preview',
      snapshot: candidate,
      diff: [],
      errors: [{ path: '$.logicalChannels[0]', code: 'invalid', message: 'Invalid preset preview' }],
    });
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    expect(await screen.findByRole('button', { name: 'Reapply preset to local edits' })).toBeDisabled();
    expect(scope.state.apply).toHaveBeenCalledTimes(1);
    scope.state.preview.mockResolvedValue({
      draftHash: 'unchanged-preview',
      snapshot: candidate,
      diff: [],
      errors: [],
    });
    scope.state.apply.mockResolvedValue({ snapshot: JSON.stringify(candidate) });
    await user.click(screen.getByRole('button', { name: 'Preview preset' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeEnabled());
    expect(screen.getByText('No configuration changes.')).toBeInTheDocument();
    expect(scope.state.apply).toHaveBeenCalledTimes(1);
    expect(scope.state.save).toHaveBeenCalledTimes(1);
    // Saving a no-op preview alone must not append audit intent.
    const saving = scope.deferred<unknown>();
    scope.state.save.mockReturnValueOnce(saving.promise);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(2));
    expect(scope.state.save.mock.calls[1][2].presets).toEqual([application]);
    expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeDisabled();
    await act(async () => saving.resolve(await scope.state.save.mock.results[0].value));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reapply preset to local edits' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Reapply preset to local edits' }));
    expect(scope.state.apply).toHaveBeenLastCalledWith(1, application, [], 'unchanged-preview', candidate);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(3));
    expect(scope.state.save.mock.calls[2][2].presets).toEqual([application, application]);
  });
}

export function registerCanSaveAfterClearingAndThenRemovingAChannelName(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('can save after clearing and then removing a channel name', async () => {
    scope.mount();
    const user = userEvent.setup();
    await user.clear(await screen.findByRole('textbox', { name: 'Channel name' }));
    await user.click(screen.getByRole('button', { name: 'Remove channel' }));
    await user.click(screen.getByRole('button', { name: /Release DO1/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][1].logicalChannels).toEqual([]);
    expect(scope.state.save.mock.calls[0][2].names.output).toBeUndefined();
  });
}

export function registerConvertsARangedMeasurementIntoAPlainOutputWithoutAHiddenInvalidRange(
  scope: ModbusReviewRegressionsTestScope,
): void {
  it('converts a ranged measurement into a plain output without a hidden invalid range', async () => {
    const user = scope.start(scope.fixture());
    await user.click(await screen.findByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'Relay' }));
    expect(screen.getByRole('spinbutton', { name: 'Maximum' })).toHaveValue(1000);
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const saved = scope.state.save.mock.calls[0][1];
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
}

export function registerReceivesLiveDiagnosticSnapshotsWithoutHttpPolling(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('receives live diagnostic snapshots without HTTP polling, saving local edits or duplicating controls', async () => {
    const callbacks = new Set<(payload: unknown) => void>();
    scope.mount({
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
    expect(scope.state.diagnostics).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/wago\/controllers\/1\/diagnostics$/),
      expect.objectContaining({ credentials: 'include' }),
    );
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    await user.clear(name);
    await user.type(name, 'Live draft');
    act(() =>
      callbacks.forEach((callback) =>
        callback({ eventType: 'snapshot', value: { ...scope.diagnosticsFixture(), name: 'Streamed controller' } }),
      ),
    );
    expect(await screen.findByText('Streamed controller: online')).toBeInTheDocument();
    expect(scope.state.diagnostics).toHaveBeenCalledTimes(1);
    expect(name).toHaveValue('Live draft');
    expect(screen.getByText(/Unsaved local edits/)).toBeInTheDocument();
    expect(scope.state.save).not.toHaveBeenCalled();
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerExposesAnOrphanBindingForRepairAfterMapDeletionAndReleaseAfterDeviceDeletion(
  scope: ModbusReviewRegressionsTestScope,
): void {
  it('exposes an orphan binding for repair after map deletion and release after device deletion', async () => {
    const user = scope.start(scope.fixture(true));
    await scope.external(user, 'Device profiles');
    await user.click(screen.getByRole('button', { name: /Edit profile/ }));
    await user.click(await screen.findByRole('option', { name: 'Fixture map v1' }));
    await user.click(screen.getByText('Measurement: Active power', { selector: 'summary' }));
    await user.click(screen.getAllByRole('button', { name: 'Remove measurement' })[0]);
    await scope.section(user, 'Channels');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][1].physicalPoints[0]).toMatchObject({
      id: 'meter-point',
      modbus: { measurementId: 'import-energy' },
    });
    expect(scope.state.save.mock.calls[0][1].logicalChannels).toEqual([]);
    await scope.external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await scope.section(user, 'Channels');
    await user.click(screen.getByRole('button', { name: /Release Spare meter point/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(2));
    expect(scope.state.save.mock.calls[1][1].physicalPoints).toEqual([]);
  });
}
