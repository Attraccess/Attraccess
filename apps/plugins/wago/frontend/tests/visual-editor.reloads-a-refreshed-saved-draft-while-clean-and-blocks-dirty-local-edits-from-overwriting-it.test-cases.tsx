import { expect } from 'vitest';
import { it } from 'vitest';
import { act } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VisualConfigurationWorkflowTestScope } from './visual-editor.test';
import { render } from '@testing-library/react';
import { ConfigurationMetadataChanges } from '../src/ConfigurationChanges';
import type { RootTestRegistrationsTestScope } from './visual-editor.test';
import type { ModbusReviewRegressionsTestScope } from './visual-editor.test';
import type { WagoConfigurationSnapshot } from '../src/api';
import { validateEditorSnapshot } from '../../backend/configuration-editor';

export function registerReloadsARefreshedSavedDraftWhileCleanAndBlocksDirtyLocalEditsFromOverwritingIt(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('reloads a refreshed saved draft while clean and blocks dirty local edits from overwriting it', async () => {
    scope.mount();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    const cleanRefresh = {
      controllerId: 1,
      snapshot: JSON.stringify(scope.state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Clean refresh', point: 'DO1' }, presets: [] } }),
      reviewedHash: null,
      updatedAt: '2026-09-06',
    };
    await act(async () => {
      scope.client.setQueryData(['wago', 'configuration-draft', 1], cleanRefresh);
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Clean refresh'));
    await user.clear(name);
    await user.type(name, 'Local edit');
    const refreshed = {
      controllerId: 1,
      snapshot: JSON.stringify(scope.state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Saved elsewhere', point: 'DO1' }, presets: [] } }),
      reviewedHash: null,
      updatedAt: '2026-09-07',
    };
    scope.state.getDraft.mockResolvedValue(refreshed);

    await act(async () => {
      scope.client.setQueryData(['wago', 'configuration-draft', 1], refreshed);
    });

    expect(await screen.findByText('Saved draft changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload saved draft' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Saved elsewhere'));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });
}

export function registerRendersControllerRejectionFieldsWithTheRejectedChannelNameAndHumanFieldLabel(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('renders controller rejection fields with the rejected channel name and human field label', async () => {
    const revision = {
      revision: 2,
      state: 'rejected',
      contentHash: 'rejected',
      snapshot: JSON.stringify(scope.state.snapshot),
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
    scope.state.history.mockResolvedValue({ revisions: [revision], offset: 0, limit: 20 });
    scope.state.revisionPreview.mockResolvedValue({ revision, current: revision, diff: [], impacts: [] });
    scope.mount();
    expect(await screen.findByText('Door lock · Physical terminal: Select a compatible terminal')).toBeInTheDocument();
    expect(screen.getByText(/Rejected by controller/)).toBeInTheDocument();
    expect(screen.queryByText(/logicalChannels\[0\]/)).not.toBeInTheDocument();
    scope.state.acknowledge.mockImplementation(async () => {
      const saved = { ...revision, rejectionAcknowledgedAt: '2026-09-06', rejectionAcknowledgedBy: 7 };
      scope.state.history.mockResolvedValue({ revisions: [saved], offset: 0, limit: 20 });
      return saved;
    });
    const user = userEvent.setup();
    await scope.section(user, 'History');
    await user.click(screen.getByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    await waitFor(() => expect(scope.state.acknowledge).toHaveBeenCalledWith(1, 2, 'rejected', '2026-09-05'));
    expect(await screen.findByText(/Rejection acknowledged by user 7/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge rejection of revision 2' })).not.toBeInTheDocument();
  });
}

export function registerRendersLiteralEditorNamesInMetadataChanges(_scope: VisualConfigurationWorkflowTestScope): void {
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

export function registerRendersReportedConfigurationHardwareFaultsAndChannelSamplesWithoutTreatingThemAsReadines(
  scope: RootTestRegistrationsTestScope,
): void {
  it('renders reported configuration, hardware faults, and channel samples without treating them as readiness proof', async () => {
    const diagnostic = scope.diagnosticsFixture();
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
    scope.state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostic)));
    scope.mount();
    expect(await screen.findByText(/Runtime reports hardware unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Stream tracking limit reached/)).toBeInTheDocument();
    expect(screen.getByText(/controller rejected publication/)).toBeInTheDocument();
    expect(screen.getByText(/Recent fault on output: io-unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Latest output: false/)).toHaveTextContent('not current: source stale');
    expect(screen.getByText(/Last correlated acknowledgement:/)).toHaveTextContent('accepted · cmd-1');
    expect(screen.getByText(/Hardware readiness: unknown/)).toBeInTheDocument();
  });
}

export function registerReplacesACleanFocusedHostAuthoritativelyBeforeTheNextKeystroke(
  scope: ModbusReviewRegressionsTestScope,
): void {
  it('replaces a clean focused host authoritatively before the next keystroke', async () => {
    const snapshot = scope.fixture();
    const user = scope.start(snapshot);
    await scope.external(user, 'Connections');
    const host = await screen.findByRole('textbox', { name: 'Host' });
    await user.click(host);
    const refreshed = scope.fixture();
    const connection = refreshed.modbus!.connections[0];
    if (connection.transport === 'tcp') connection.host = 'new.fixture.invalid';
    await act(async () => {
      scope.client.setQueryData(['wago', 'configuration-draft', 1], scope.draftRecord(refreshed, 'refreshed'));
    });
    expect(host).toHaveFocus();
    await waitFor(() => expect(host).toHaveValue('new.fixture.invalid'));
    await user.keyboard('{End}-edited');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][1].modbus.connections[0].host).toBe('new.fixture.invalid-edited');
  });
}

export function registerRequiresASelectedInputForAGuardedOutputAndPreservesItsWatchdogConfiguration(
  scope: RootTestRegistrationsTestScope,
): void {
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
    scope.state.getDraft.mockResolvedValue({
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      reviewedHash: null,
      updatedAt: '2026-09-05',
      presetProvenance: JSON.stringify({ editor: { names: { 'guard-input': 'Door contact' }, presets: [] } }),
    });
    scope.mount();
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
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledOnce());
    const saved = scope.state.save.mock.calls[0][1] as WagoConfigurationSnapshot;
    expect(saved.logicalChannels.find((channel) => channel.profile === 'guarded-enable-request')).toMatchObject({
      guard: { channelId: 'guard-input', when: 'on' },
      disconnectPolicy: { mode: 'watchdog', timeoutMs: 2000 },
    });
    expect(validateEditorSnapshot(saved)).toEqual([]);
  });
}
