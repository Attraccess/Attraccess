import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations, wagoTranslations } from './i18n';
// Integration test: verify the independent plugin catalogs against the same host language store.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { useShellyTranslations } from '../../../shelly/frontend/src/i18n';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { useRabbitmqTranslations } from '../../../rabbitmq/frontend/src/i18n';
// eslint-disable-next-line @nx/enforce-module-boundaries
import shellyEn from '../../../shelly/frontend/src/en.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import shellyDe from '../../../shelly/frontend/src/de.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import rabbitmqEn from '../../../rabbitmq/frontend/src/en.json';
// eslint-disable-next-line @nx/enforce-module-boundaries
import rabbitmqDe from '../../../rabbitmq/frontend/src/de.json';
import { ChannelWorkspace } from './ChannelWorkspace';
import { ConfigurationChanges } from './ConfigurationChanges';
import {
  emptyConfiguration,
  emptyMetadata,
  readableChangeValue,
  changeLabel,
  type Channel,
} from './configuration-model';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import { modbusDisplayName } from './modbus-labels';
import type { ModbusConnection, ModbusProfile, RegisterFormat } from '../../modbus/model';
import type { Freshness, WagoDiagnostics } from '../../diagnostics-types';
import type { CommissioningVerification, WagoConfigurationSnapshot } from './api';

beforeEach(() => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  vi.unstubAllGlobals();
});

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

it('localizes built-in Modbus review names while preserving custom names and metadata overrides', () => {
  const builtin = BUILTIN_MODBUS_PROFILES[1];
  const custom = duplicateProfile(builtin, 'custom-meter');
  custom.name = builtin.name;
  const snapshotFor = (profile: ModbusProfile): WagoConfigurationSnapshot => ({
    ...emptyConfiguration,
    physicalPoints: [
      {
        id: 'meter-point',
        hardwareProfile: 'modbus',
        channel: 0,
        modbus: { deviceId: 'active-power', measurementId: profile.measurements[0].id },
      },
    ],
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'tcp',
          host: '192.0.2.1',
          port: 502,
          timeoutMs: 1000,
          reconnectMs: 1000,
          queueLimit: 8,
        },
      ],
      devices: [
        {
          id: 'active-power',
          name: 'Meter.v1',
          connectionId: 'bus',
          unitId: 1,
          profileId: profile.id,
          profileVersion: 1,
        },
      ],
      profiles: [custom],
    },
  });
  const before = snapshotFor(builtin);
  const after = snapshotFor(custom);
  const changes = [
    { path: '$.modbus.devices[0].profileId', previous: builtin.id, current: custom.id },
    {
      path: '$.physicalPoints[0].modbus.measurementId',
      previous: builtin.measurements[0].id,
      current: custom.measurements[0].id,
    },
  ];
  const { rerender } = render(<ConfigurationChanges changes={changes} before={before} after={after} names={{}} />);
  expect(screen.getByText(`Before: ${builtin.name}`)).toBeTruthy();
  expect(screen.getByText(`After: ${custom.name}`)).toBeTruthy();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(screen.getByText('Vorher: WAGO 879-3000 — NICHT QUALIFIZIERT / Zuordnung nicht verifiziert')).toBeTruthy();
  expect(screen.getByText('Vorher: Wirkleistung')).toBeTruthy();
  expect(screen.getByText(`Nachher: ${custom.name}`)).toBeTruthy();
  expect(screen.getByText('Nachher: Active power')).toBeTruthy();
  rerender(
    <ConfigurationChanges
      changes={[{ path: '$', previous: null, current: before }]}
      before={null}
      after={before}
      names={{}}
    />,
  );
  expect(screen.getByText(/^Nachher:/).textContent).toContain('Wirkleistung');
  expect(screen.getByText(/^Nachher:/).textContent).toContain('Meter.v1');
  rerender(
    <ConfigurationChanges
      changes={[{ path: '$', previous: null, current: after }]}
      before={null}
      after={after}
      names={{}}
    />,
  );
  expect(screen.getByText(/^Nachher:/).textContent).toContain('Active power');
  expect(screen.getByText(/^Nachher:/).textContent).not.toContain('Wirkleistung');
  rerender(
    <ConfigurationChanges
      changes={changes}
      before={before}
      after={after}
      names={{ [builtin.id]: 'My meter.v1', [builtin.measurements[0].id]: 'My power.v2' }}
    />,
  );
  expect(screen.getByText('Vorher: My meter.v1')).toBeTruthy();
  expect(screen.getByText('Vorher: My power.v2')).toBeTruthy();
});

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

function leaves(record: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? [[path, value]]
        : Object.entries(leaves(value as Record<string, unknown>, path));
    }),
  );
}

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
      changeLabel({ path: `$.${path}`, previous: null, current: null }, null, emptyConfiguration, {}, result.current.t),
    ).toContain(result.current.t(key));
  }
});

it.each([
  ['WAGO', wagoTranslations.en, wagoTranslations.de],
  ['Shelly', shellyEn, shellyDe],
  ['RabbitMQ', rabbitmqEn, rabbitmqDe],
])('%s has matching catalog keys and interpolation variables in both languages', (_, en, de) => {
  const english = leaves(en as Record<string, unknown>);
  const german = leaves(de as Record<string, unknown>);
  expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
  for (const [key, value] of Object.entries(english)) {
    expect(german[key].match(/\{\{[^}]+\}\}/g)?.sort() ?? [], key).toEqual(value.match(/\{\{[^}]+\}\}/g)?.sort() ?? []);
  }
});
