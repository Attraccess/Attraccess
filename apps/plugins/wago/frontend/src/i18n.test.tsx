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
import {
  emptyConfiguration,
  emptyMetadata,
  readableChangeValue,
  changeLabel,
  type Channel,
} from './configuration-model';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import { modbusDisplayName } from './modbus-labels';

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
  } satisfies {
    mode: Record<Channel['disconnectPolicy']['mode'], string>;
    expected: Record<NonNullable<Channel['feedback']>['expected'], string>;
    when: Record<NonNullable<Channel['guard']>['when'], string>;
    capabilities: Record<Channel['capabilities'][number], string>;
    unit: Record<NonNullable<Channel['measurement']>['unit'], string>;
    kind: Record<NonNullable<NonNullable<Channel['measurement']>['kind']>, string>;
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
