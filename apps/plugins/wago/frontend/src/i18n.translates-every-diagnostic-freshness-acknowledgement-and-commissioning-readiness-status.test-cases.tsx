import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from './i18n';
import type { Freshness } from '../../diagnostics-types';
import type { WagoDiagnostics } from '../../diagnostics-types';
import type { CommissioningVerification } from './api';
import type { RootTestRegistrationsTestScope } from './i18n.test';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { duplicateProfile } from '../../modbus/model';
import { modbusDisplayName } from './modbus-labels';
import { pulseBehaviorError } from '../../channel-behavior';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelWorkspace } from './ChannelWorkspace';
import { emptyConfiguration } from './configuration-model';
import { emptyMetadata } from './configuration-model';

export function registerTranslatesEveryDiagnosticFreshnessAcknowledgementAndCommissioningReadinessStatus(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates every diagnostic freshness, acknowledgement and commissioning readiness status', () => {
    const statuses = {
      missing: 'Fehlend',
      invalid: 'Ungültig',
      future: 'In der Zukunft',
      stale: 'Veraltet',
      fresh: 'Aktuell',
      unverified: 'Nicht verifiziert',
      ready: 'Bereit',
      not_ready: 'Nicht bereit',
      accepted: 'Akzeptiert',
      duplicate: 'Duplikat',
      rejected: 'Abgelehnt',
      'dispatch-failed': 'Versand fehlgeschlagen',
      timeout: 'Zeitüberschreitung',
    } satisfies Record<
      | Freshness
      | CommissioningVerification['hardwareReadiness']
      | NonNullable<WagoDiagnostics['channels'][number]['acknowledgement']>['status'],
      string
    >;
    const { result } = renderHook(() => useWagoTranslations());
    for (const [status, german] of Object.entries(statuses)) {
      expect(result.current.tBackendMessage(status)).toBe(status);
      act(() => useTranslationState.getState().setLanguage('de'));
      expect(result.current.tBackendMessage(status)).toBe(german);
      act(() => useTranslationState.getState().setLanguage('en'));
    }
  });
}

export function registerTranslatesRetainedBackendMessagesStatusesAndBuiltinNamesWhilePreservingCustomNamesAndDi(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates retained backend messages, statuses and builtin names while preserving custom names and diagnostics', () => {
    const { result } = renderHook(() => useWagoTranslations());
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.tBackendMessage('Confirm controller identity')).toBe('Identität der Steuerung bestätigen');
    expect(result.current.tBackendMessage('Uploading runtime bundle: 42%.')).toBe(
      'Laufzeitpaket wird hochgeladen: 42 %.',
    );
    expect(result.current.tBackendMessage('unique non-empty ID required')).toBe(
      'Eindeutige, nicht leere ID erforderlich',
    );
    expect(result.current.tBackendMessage('key_enrolled')).toBe('Schlüssel registriert');
    expect(result.current.tBackendMessage('off (runtime default)')).toBe('Aus (Standard der Laufzeitumgebung)');
    expect(result.current.tBackendMessage('not applicable')).toBe('Nicht zutreffend');
    expect(result.current.tBackendMessage('logical channel input-42 does not exist in this snapshot')).toBe(
      'Logischer Kanal input-42 ist in dieser Konfigurationsaufnahme nicht vorhanden',
    );
    expect(result.current.tBackendMessage('Channel removed. Existing flow references may fail.')).toBe(
      'Kanal entfernt. Vorhandene Ablaufreferenzen können fehlschlagen.',
    );
    expect(result.current.tBackendMessage('Unknown diagnostic: device-42')).toBe('Unknown diagnostic: device-42');
    expect(result.current.tBackendMessage(undefined)).toBe('');
    const builtin = BUILTIN_MODBUS_PROFILES[0];
    expect(modbusDisplayName(builtin, 'Active power', result.current.tBackendMessage)).toBe('Wirkleistung');
    expect(modbusDisplayName(duplicateProfile(builtin, 'custom'), 'Active power', result.current.tBackendMessage)).toBe(
      'Active power',
    );
    expect(result.current.t('remove.question', { name: 'R&D <Workshop>' })).toBe(
      'R&D <Workshop> aus Attraccess entfernen?',
    );
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(result.current.tBackendMessage('Confirm controller identity')).toBe('Confirm controller identity');
  });
}

export function registerTranslatesRuntimeFailuresAndProtocolCompatibilityWhilePreservingTheirIdentifiersAndMeasur(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates runtime failures and protocol compatibility while preserving their identifiers and measurements', () => {
    const { result } = renderHook(() => useWagoTranslations());
    const runtime =
      'Runtime delivery failed: local-timeout, SSH exit unknown, 301s elapsed. Runtime supervisor launch unverified: readiness. Use reviewed recovery before retrying.';
    expect(result.current.tBackendMessage(runtime)).toBe(runtime);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.tBackendMessage(runtime)).toBe(
      'Laufzeitbereitstellung fehlgeschlagen: Lokales Zeitlimit überschritten, SSH-Exitcode unknown, 301 s vergangen. Start der Laufzeitüberwachung nicht verifiziert: Bereitschaft. Verwende vor dem erneuten Versuch die geprüfte Wiederherstellung.',
    );
    expect(
      result.current.tBackendMessage(
        'Protocol version "vendor.v2" is invalid; install a CC100 runtime using protocol 1.x.',
      ),
    ).toBe('Protokollversion „vendor.v2“ ist ungültig; installiere eine CC100-Laufzeitumgebung mit Protokoll 1.x.');
    expect(result.current.tBackendMessage('Protocol 2.3 is incompatible; this plugin supports protocol 1.x.')).toBe(
      'Protokoll 2.3 ist inkompatibel; dieses Plugin unterstützt Protokoll 1.x.',
    );
    expect(
      result.current.tBackendMessage(
        'Controller is missing required capabilities: digital-output.v1, diagnostics.v2. Update the CC100 runtime.',
      ),
    ).toBe(
      'Der Steuerung fehlen erforderliche Fähigkeiten: digital-output.v1, diagnostics.v2. Aktualisiere die CC100-Laufzeitumgebung.',
    );
  });
}

export function registerTranslatesTheActualSharedPulseValidationMessageThroughTheHostLanguageStore(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates the actual shared pulse validation message through the host language store', () => {
    const message = pulseBehaviorError(['output', 'pulse'], { durationMs: 0 });
    const { result } = renderHook(() => useWagoTranslations());
    expect(result.current.tValidationMessage(message)).toBe(message);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.tValidationMessage(message)).toBe(
      'Für Impulse sind die Fähigkeiten Ausgang und Impuls sowie eine positive ganzzahlige Impulsdauer in Millisekunden erforderlich.',
    );
  });
}

export function registerTranslatesTheBackendOwnedReasonsThatDiagnosticSamplesAreNotCurrent(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates the backend-owned reasons that diagnostic samples are not current', () => {
    const reasons = {
      untrusted: 'Nicht vertrauenswürdig',
      'incompatible-runtime': 'Inkompatible Laufzeitumgebung',
      'stream-tracking-exhausted': 'Grenze der Datenstromverfolgung erreicht',
      'disconnected-or-unknown': 'Getrennt oder unbekannt',
      'hardware-unavailable': 'Hardware nicht verfügbar',
      'configuration-mismatch': 'Konfigurationsabweichung',
      'recent-fault': 'Aktueller Fehler',
      'state-source-unavailable-or-stale': 'Quellzustand nicht verfügbar oder veraltet',
      'old-or-legacy-stream': 'Alter Datenstrom oder Altversion',
      'source-missing': 'Quellzeit fehlt',
      'source-invalid': 'Ungültige Quellzeit',
      'source-future': 'Quellzeit liegt in der Zukunft',
      'source-stale': 'Quellmesswert veraltet',
    };
    const { result } = renderHook(() => useWagoTranslations());
    for (const [reason, german] of Object.entries(reasons)) {
      expect(result.current.tBackendMessage(reason)).toBe(reason);
      act(() => useTranslationState.getState().setLanguage('de'));
      expect(result.current.tBackendMessage(reason)).toBe(german);
      act(() => useTranslationState.getState().setLanguage('en'));
    }
  });
}

export function registerUpdatesVisibleLabelsWhilePreservingAChannelCreationFormAndItsUserEnteredName(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('updates visible labels while preserving a channel creation form and its user-entered name', async () => {
    render(
      <ChannelWorkspace
        snapshot={emptyConfiguration}
        metadata={emptyMetadata}
        onChange={() => undefined}
        onMetadataChange={() => undefined}
        onExternal={() => undefined}
      />,
    );
    act(() => screen.getByRole('button', { name: 'Add channel' }).click());
    act(() => screen.getByRole('button', { name: 'Continue' }).click());
    const input = screen.getByRole('textbox', { name: 'New channel name' }) as HTMLInputElement;
    await userEvent.setup().type(input, 'Workshop door');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByRole('textbox', { name: 'Neuer Kanalname' })).toBe(input);
    expect(input.value).toBe('Workshop door');
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeTruthy();
  });
}
