import { randomUUID } from '../configuration-id';
import type { PanelConfiguration } from './model.contracts';
import type { Terminal } from './model.contracts';
import type { Channel } from './model.contracts';
import { terminalChannel } from './model.save-device.helpers';

export function updateTerminal(
  configuration: PanelConfiguration,
  terminal: Terminal,
  name: string,
  settings: Partial<Channel>,
): PanelConfiguration {
  const { snapshot, metadata } = configuration;
  const existing = terminalChannel(snapshot, terminal);
  if (!name.trim()) {
    if (!existing) return configuration;
    const names = { ...metadata.names };
    delete names[existing.id];
    delete names[existing.physicalPointId];
    return {
      snapshot: {
        ...snapshot,
        logicalChannels: snapshot.logicalChannels.filter((channel) => channel.id !== existing.id),
        physicalPoints: snapshot.physicalPoints.filter((point) => point.id !== existing.physicalPointId),
      },
      metadata: { ...metadata, names },
    };
  }
  const point = { id: `point-${randomUUID()}`, hardwareProfile: '751-9301' as const, channel: terminal.channel };
  const channel: Channel = {
    ...(existing ?? {
      id: `channel-${randomUUID()}`,
      physicalPointId: point.id,
      profile: terminal.direction === 'output' ? 'generic-digital-output' : 'generic-monitored-input',
      capabilities: [terminal.direction],
      disconnectPolicy: { mode: terminal.direction === 'output' ? 'immediate' : 'hold' },
    }),
    ...settings,
  };
  if (!channel.capabilities.includes('pulse')) delete channel.pulse;
  return {
    snapshot: {
      ...snapshot,
      physicalPoints: existing ? snapshot.physicalPoints : [...snapshot.physicalPoints, point],
      logicalChannels: existing
        ? snapshot.logicalChannels.map((item) => (item.id === existing.id ? channel : item))
        : [...snapshot.logicalChannels, channel],
    },
    metadata: { ...metadata, names: { ...metadata.names, [channel.id]: name.trim() } },
  };
}
