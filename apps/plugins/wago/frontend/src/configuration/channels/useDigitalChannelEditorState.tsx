import type { ReactNode } from 'react';
import type { Channel } from '../model';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';

export function useDigitalChannelEditorState({
  channel,
  snapshot,
  metadata,
  onChange,
  onRename,
  onRemove,
  onAssign,
  assignment,
}: {
  channel: Channel;
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onChange: (channel: Channel) => void;
  onRename: (id: string, name: string) => void;
  onRemove: () => void;
  onAssign: (terminal: number) => void;
  assignment?: ReactNode;
}) {
  const { t } = useWagoTranslations();
  const inputs = snapshot.logicalChannels
    .filter((item) => item.id !== channel.id && item.capabilities.includes('input'))
    .map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }));
  const output = channel.capabilities.includes('output');
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  const { guard, feedback, range } = channel;

  function capability(kind: 'pulse' | 'guard' | 'feedback', enabled: boolean) {
    const next = { ...channel, capabilities: channel.capabilities.filter((item) => item !== kind) };
    delete next[kind];
    if (enabled) {
      next.capabilities.push(kind);
      if (kind === 'pulse') next.pulse = { durationMs: 500 };
      if (kind === 'guard') next.guard = { channelId: inputs[0]?.id ?? '', when: 'on' };
      if (kind === 'feedback') next.feedback = { channelId: inputs[0]?.id ?? '', expected: 'match', timeoutMs: 1000 };
    }
    onChange(next);
  }
  return {
    t,
    inputs,
    output,
    point,
    guard,
    feedback,
    range,
    channel,
    snapshot,
    metadata,
    onChange,
    onRename,
    onRemove,
    onAssign,
    assignment,
    capability,
  } as const;
}
