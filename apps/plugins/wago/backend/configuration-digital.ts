import type { WagoConfigurationSnapshot } from './configuration';

/** Confirmed ATT-1056 editor mapping for the existing version 1 snapshot. */
export const DIGITAL_TERMINALS = [
  ...Array.from({ length: 4 }, (_, channel) => ({ channel, label: `DO${channel + 1}`, direction: 'output' as const })),
  ...Array.from({ length: 8 }, (_, index) => ({
    channel: index + 4,
    label: `DI${index + 1}`,
    direction: 'input' as const,
  })),
];

export function availableDigitalTerminals(
  snapshot: WagoConfigurationSnapshot,
  direction: 'input' | 'output',
  pointId?: string,
) {
  return DIGITAL_TERMINALS.filter(
    (terminal) =>
      terminal.direction === direction &&
      !snapshot.physicalPoints.some(
        (point) => point.id !== pointId && point.hardwareProfile === '751-9301' && point.channel === terminal.channel,
      ),
  );
}

export function isEditableDigitalChannel(
  snapshot: WagoConfigurationSnapshot,
  channel: WagoConfigurationSnapshot['logicalChannels'][number],
) {
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  return (
    point?.hardwareProfile === '751-9301' &&
    channel.profile !== 'metered-switched-load' &&
    !channel.capabilities.includes('measurement')
  );
}

export function digitalTerminalLabel(channel: number) {
  return DIGITAL_TERMINALS.find((terminal) => terminal.channel === channel)?.label ?? 'Unsupported terminal';
}
