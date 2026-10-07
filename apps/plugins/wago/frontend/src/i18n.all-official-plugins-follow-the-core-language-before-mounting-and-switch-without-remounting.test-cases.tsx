import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from './i18n';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { useShellyTranslations } from '../../../shelly/frontend/src/i18n';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { useRabbitmqTranslations } from '../../../rabbitmq/frontend/src/i18n';
import type { RootTestRegistrationsTestScope } from './i18n.test';
import { emptyConfiguration } from './configuration-model';
import { readableChangeValue } from './configuration-model';
import type { Channel } from './configuration-model';
import type { ModbusConnection } from '../../modbus/model';
import type { RegisterFormat } from '../../modbus/model';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ModbusChannels } from './ModbusChannels';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { duplicateProfile } from '../../modbus/model';
import { changeLabel } from './configuration-model';
import { ConfigurationMetadataChanges } from './ConfigurationChanges';
import englishPresets from './presets.en.json';
import germanPresets from './presets.de.json';

export function registerAllOfficialPluginsFollowTheCoreLanguageBeforeMountingAndSwitchWithoutRemounting(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('all official plugins follow the core language before mounting and switch without remounting', () => {
    useTranslationState.getState().setLanguage('de');
    const { result } = renderHook(() => ({
      wago: useWagoTranslations(),
      shelly: useShellyTranslations(),
      rabbitmq: useRabbitmqTranslations(),
    }));
    expect(result.current.wago.t('controllers.title')).toBe('WAGO-Steuerungen');
    expect(result.current.shelly.t('devices.title')).toBe('Shelly-Geräte');
    expect(result.current.rabbitmq.t('users.title')).toBe('RabbitMQ-Benutzer');
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(result.current.wago.t('controllers.title')).toBe('WAGO controllers');
    expect(result.current.shelly.t('devices.title')).toBe('Shelly Devices');
    expect(result.current.rabbitmq.t('users.title')).toBe('RabbitMQ users');
  });
}

export function registerCoversEveryConfigurationEnumAndReusesEditorLabelsInEnglishAndGermanReviews(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('covers every configuration enum and reuses editor labels in English and German reviews', () => {
    const choices = {
      mode: { hold: 'channels.hold', immediate: 'channels.immediate', watchdog: 'channels.watchdog' },
      expected: { match: 'channels.match', inverse: 'channels.inverse' },
      when: { on: 'fields.values.on', off: 'fields.values.off' },
      capabilities: {
        output: 'fields.values.output',
        input: 'fields.values.input',
        measurement: 'fields.values.measurement',
        pulse: 'fields.values.pulse',
        guard: 'fields.values.guard',
        feedback: 'fields.values.feedback',
      },
      unit: {
        ampere: 'modbus.options.ampere',
        volt: 'modbus.options.volt',
        watt: 'modbus.options.watt',
        'watt-hour': 'modbus.options.watt-hour',
        percent: 'modbus.options.percent',
        hertz: 'modbus.options.hertz',
        var: 'modbus.options.var',
        'var-hour': 'modbus.options.var-hour',
        'volt-ampere': 'modbus.options.volt-ampere',
        ratio: 'modbus.options.ratio',
        number: 'modbus.options.number',
        second: 'modbus.options.second',
        'pulse-per-kilowatt-hour': 'modbus.options.pulse-per-kilowatt-hour',
      },
      kind: { live: 'modbus.options.live', cumulative: 'modbus.options.cumulative' },
      parity: { none: 'modbus.options.none', even: 'modbus.options.even', odd: 'modbus.options.odd' },
      byteOrder: { big: 'modbus.options.big', little: 'modbus.options.little' },
      wordOrder: { big: 'modbus.options.big', little: 'modbus.options.little' },
      profile: {
        'metered-switched-load': 'presets.items.metered-switched-load.name',
        'pulsed-lock-bank': 'presets.items.pulsed-lock-bank.name',
        'guarded-enable-request': 'presets.items.guarded-enable-request.name',
        'generic-digital-output': 'presets.items.generic-digital-output.name',
        'generic-monitored-input': 'presets.items.generic-monitored-input.name',
      },
    } satisfies {
      mode: Record<Channel['disconnectPolicy']['mode'], string>;
      expected: Record<NonNullable<Channel['feedback']>['expected'], string>;
      when: Record<NonNullable<Channel['guard']>['when'], string>;
      capabilities: Record<Channel['capabilities'][number], string>;
      unit: Record<NonNullable<Channel['measurement']>['unit'], string>;
      kind: Record<NonNullable<NonNullable<Channel['measurement']>['kind']>, string>;
      parity: Record<Extract<ModbusConnection, { transport: 'rtu' }>['parity'], string>;
      byteOrder: Record<RegisterFormat['byteOrder'], string>;
      wordOrder: Record<RegisterFormat['wordOrder'], string>;
      profile: Record<Channel['profile'], string>;
    };
    const { result } = renderHook(() => useWagoTranslations());
    for (const language of ['en', 'de'] as const) {
      act(() => useTranslationState.setState({ language }));
      for (const [field, values] of Object.entries(choices)) {
        for (const [value, key] of Object.entries(values)) {
          expect(result.current.tExists(key), key).toBe(true);
          expect(
            readableChangeValue(`$.logicalChannels[0].${field}`, value, emptyConfiguration, {}, result.current.t),
          ).toBe(result.current.t(key));
          if (language === 'en') {
            expect(readableChangeValue(`$.logicalChannels[0].${field}`, value, emptyConfiguration, {})).toBe(
              result.current.t(key),
            );
          }
        }
      }
      expect(
        readableChangeValue(
          '$.logicalChannels[0].measurement',
          { unit: 'percent', kind: 'cumulative' },
          emptyConfiguration,
          {},
          result.current.t,
        ),
      ).toContain(result.current.t('modbus.options.percent'));
    }
  });
}

export function registerExplainsCleanupLockContentionInTheSelectedLanguageIncludingPartialCleanup(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('explains cleanup lock contention in the selected language, including partial cleanup', () => {
    const { result } = renderHook(() => useWagoTranslations());
    const reason =
      'The runtime monitor or another operation did not release the controller lock within 310 seconds. Wait a few minutes and retry cleanup. Do not delete the lock file.';
    const message = `Installation cleanup failed (busy). ${reason}`;
    expect(result.current.tBackendMessage(message)).toBe(message);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.tBackendMessage(message)).toContain('Steuerungssperre');
    expect(result.current.tBackendMessage(message)).toContain('310 Sekunden');
    expect(
      result.current.tBackendMessage(
        `${message} Runtime cleanup completed; retry cleanup to finish controller preparation and credential revocation.`,
      ),
    ).toContain('Die Laufzeit wurde bereinigt');
  });
}

export function registerLocalizesModbusAddButtonsWithoutSavingTranslatedSignalNames(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('localizes Modbus add buttons without saving translated signal names', async () => {
    const builtin = BUILTIN_MODBUS_PROFILES[0];
    const custom = duplicateProfile(builtin, 'custom-meter');
    custom.actions = [
      { ...custom.measurements[0], id: 'relay', name: 'Active power', functionCode: 5, onValue: 1, offValue: 0 },
    ];
    const configuration = {
      connections: [],
      profiles: [custom],
      devices: [builtin, custom].map((profile, index) => ({
        id: `meter-${index}`,
        name: `Meter ${index}`,
        connectionId: 'bus',
        unitId: index + 1,
        profileId: profile.id,
        profileVersion: profile.version,
      })),
    };
    const onAdd = vi.fn();
    render(<ModbusChannels configuration={configuration} onAdd={onAdd} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Active power from Meter 0' }));
    expect(onAdd).toHaveBeenLastCalledWith(
      { deviceId: 'meter-0', measurementId: 'active-power' },
      'Meter 0: Active power',
    );
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Wirkleistung von Meter 0 hinzufügen' }));
    expect(onAdd).toHaveBeenLastCalledWith(
      { deviceId: 'meter-0', measurementId: 'active-power' },
      'Meter 0: Active power',
    );
    for (const button of screen.getAllByRole('button', { name: 'Active power von Meter 1 hinzufügen' }))
      await user.click(button);
    expect(onAdd).toHaveBeenLastCalledWith({ deviceId: 'meter-1', actionId: 'relay' }, 'Meter 1: Active power');
  });
}

export function registerLocalizesNestedAndIndexedDiffHeadingsWhileRetainingFullPathOverrides(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('localizes nested and indexed diff headings while retaining full-path overrides', () => {
    const { result } = renderHook(() => useWagoTranslations());
    act(() => useTranslationState.setState({ language: 'de' }));
    const headings = {
      'logicalChannels[0].range.minimum': 'fields.minimum',
      'logicalChannels[0].range.maximum': 'fields.maximum',
      'logicalChannels[0].measurement.scale': 'fields.scale',
      'logicalChannels[0].measurement.offset': 'fields.offset',
      'logicalChannels[0].capabilities[1]': 'fields.capabilities',
      'logicalChannels[0].disconnectPolicy.timeoutMs': 'fields.disconnectPolicy_timeoutMs',
      'physicalPoints[0].hardwareProfile': 'fields.hardwareProfile',
      'physicalPoints[0].modbus.deviceId': 'fields.modbus_deviceId',
      'physicalPoints[0].modbus.measurementId': 'fields.modbus_measurementId',
      'physicalPoints[0].modbus.actionId': 'fields.modbus_actionId',
      'modbus.connections[0].parity': 'modbus.parity',
      'modbus.profiles[0].measurements[0].byteOrder': 'modbus.byteOrder',
    };
    for (const [path, key] of Object.entries(headings)) {
      expect(result.current.tExists(key), key).toBe(true);
      expect(
        changeLabel(
          { path: `$.${path}`, previous: null, current: null },
          null,
          emptyConfiguration,
          {},
          result.current.t,
        ),
      ).toContain(result.current.t(key));
    }
  });
}

export function registerLocalizesPresetMetadataObjectsAndLeavesWhilePreservingUnknownPresetIdsAndNames(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('localizes preset metadata objects and leaves while preserving unknown preset IDs and names', () => {
    const presetId = 'generic-digital-output';
    const changes = [
      {
        path: '$.presets[0]',
        previous: null,
        current: { presetId, channelId: 'channel', guardChannelId: 'guard', feedbackChannelId: 'feedback' },
      },
      { path: '$.presets[0].presetId', previous: 'vendor.preset-v2', current: presetId },
      { path: '$.presets[0].guardChannelId', previous: 'unknown-guard', current: 'guard' },
      { path: '$.presets[0].feedbackChannelId', previous: null, current: 'feedback' },
      { path: '$.names.channel', previous: null, current: presetId },
    ];
    render(
      <ConfigurationMetadataChanges
        changes={changes}
        names={{
          channel: 'Workshop',
          guard: 'R&D <Guard>',
          feedback: 'Door feedback',
          [presetId]: 'Unrelated ID alias',
        }}
      />,
    );
    expect(screen.getByText(`After: ${englishPresets.items[presetId].name}`)).toBeTruthy();
    expect(screen.getByText(/After: Preset:/).textContent).toContain('Guard input: R&D <Guard>');
    expect(screen.getByText(/After: Preset:/).textContent).toContain('Feedback input: Door feedback');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(`Nachher: ${germanPresets.items[presetId].name}`)).toBeTruthy();
    expect(screen.getByText('Vorher: vendor.preset-v2')).toBeTruthy();
    expect(screen.getByText(`Nachher: ${presetId}`)).toBeTruthy();
    expect(screen.getByText(/Nachher: Vorlage:/).textContent).toContain(germanPresets.items[presetId].name);
    expect(screen.getByText(/Nachher: Vorlage:/).textContent).toContain('Workshop');
    expect(screen.getByText(/Nachher: Vorlage:/).textContent).toContain('Freigabeeingang: R&D <Guard>');
    expect(screen.getByText(/Nachher: Vorlage:/).textContent).toContain('Rückmeldeeingang: Door feedback');
    expect(screen.getByText('Nachher: R&D <Guard>')).toBeTruthy();
    expect(screen.getByText('Nachher: Door feedback')).toBeTruthy();
    expect(screen.getByText('Vorher: unknown-guard')).toBeTruthy();
  });
}
