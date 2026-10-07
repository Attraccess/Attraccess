import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigurationEditor } from '../src/ConfigurationEditor';
import type { ConfigurationWorkspaceTestScope } from './visual-editor.test';
import type { ModbusReviewRegressionsTestScope } from './visual-editor.test';
import type { VisualConfigurationWorkflowTestScope } from './visual-editor.test';
import type { RootTestRegistrationsTestScope } from './visual-editor.test';
import { act } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import type { ModbusOutputAndSerialCompositionTestScope } from './visual-editor.test';

export function registerRetainsLocalEditsAcrossRouteUnmountsAndRequiresConfirmationToDiscardThem(
  scope: ConfigurationWorkspaceTestScope,
): void {
  it('retains local edits across route unmounts and requires confirmation to discard them', async () => {
    const close = vi.fn();
    const view = (id: number | null) => (
      <QueryClientProvider client={scope.client}>
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
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][3]).toMatchObject({
      snapshot: JSON.stringify(scope.state.snapshot),
      updatedAt: '2026-09-05',
    });
    expect(screen.queryByText('Saved draft changed')).not.toBeInTheDocument();
  });
}

export function registerRetainsTheCustomizedInputDisconnectPolicyWhenSelectingAnotherMeasurement(
  scope: ModbusReviewRegressionsTestScope,
): void {
  it('retains the customized input disconnect policy when selecting another measurement', async () => {
    const user = scope.start(scope.fixture());
    await user.click(await screen.findByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    expect(screen.getByRole('spinbutton', { name: 'Watchdog timeout (ms)' })).toHaveValue(2345);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][1].logicalChannels[0]).toMatchObject({
      id: 'reading',
      disconnectPolicy: { mode: 'watchdog', timeoutMs: 2345 },
      range: { minimum: 0, maximum: 1000 },
    });
  });
}

export function registerScopesDiagnosticsToTheSelectedControllerAndRemovesItWhenTheEditorCloses(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('scopes diagnostics to the selected controller and removes it when the editor closes', async () => {
    const view = (controllerId: number | null) => (
      <QueryClientProvider client={scope.client}>
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
      scope.client
        .getQueryCache()
        .find({ queryKey: ['wago', 'diagnostics', 1] })
        ?.getObserversCount(),
    ).toBe(0);
    expect(
      scope.client
        .getQueryCache()
        .find({ queryKey: ['wago', 'diagnostics', 2] })
        ?.getObserversCount(),
    ).toBe(0);
  });
}

export function registerShowsFieldValidationFailuresAndPreventsPersistenceUntilTheDraftIsValid(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows field validation failures and prevents persistence until the draft is valid', async () => {
    scope.state.validate.mockResolvedValue({
      valid: false,
      errors: [{ path: 'logicalChannels[0].profile', code: 'invalid_profile', message: 'Choose a supported profile' }],
    });
    scope.mount();
    const save = await screen.findByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(await screen.findByText('Resolve these configuration fields')).toBeInTheDocument();
    expect(screen.getAllByText(/Choose a supported profile/).length).toBeGreaterThan(0);
    expect(scope.state.save).not.toHaveBeenCalled();
  });
}

export function registerStartsFromTheAppliedConfigurationWhenNoSavedDraftExists(
  scope: ConfigurationWorkspaceTestScope,
): void {
  it('starts from the applied configuration when no saved draft exists', async () => {
    scope.state.getDraft.mockResolvedValue(null);
    scope.state.baseline.mockResolvedValue({
      revision: 4,
      snapshot: JSON.stringify(scope.state.snapshot),
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Applied lock', point: 'DO1' }, presets: [] } }),
    });
    scope.mount();
    expect(await screen.findByRole('textbox', { name: 'Channel name' })).toHaveValue('Applied lock');
    expect(screen.getByText('Starting from applied revision 4')).toBeVisible();
    expect(scope.state.save).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    expect(scope.state.save.mock.calls[0][1]).toEqual(scope.state.snapshot);
    expect(scope.state.save.mock.calls[0][3]).toBeNull();
  });
}

export function registerSwitchesDiagnosticStatusValuesWithTheHostLanguageWhilePreservingSourceIdentifiers(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('switches diagnostic status values with the host language while preserving source identifiers', async () => {
    const diagnostics = scope.diagnosticsFixture();
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
    scope.state.diagnostics.mockResolvedValue(new Response(JSON.stringify(diagnostics)));
    scope.mount();
    await scope.section(userEvent.setup(), 'Diagnostics');
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
    expect(scope.state.diagnostics).toHaveBeenCalledTimes(1);
  });
}

export function registerUsesLabelledTerminalsKeepsNamesOutsideTheSnapshotAndSavesOnlyExplicitly(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it('uses labelled terminals, keeps names outside the snapshot, and saves only explicitly', async () => {
    scope.mount();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Channel name' });
    expect(screen.queryByRole('textbox', { name: /JSON|Editable configuration draft/i })).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Workshop lock');
    expect(scope.state.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const [, snapshot, metadata] = scope.state.save.mock.calls[0];
    expect(snapshot.logicalChannels[0].id).toBe('output');
    expect(snapshot.physicalPoints[0].channel).toBe(0);
    expect(metadata.names.output).toBe('Workshop lock');
    expect(JSON.stringify(snapshot)).not.toContain('Workshop lock');
    expect(scope.state.publish).not.toHaveBeenCalled();
  });
}

export function registerUsesTheActualTransportSelectorToReplaceTcpFieldsWithValidSerialConfiguration(
  scope: ModbusOutputAndSerialCompositionTestScope,
): void {
  it('uses the actual transport selector to replace TCP fields with valid serial configuration', async () => {
    scope.mount();
    const user = userEvent.setup();
    await scope.external(user, 'Connections');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    await user.click(await screen.findByRole('option', { name: 'rtu' }));
    expect(screen.queryByRole('textbox', { name: 'Host' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const [, saved] = scope.state.save.mock.calls[0];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.modbus.connections[0]).toMatchObject({
      transport: 'rtu',
      path: '/dev/serial',
      baudRate: 9600,
      parity: 'even',
      stopBits: 1,
    });
    expect(saved.modbus.connections[0]).not.toHaveProperty('host');
    expect(saved.modbus.connections[0]).not.toHaveProperty('port');
  });
}
