import type { PluginFlowNodePreviewRow } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from '../configuration/model';
import { DIGITAL_TERMINALS } from '../configuration/digital';

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

type Translate = (english: string, translated: string) => string;
type PreviewChannel = WagoConfigurationSnapshot['logicalChannels'][number] | undefined;

function localizedPreview(
  config: Record<string, unknown>,
  kind: PreviewKind,
  controller: { name?: string | null; hardwareId?: string } | undefined,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, unknown>,
  german: boolean,
): PreviewRow[] {
  const text: Translate = (english, translated) => (german ? translated : english);
  const channel = snapshot?.logicalChannels.find((item) => item.id === config.channelId);
  const rows: PreviewRow[] = [
    { label: text('Device', 'Gerät'), value: deviceLabel(config, controller, text) },
    { label: text('Channel', 'Kanal'), value: channelLabel(config, channel, snapshot, names, text) },
  ];
  if (kind === 'command')
    return [...rows, { label: text('Action', 'Aktion'), value: commandAction(config, channel, text) }];
  const category = categoryLabel(config, channel, text);
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
  return [
    ...rows,
    {
      label: text('Wait for', 'Warten auf'),
      value: `${category ?? text('Not selected', 'Nicht ausgewählt')} = ${expectedValue(config, text)}`,
    },
    {
      label: text('Timeout', 'Zeitlimit'),
      value: duration(typeof config.timeoutMs === 'number' ? config.timeoutMs : 30_000),
    },
  ];
}

function deviceLabel(
  config: Record<string, unknown>,
  controller: { name?: string | null; hardwareId?: string } | undefined,
  text: Translate,
): string {
  return (
    controller?.name ||
    controller?.hardwareId ||
    (typeof config.controllerId === 'number'
      ? `Controller ${config.controllerId} (${text('unavailable', 'nicht verfügbar')})`
      : text('Not selected', 'Nicht ausgewählt'))
  );
}

/** Name the selected channel and append its Modbus device or digital terminal. */
function channelLabel(
  config: Record<string, unknown>,
  channel: PreviewChannel,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, unknown>,
  text: Translate,
): string {
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
  return channelName;
}

function commandAction(config: Record<string, unknown>, channel: PreviewChannel, text: Translate): string {
  if (config.action === 'set')
    return config.value === true
      ? text('Turn ON', 'Einschalten')
      : config.value === false
        ? text('Turn OFF', 'Ausschalten')
        : text('Select ON/OFF', 'EIN/AUS auswählen');
  if (config.action === 'pulse')
    return `${text('Pulse', 'Impuls')}${channel?.pulse ? ` · ${duration(channel.pulse.durationMs)}` : ''}`;
  return text('Not selected', 'Nicht ausgewählt');
}

function categoryLabel(config: Record<string, unknown>, channel: PreviewChannel, text: Translate): string | undefined {
  if (config.category === 'measurement') return text('Measurement', 'Messwert');
  if (config.category === 'fault') return text('Fault', 'Fehler');
  if (config.category !== 'state') return undefined;
  return channel?.capabilities.includes('input')
    ? text('Input state', 'Eingangszustand')
    : text('Output state', 'Ausgangszustand');
}

function expectedValue(config: Record<string, unknown>, text: Translate): string {
  if (typeof config.equals === 'boolean') return config.equals ? text('ON', 'EIN') : text('OFF', 'AUS');
  return typeof config.equals === 'number' && Number.isFinite(config.equals)
    ? `${config.equals} (${text('wire value', 'Rohwert')})`
    : text('Not set', 'Nicht festgelegt');
}

function duration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${milliseconds / 1000} s`;
}
