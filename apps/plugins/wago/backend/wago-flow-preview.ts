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
): PreviewRow[] {
  const channel = snapshot?.logicalChannels.find((item) => item.id === config.channelId);
  const point = snapshot?.physicalPoints?.find((item) => item.id === channel?.physicalPointId);
  let channelName = channel
    ? typeof names[channel.id] === 'string'
      ? String(names[channel.id])
      : channel.id
    : typeof config.channelId === 'string'
      ? `${config.channelId} (unavailable)`
      : 'Not selected';
  if (point?.modbus) {
    const device = snapshot?.modbus?.devices.find((item) => item.id === point.modbus?.deviceId);
    if (device) channelName = `${channelName} · ${device.name}`;
  } else if (point?.hardwareProfile === '751-9301') {
    const terminal = DIGITAL_TERMINALS.find((item) => item.channel === point.channel)?.label;
    if (terminal && !channelName.includes(terminal)) channelName += ` · ${terminal}`;
  }
  const rows: PreviewRow[] = [
    {
      label: 'Device',
      value:
        controller?.name ||
        controller?.hardwareId ||
        (typeof config.controllerId === 'number' ? `Controller ${config.controllerId} (unavailable)` : 'Not selected'),
    },
    { label: 'Channel', value: channelName },
  ];
  if (kind === 'command') {
    const action =
      config.action === 'set'
        ? config.value === true
          ? 'Turn ON'
          : config.value === false
            ? 'Turn OFF'
            : 'Select ON/OFF'
        : config.action === 'pulse'
          ? `Pulse${channel?.pulse ? ` · ${duration(channel.pulse.durationMs)}` : ''}`
          : 'Not selected';
    return [...rows, { label: 'Action', value: action }];
  }

  const category =
    config.category === 'measurement'
      ? 'Measurement'
      : config.category === 'fault'
        ? 'Fault'
        : config.category === 'state'
          ? channel?.capabilities.includes('input')
            ? 'Input state'
            : 'Output state'
          : undefined;
  if (kind === 'event') return [...rows, { label: 'When', value: category ? `${category} received` : 'Not selected' }];
  if (kind === 'read') return [...rows, { label: 'Read', value: category ?? 'Not selected' }];
  const expected =
    typeof config.equals === 'boolean'
      ? config.equals
        ? 'ON'
        : 'OFF'
      : typeof config.equals === 'number' && Number.isFinite(config.equals)
        ? `${config.equals} (wire value)`
        : 'Not set';
  return [
    ...rows,
    { label: 'Wait for', value: `${category ?? 'Not selected'} = ${expected}` },
    { label: 'Timeout', value: duration(typeof config.timeoutMs === 'number' ? config.timeoutMs : 30_000) },
  ];
}

function duration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${milliseconds / 1000} s`;
}
