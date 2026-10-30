import type { WagoConfigurationSnapshot } from '../configuration/model';
import { wagoFlowPreview } from './preview';

const snapshot = {
  version: 1,
  modbus: { devices: [{ id: 'meter-1', name: 'Main meter' }] },
  physicalPoints: [
    { id: 'p-do', hardwareProfile: '751-9301', channel: 0 },
    { id: 'p-di', hardwareProfile: '751-9301', channel: 4 },
    { id: 'p-mb', hardwareProfile: 'modbus', channel: 0, modbus: { deviceId: 'meter-1' } },
  ],
  logicalChannels: [
    { id: 'lock', physicalPointId: 'p-do', capabilities: ['output', 'pulse'], pulse: { durationMs: 1500 } },
    { id: 'door', physicalPointId: 'p-di', capabilities: ['input'] },
    { id: 'power', physicalPointId: 'p-mb', capabilities: ['measurement'] },
  ],
} as unknown as WagoConfigurationSnapshot;

const english = (rows: ReturnType<typeof wagoFlowPreview>) => rows.map(({ label, value }) => ({ label, value }));

describe('localized WAGO flow previews', () => {
  it('localizes action and missing selections without translating configured names', () => {
    const rows = wagoFlowPreview({ action: 'set', value: false }, 'command', { name: 'Workshop' }, null, {});
    expect(rows.map((row) => row.translations?.de)).toEqual([
      { label: 'Gerät', value: 'Workshop' },
      { label: 'Kanal', value: 'Nicht ausgewählt' },
      { label: 'Aktion', value: 'Ausschalten' },
    ]);
  });
  it('localizes unavailable devices and numeric conditions while retaining zero', () => {
    const rows = wagoFlowPreview(
      { controllerId: 7, channelId: 'meter', category: 'measurement', equals: 0 },
      'wait',
      undefined,
      null,
      {},
    );
    expect(rows.map((row) => row.translations?.de)).toEqual([
      { label: 'Gerät', value: 'Controller 7 (nicht verfügbar)' },
      { label: 'Kanal', value: 'meter (nicht verfügbar)' },
      { label: 'Warten auf', value: 'Messwert = 0 (Rohwert)' },
      { label: 'Zeitlimit', value: '30 s' },
    ]);
  });
  it('names channels with their digital terminal and pulse duration', () => {
    const rows = wagoFlowPreview(
      { channelId: 'lock', action: 'pulse' },
      'command',
      { hardwareId: 'CC100-1' },
      snapshot,
      { lock: 'Front lock' },
    );
    expect(english(rows)).toEqual([
      { label: 'Device', value: 'CC100-1' },
      { label: 'Channel', value: 'Front lock · DO1' },
      { label: 'Action', value: 'Pulse · 1.5 s' },
    ]);
    expect(rows[2].translations?.de).toEqual({ label: 'Aktion', value: 'Impuls · 1.5 s' });
  });
  it('does not repeat a terminal already present in the configured name', () => {
    const rows = wagoFlowPreview({ channelId: 'door', category: 'state' }, 'event', { name: 'Hall' }, snapshot, {
      door: 'Door DI1',
    });
    expect(english(rows).slice(1)).toEqual([
      { label: 'Channel', value: 'Door DI1' },
      { label: 'When', value: 'Input state received' },
    ]);
  });
  it('appends the Modbus device and reads measurements', () => {
    const rows = wagoFlowPreview({ channelId: 'power', category: 'measurement' }, 'read', undefined, snapshot, {});
    expect(english(rows)).toEqual([
      { label: 'Device', value: 'Not selected' },
      { label: 'Channel', value: 'power · Main meter' },
      { label: 'Read', value: 'Measurement' },
    ]);
  });
  it('describes unselected commands, events and reads', () => {
    expect(english(wagoFlowPreview({ action: 'set' }, 'command', undefined, null, {}))[2]).toEqual({
      label: 'Action',
      value: 'Select ON/OFF',
    });
    expect(english(wagoFlowPreview({}, 'command', undefined, null, {}))[2].value).toBe('Not selected');
    expect(english(wagoFlowPreview({ action: 'pulse' }, 'command', undefined, null, {}))[2].value).toBe('Pulse');
    expect(english(wagoFlowPreview({}, 'event', undefined, null, {}))[2]).toEqual({
      label: 'When',
      value: 'Not selected',
    });
    expect(english(wagoFlowPreview({ category: 'other' }, 'read', undefined, null, {}))[2].value).toBe('Not selected');
  });
  it('describes boolean, unset and output-state waits with custom timeouts', () => {
    const on = wagoFlowPreview(
      { channelId: 'lock', category: 'state', equals: true, timeoutMs: 250 },
      'wait',
      undefined,
      snapshot,
      {},
    );
    expect(english(on).slice(2)).toEqual([
      { label: 'Wait for', value: 'Output state = ON' },
      { label: 'Timeout', value: '250 ms' },
    ]);
    expect(on[2].translations?.de).toEqual({ label: 'Warten auf', value: 'Ausgangszustand = EIN' });
    const off = wagoFlowPreview({ category: 'fault', equals: false }, 'wait', undefined, null, {});
    expect(off[2].value).toBe('Fault = OFF');
    const unset = wagoFlowPreview({ equals: Number.NaN }, 'wait', undefined, null, {});
    expect(unset[2].value).toBe('Not selected = Not set');
    expect(unset[2].translations?.de.value).toBe('Nicht ausgewählt = Nicht festgelegt');
  });
  it('marks a disabled channel as unavailable in both languages', () => {
    const disabled = {
      ...snapshot,
      logicalChannels: snapshot.logicalChannels.map((channel) =>
        channel.id === 'power' ? { ...channel, enabled: false as const } : channel,
      ),
    } as WagoConfigurationSnapshot;
    const rows = wagoFlowPreview({ controllerId: 1, channelId: 'power' }, 'read', { name: 'CC100' }, disabled, {});
    expect(rows[1]).toMatchObject({
      value: 'power · Main meter (disabled, unavailable)',
      translations: { de: { value: 'power · Main meter (deaktiviert, nicht verfügbar)' } },
    });
  });
});
