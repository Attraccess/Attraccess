import type { PluginFlowNodePreviewRow } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from './configuration';
import { DIGITAL_TERMINALS } from './configuration-digital';

/** Opt in to resolving a plugin-owned summary on the flow canvas. */
export const WAGO_FLOW_PREVIEW_SCHEMA = { dynamic: true, type: 'object', properties: {}, preview: [] };

type PreviewRow = { label: string; value: string };
type PreviewKind = 'command' | 'event' | 'read' | 'wait';

export function wagoFlowPreview(
  config: Record<string, unknown>,
  kind: PreviewKind,
  controller: { name?: string | null; hardwareId?: string } | undefined,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, unknown>,
): PluginFlowNodePreviewRow[] {
  const english = localizedPreview(config, kind, controller, snapshot, names, false);
  const german = localizedPreview(config, kind, controller, snapshot, names, true);
  return english.map((row, index) => ({ ...row, translations: { de: german[index] } }));
}

function localizedPreview(
  config: Record<string, unknown>,
  kind: PreviewKind,
  controller: { name?: string | null; hardwareId?: string } | undefined,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, unknown>,
  german: boolean,
): PreviewRow[] {
  const text = (english: string, translated: string) => (german ? translated : english);
  const channel = snapshot?.logicalChannels.find((item) => item.id === config.channelId);
  const point = snapshot?.physicalPoints?.find((item) => item.id === channel?.physicalPointId);
  let channelName = channel
    ? typeof names[channel.id] === 'string'
      ? String(names[channel.id])
      : channel.id
    : typeof config.channelId === 'string'
      ? `${config.channelId} (${text('unavailable', 'nicht verfügbar')})`
      : text('Not selected', 'Nicht ausgewählt');
  if (point?.modbus) {
    const device = snapshot?.modbus?.devices.find((item) => item.id === point.modbus?.deviceId);
    if (device) channelName = `${channelName} · ${device.name}`;
  } else if (point?.hardwareProfile === '751-9301') {
    const terminal = DIGITAL_TERMINALS.find((item) => item.channel === point.channel)?.label;
    if (terminal && !channelName.includes(terminal)) channelName += ` · ${terminal}`;
  }
  const rows: PreviewRow[] = [
    {
      label: text('Device', 'Gerät'),
      value:
        controller?.name ||
        controller?.hardwareId ||
        (typeof config.controllerId === 'number'
          ? `Controller ${config.controllerId} (${text('unavailable', 'nicht verfügbar')})`
          : text('Not selected', 'Nicht ausgewählt')),
    },
    { label: text('Channel', 'Kanal'), value: channelName },
  ];
  if (kind === 'command') {
    const action =
      config.action === 'set'
        ? config.value === true
          ? text('Turn ON', 'Einschalten')
          : config.value === false
            ? text('Turn OFF', 'Ausschalten')
            : text('Select ON/OFF', 'EIN/AUS auswählen')
        : config.action === 'pulse'
          ? `${text('Pulse', 'Impuls')}${channel?.pulse ? ` · ${duration(channel.pulse.durationMs)}` : ''}`
          : text('Not selected', 'Nicht ausgewählt');
    return [...rows, { label: text('Action', 'Aktion'), value: action }];
  }

  const category =
    config.category === 'measurement'
      ? text('Measurement', 'Messwert')
      : config.category === 'fault'
        ? text('Fault', 'Fehler')
        : config.category === 'state'
          ? channel?.capabilities.includes('input')
            ? text('Input state', 'Eingangszustand')
            : text('Output state', 'Ausgangszustand')
          : undefined;
  if (kind === 'event')
    return [
      ...rows,
      {
        label: text('When', 'Wenn'),
        value: category ? `${category} ${text('received', 'empfangen')}` : text('Not selected', 'Nicht ausgewählt'),
      },
    ];
  if (kind === 'read')
    return [...rows, { label: text('Read', 'Lesen'), value: category ?? text('Not selected', 'Nicht ausgewählt') }];
  const expected =
    typeof config.equals === 'boolean'
      ? config.equals
        ? text('ON', 'EIN')
        : text('OFF', 'AUS')
      : typeof config.equals === 'number' && Number.isFinite(config.equals)
        ? `${config.equals} (${text('wire value', 'Rohwert')})`
        : text('Not set', 'Nicht festgelegt');
  return [
    ...rows,
    {
      label: text('Wait for', 'Warten auf'),
      value: `${category ?? text('Not selected', 'Nicht ausgewählt')} = ${expected}`,
    },
    {
      label: text('Timeout', 'Zeitlimit'),
      value: duration(typeof config.timeoutMs === 'number' ? config.timeoutMs : 30_000),
    },
  ];
}

function duration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${milliseconds / 1000} s`;
}
