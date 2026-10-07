import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { useWagoTranslations } from './i18n';
import { channelAssignment } from './ChannelWorkspace.helpers';

export function useChannelWorkspaceState({
  snapshot,
  metadata,
  onChange,
  onMetadataChange,
  onExternal,
  focusChannelId,
}: {
  focusChannelId?: string;
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onChange: (snapshot: WagoConfigurationSnapshot) => void;
  onMetadataChange: (metadata: ConfigurationEditorMetadata) => void;
  onExternal: () => void;
}) {
  const { t } = useWagoTranslations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (focusChannelId) setSelectedId(focusChannelId);
  }, [focusChannelId]);
  const [view, setView] = useState<'list' | 'terminals'>('list');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<{ terminal?: number } | null>(null);
  const selected = snapshot.logicalChannels.find((item) => item.id === selectedId) ?? snapshot.logicalChannels[0];
  const channels = snapshot.logicalChannels.filter((item) =>
    `${metadata.names[item.id] ?? item.id} ${channelAssignment(snapshot, item, t)} ${item.capabilities.join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function select(id: string) {
    setSelectedId(id);
    setAdding(null);
  }
  const point = selected && snapshot.physicalPoints.find((item) => item.id === selected.physicalPointId);
  return {
    t,
    view,
    setView,
    search,
    setSearch,
    adding,
    setAdding,
    selected,
    channels,
    select,
    point,
    snapshot,
    metadata,
    onChange,
    onMetadataChange,
    onExternal,
  } as const;
}
