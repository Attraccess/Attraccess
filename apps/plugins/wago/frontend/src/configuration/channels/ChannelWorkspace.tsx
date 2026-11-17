import { Button, Card, Chip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { LayoutGrid, List, Plus, Radio } from 'lucide-react';
import { isEditableDigitalChannel } from '../../../../backend/configuration/digital';
import { AddChannel } from './AddChannel';
import { ChannelWorkspaceSidebar } from './ChannelWorkspaceSidebar';
import { DigitalChannelEditor } from './DigitalChannelEditor';
import { ModbusPointForm } from '../modbus/ModbusPointForm';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { presetDisplayName } from '../model';
import { bindModbusPoint, emptyModbus } from '../modbus/modbus-editor';
import { channelAssignment } from './channelWorkspaceModel';

export function ChannelWorkspace({
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

  return (
    <section
      aria-label={t('channels.title')}
      className="wg:flex wg:min-w-0 wg:flex-col wg:gap-5 wg:[overflow-wrap:anywhere]"
    >
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-3">
        <div>
          <h2 className="wg:text-xl wg:font-semibold">{t('channels.title')}</h2>
          <p className="wg:text-sm wg:text-muted">{t('channels.description')}</p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button variant="secondary" aria-pressed={view === 'list'} onPress={() => setView('list')}>
            <List className="wg:size-4" /> {t('channels.list')}
          </Button>
          <Button variant="secondary" aria-pressed={view === 'terminals'} onPress={() => setView('terminals')}>
            <LayoutGrid className="wg:size-4" /> {t('channels.map')}
          </Button>
          <Button onPress={() => setAdding({})}>
            <Plus className="wg:size-4" /> {t('channels.add')}
          </Button>
        </div>
      </header>
      <div className="wg:grid wg:min-w-0 wg:items-start wg:gap-5 wg:lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <ChannelWorkspaceSidebar
          view={view}
          snapshot={snapshot}
          metadata={metadata}
          search={search}
          onSearchChange={setSearch}
          channels={channels}
          adding={!!adding}
          selectedId={selected?.id}
          onSelect={select}
          onAddAtTerminal={(terminal) => setAdding({ terminal })}
          onChange={onChange}
        />
        {adding ? (
          <AddChannel
            key={adding.terminal ?? 'new'}
            terminal={adding.terminal}
            snapshot={snapshot}
            metadata={metadata}
            onCancel={() => setAdding(null)}
            onExternal={onExternal}
            onAdd={(value, names, id) => {
              onChange(value);
              onMetadataChange(names);
              select(id);
            }}
          />
        ) : selected ? (
          <section className="wg:min-w-0 wg:space-y-4 wg:rounded-xl wg:border wg:border-border wg:p-4">
            <header className="wg:space-y-1">
              <div className="wg:flex wg:flex-wrap wg:items-center wg:gap-2">
                <h3 className="wg:min-w-0 wg:max-w-full wg:font-semibold">
                  {metadata.names[selected.id] || t('channels.unnamed')}
                </h3>
                <Chip size="sm" variant="soft">
                  {t(
                    selected.capabilities.includes('output')
                      ? 'channels.output'
                      : selected.capabilities.includes('measurement')
                        ? 'channels.measurement'
                        : 'channels.input',
                  )}
                </Chip>
              </div>
              <p className="wg:text-sm wg:text-muted">{channelAssignment(snapshot, selected, t)}</p>
            </header>
            <div>
              {isEditableDigitalChannel(snapshot, selected) || point?.hardwareProfile === 'modbus' ? (
                <DigitalChannelEditor
                  key={selected.id}
                  channel={selected}
                  snapshot={snapshot}
                  metadata={metadata}
                  onRename={(id, name) => onMetadataChange({ ...metadata, names: { ...metadata.names, [id]: name } })}
                  assignment={
                    point?.hardwareProfile === 'modbus' ? (
                      <ModbusPointForm
                        configuration={snapshot.modbus ?? emptyModbus}
                        value={point.modbus ?? { deviceId: '' }}
                        onChange={(binding) => onChange(bindModbusPoint(snapshot, selected.physicalPointId, binding))}
                      />
                    ) : undefined
                  }
                  onChange={(value) =>
                    onChange({
                      ...snapshot,
                      logicalChannels: snapshot.logicalChannels.map((item) => (item.id === value.id ? value : item)),
                    })
                  }
                  onAssign={(terminal) =>
                    onChange({
                      ...snapshot,
                      physicalPoints: snapshot.physicalPoints.map((item) =>
                        item.id === selected.physicalPointId ? { ...item, channel: terminal } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...snapshot,
                      logicalChannels: snapshot.logicalChannels.filter((item) => item.id !== selected.id),
                      physicalPoints: snapshot.physicalPoints.filter(
                        (item) =>
                          item.hardwareProfile !== 'modbus' ||
                          item.id !== selected.physicalPointId ||
                          snapshot.logicalChannels.some(
                            (other) => other.id !== selected.id && other.physicalPointId === item.id,
                          ),
                      ),
                    })
                  }
                />
              ) : (
                <p>{t('channels.dedicatedEditor', { profile: presetDisplayName(selected.profile, t) })}</p>
              )}
            </div>
          </section>
        ) : (
          <Card>
            <Card.Content className="wg:flex wg:items-start wg:gap-4 wg:py-10">
              <Radio className="wg:size-8 wg:text-accent" />
              <h3 className="wg:text-lg wg:font-semibold">{t('channels.firstTitle')}</h3>
              <p className="wg:max-w-md wg:text-muted">{t('channels.firstDescription')}</p>
              <Button onPress={() => setAdding({})}>{t('channels.firstAction')}</Button>
            </Card.Content>
          </Card>
        )}
      </div>
    </section>
  );
}
