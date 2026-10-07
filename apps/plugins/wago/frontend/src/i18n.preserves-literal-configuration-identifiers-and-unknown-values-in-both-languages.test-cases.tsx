import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from './i18n';
import { emptyConfiguration } from './configuration-model';
import { readableChangeValue } from './configuration-model';
import type { RootTestRegistrationsTestScope } from './i18n.test';
import { render } from '@testing-library/react';
import { ConfigurationErrors } from './ConfigurationChanges';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { duplicateProfile } from '../../modbus/model';
import type { WagoConfigurationSnapshot } from './api';
import { wagoTranslations } from './i18n';
// eslint-disable-next-line @nx/enforce-module-boundaries
import shellyEn from '../../../shelly/frontend/src/en.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import shellyDe from '../../../shelly/frontend/src/de.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import rabbitmqEn from '../../../rabbitmq/frontend/src/en.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import rabbitmqDe from '../../../rabbitmq/frontend/src/de.json';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ChannelWorkspace } from './ChannelWorkspace';
import englishPresets from './presets.en.json';
import germanPresets from './presets.de.json';
import { emptyMetadata } from './configuration-model';
import { changeLabel } from './configuration-model';

export function registerPreservesLiteralConfigurationIdentifiersAndUnknownValuesInBothLanguages(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('preserves literal configuration identifiers and unknown values in both languages', () => {
    const { result } = renderHook(() => useWagoTranslations());
    for (const language of ['en', 'de'] as const) {
      act(() => useTranslationState.getState().setLanguage(language));
      for (const value of ['sensor.v1', 'meter-input_2', 'MixedCaseID', 'Unknown.Diagnostic-v2']) {
        for (const field of ['id', 'physicalPointId', 'profile', 'mode']) {
          expect(
            readableChangeValue(`$.logicalChannels[0].${field}`, value, emptyConfiguration, {}, result.current.t),
          ).toBe(value);
        }
        expect(
          readableChangeValue('$.logicalChannels[0]', { id: value }, emptyConfiguration, {}, result.current.t),
        ).toContain(value);
        expect(readableChangeValue('$.logicalChannels[0].id', value, emptyConfiguration, {})).toBe(value);
      }
    }
  });
}

export function registerPreservesLiteralValidationTextAndResolvesOnlyExactReferencesInRecognizedMessages(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('preserves literal validation text and resolves only exact references in recognized messages', () => {
    const messages = [
      'Unknown diagnostic: point-10 / on / Connection closed',
      'physical point point-10 does not exist in this snapshot',
      'physical point point-100 does not exist in this snapshot',
    ];
    const { container } = render(
      <ConfigurationErrors
        errors={messages.map((message, index) => ({
          path: `$.logicalChannels[${index}].physicalPointId`,
          code: 'missing_reference',
          message,
        }))}
        snapshot={emptyConfiguration}
        names={{ point: 'Wrong substring', 'point-10': 'R&D <Workshop>', on: 'Unrelated alias' }}
      />,
    );
    const texts = () => [...container.querySelectorAll('li')].map((item) => item.textContent);
    expect(texts()[0]).toContain(messages[0]);
    expect(texts()[1]).toContain('physical point R&D <Workshop> does not exist in this snapshot');
    expect(texts()[2]).toContain(messages[2]);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(texts()[0]).toContain(messages[0]);
    expect(texts()[1]).toContain(
      'Physischer Punkt R&D <Workshop> ist in dieser Konfigurationsaufnahme nicht vorhanden',
    );
    expect(texts()[2]).toContain('Physischer Punkt point-100 ist in dieser Konfigurationsaufnahme nicht vorhanden');
  });
}

export function registerResolvesModbusProfileReferencesByTheSelectedDeviceVersion(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('resolves Modbus profile references by the selected device version', () => {
    const first = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'shared-profile');
    first.name = 'First profile';
    const second = { ...first, version: 2, name: 'Second profile' };
    const snapshot: WagoConfigurationSnapshot = {
      ...emptyConfiguration,
      modbus: {
        connections: [],
        profiles: [first, second],
        devices: [
          {
            id: 'meter',
            name: 'Meter',
            connectionId: 'bus',
            unitId: 1,
            profileId: first.id,
            profileVersion: 2,
          },
        ],
      },
    };
    const { result } = renderHook(() => useWagoTranslations());
    expect(readableChangeValue('$.modbus.devices[0].profileId', first.id, snapshot, {}, result.current.t)).toBe(
      'Second profile',
    );
    expect(readableChangeValue('$', snapshot, snapshot, {}, result.current.t)).toContain('Profile ID: Second profile');
  });
}

export function registerSHasMatchingCatalogKeysAndInterpolationVariablesInBothLanguages(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each([
    ['WAGO', wagoTranslations.en, wagoTranslations.de],
    ['Shelly', shellyEn, shellyDe],
    ['RabbitMQ', rabbitmqEn, rabbitmqDe],
  ])('%s has matching catalog keys and interpolation variables in both languages', (_, en, de) => {
    const english = scope.leaves(en as Record<string, unknown>);
    const german = scope.leaves(de as Record<string, unknown>);
    expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(german[key].match(/\{\{[^}]+\}\}/g)?.sort() ?? [], key).toEqual(
        value.match(/\{\{[^}]+\}\}/g)?.sort() ?? [],
      );
    }
  });
}

export function registerSwitchesChannelPresetLabelsAndPreservesUnknownIdentifiersSS(
  _scope: RootTestRegistrationsTestScope,
): void {
  it.each([
    ['751-9301', 'generic-digital-output'],
    ['879-3000', 'generic-digital-output'],
    ['751-9301', 'vendor-profile.v2'],
    ['879-3000', 'vendor-profile.v2'],
  ])('switches channel preset labels and preserves unknown identifiers (%s, %s)', (hardwareProfile, profile) => {
    // A future saved profile can be unknown to this frontend version.
    const snapshot: WagoConfigurationSnapshot = JSON.parse(
      JSON.stringify({
        version: 1,
        physicalPoints: [{ id: 'point', hardwareProfile, channel: 0 }],
        logicalChannels: [
          {
            id: 'channel',
            physicalPointId: 'point',
            profile,
            capabilities: ['output'],
            disconnectPolicy: { mode: 'immediate' },
          },
        ],
      }),
    );
    const onChange = vi.fn();
    const onMetadataChange = vi.fn();
    render(
      <ChannelWorkspace
        snapshot={snapshot}
        metadata={emptyMetadata}
        focusChannelId="channel"
        onChange={onChange}
        onMetadataChange={onMetadataChange}
        onExternal={() => undefined}
      />,
    );
    const builtin = profile === 'generic-digital-output';
    const english = builtin ? englishPresets.items['generic-digital-output'].name : profile;
    const german = builtin ? germanPresets.items['generic-digital-output'].name : profile;
    const sentence = (name: string, language: 'en' | 'de') =>
      hardwareProfile === '751-9301'
        ? language === 'en'
          ? `Setup preset: ${name}. Customize the behavior below.`
          : `Einrichtungsvorlage: ${name}. Passe das Verhalten unten an.`
        : language === 'en'
          ? `Existing ${name} configuration is preserved. This hardware module requires its dedicated editor.`
          : `Die vorhandene Konfiguration ${name} bleibt erhalten. Dieses Hardware-Modul benötigt seinen eigenen Editor.`;
    expect(screen.getByText(sentence(english, 'en'))).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(sentence(german, 'de'))).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.getByText(sentence(english, 'en'))).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(onMetadataChange).not.toHaveBeenCalled();
  });
}

export function registerSwitchesThePersistedCommissioningFailureS(_scope: RootTestRegistrationsTestScope): void {
  it.each([
    'Not enough free storage on the CC100 for this runtime. Free space and retry.',
    'The CC100 is busy with a runtime operation. Retry installation shortly; no preparation was started.',
    'Controller preflight could not be read. Check the explicit SSH credential and supported firmware tools.',
    'Controller preparation failed. Check the runtime release, staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.',
    'Controller preparation cleanup remains unverified. Clean up any runtime transaction first, then retry preparation cleanup. The recovery token is retained; previous workloads are not restored.',
    'Delivery failed. Controller recovery may be required; check access and runtime prerequisites.',
    'Automatic MQTT credential provisioning is unavailable for this server. Check its MQTT settings.',
    'Unsupported CC100 model or firmware baseline.',
    'Delivery failed; bootstrap credential revocation requires attention.',
    'Installation cleanup or credential revocation failed; finish the retained recovery before retrying delivery.',
    'Automatic claim failed.',
    'Commissioning verifier is unavailable; credential revocation requires attention.',
    'Controller preparation was interrupted. Clean up the retained attempt before retrying.',
    'Commissioning was interrupted.',
    'Controller preparation failed. Check staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.',
    'Runtime prerequisites failed. Check vendor Docker, exclusive onboard IO, available storage and required firmware tools.',
    'Controller UTC inspection or synchronization failed. Enrollment is blocked; retry with fresh install consent and SSH credentials. Check the application UTC clock and supported FW31 clock tool. Clock changes are not rolled back by cleanup.',
    'Enrollment or runtime delivery failed. Clean up the retained installation before retrying; previous workloads will not be restored.',
    'Application UTC changed or controller clock verification expired before enrollment. No new enrollment credential was issued; retry with fresh install consent.',
  ])('switches the persisted commissioning failure: %s', (failure) => {
    const { result } = renderHook(() => useWagoTranslations());
    expect(result.current.tBackendMessage(failure)).toBe(failure);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.tExists(failure)).toBe(true);
    expect(result.current.tBackendMessage(failure)).not.toBe(failure);
    expect(result.current.tBackendMessage('unknown failure <controller>')).toBe('unknown failure <controller>');
  });
}

export function registerTranslatesConfigurationChoicesByFieldWithoutTranslatingUserNamesOrIdentifiers(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('translates configuration choices by field without translating user names or identifiers', () => {
    const { result } = renderHook(() => useWagoTranslations());
    const renderValue = (path: string, value: unknown) =>
      readableChangeValue(path, value, emptyConfiguration, {}, result.current.t);
    expect(renderValue('$.logicalChannels[0].disconnectPolicy.mode', 'immediate')).toBe('Immediately off');
    act(() => useTranslationState.setState({ language: 'de' }));
    expect(renderValue('$.logicalChannels[0].disconnectPolicy.mode', 'immediate')).toBe('Sofort aus');
    expect(renderValue('$.logicalChannels[0].guard.when', 'on')).toBe('Ein');
    expect(renderValue('$.logicalChannels[0].measurement.kind', 'cumulative')).toBe('kumulativ');
    for (const field of ['unit', 'kind']) {
      expect(
        changeLabel(
          { path: `$.logicalChannels[0].measurement.${field}`, previous: null, current: null },
          null,
          emptyConfiguration,
          {},
          result.current.t,
        ),
      ).toContain(result.current.t(`fields.measurement_${field}`));
    }
    expect(renderValue('$.logicalChannels[0].capabilities', ['input', 'feedback'])).toBe('Eingang, Rückmeldung');
    expect(renderValue('$.logicalChannels[0].name', 'on')).toBe('on');
    expect(renderValue('$.logicalChannels[0].id', 'immediate')).toBe('immediate');
  });
}
