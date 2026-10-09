import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { Button, Card, Chip } from '@heroui/react';
import { ArrowDownToLine, ArrowUpFromLine, LayoutGrid, List, Plus, Radio } from 'lucide-react';
import { digitalTerminalLabel, isEditableDigitalChannel } from '../../../../backend/configuration/digital';
import { AddChannel } from './AddChannel';
import { ChannelWorkspaceChannelsFree } from './ChannelWorkspaceChannelsFree';
import { DigitalChannelEditor } from './DigitalChannelEditor';
import { ModbusPointForm } from '../modbus/ConfigurationForm';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import type { Channel } from '../model';
import { presetDisplayName } from '../model';
import { bindModbusPoint, emptyModbus } from '../modbus/modbus-editor';
import { useChannelWorkspaceState } from './useChannelWorkspaceState';

export const purposes = [
  {
    id: 'output',
    icon: ArrowUpFromLine,
  },
  {
    id: 'pulse',
    icon: Radio,
  },
  {
    id: 'input',
    icon: ArrowDownToLine,
  },
  {
    id: 'guard',
    icon: ArrowUpFromLine,
  },
] as const;

export type Purpose = (typeof purposes)[number]['id'];

export function canAddChannel(
  {
    name,
    purpose,
    pulseMs,
    guardId,
    disconnect,
    timeoutMs,
  }: {
    name: string;
    purpose: Purpose;
    pulseMs: number;
    guardId: string;
    disconnect: string;
    timeoutMs: number;
  },
  hasTerminal: boolean,
  inputs: Channel[],
): boolean {
  return (
    hasTerminal &&
    !!name.trim() &&
    name.trim().length <= 120 &&
    (purpose !== 'pulse' || (Number.isInteger(pulseMs) && pulseMs > 0)) &&
    (purpose !== 'guard' || inputs.some((item) => item.id === guardId)) &&
    (purpose === 'input' || disconnect !== 'watchdog' || (Number.isInteger(timeoutMs) && timeoutMs > 0))
  );
}

export function channelAssignment(snapshot: WagoConfigurationSnapshot, channel: Channel, t: TFunction) {
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  if (!point) return t('channels.missingAssignment');
  if (point.hardwareProfile === '751-9301') return `CC100 · ${digitalTerminalLabel(point.channel)}`;
  if (point.hardwareProfile === 'modbus')
    return (
      snapshot.modbus?.devices.find((device) => device.id === point.modbus?.deviceId)?.name ??
      t('channels.missingDevice')
    );
  return t('channels.module', { profile: point.hardwareProfile, channel: point.channel });
}

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
  const model = useChannelWorkspaceState({
    snapshot,
    metadata,
    onChange,
    onMetadataChange,
    onExternal,
    focusChannelId,
  });

  return (
    <section
      aria-label={model.t('channels.title')}
      className="wg:flex wg:min-w-0 wg:flex-col wg:gap-5 wg:[overflow-wrap:anywhere]"
    >
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-3">
        <div>
          <h2 className="wg:text-xl wg:font-semibold">{model.t('channels.title')}</h2>
          <p className="wg:text-sm wg:text-muted">{model.t('channels.description')}</p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button variant="secondary" aria-pressed={model.view === 'list'} onPress={() => model.setView('list')}>
            <List className="wg:size-4" /> {model.t('channels.list')}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={model.view === 'terminals'}
            onPress={() => model.setView('terminals')}
          >
            <LayoutGrid className="wg:size-4" /> {model.t('channels.map')}
          </Button>
          <Button onPress={() => model.setAdding({})}>
            <Plus className="wg:size-4" /> {model.t('channels.add')}
          </Button>
        </div>
      </header>
      <div className="wg:grid wg:min-w-0 wg:items-start wg:gap-5 wg:lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <ChannelWorkspaceChannelsFree
          {...{
            t: model.t,
            view: model.view,
            snapshot,
            search: model.search,
            setSearch: model.setSearch,
            channels: model.channels,
            adding: model.adding,
            selected: model.selected,
            select: model.select,
            metadata,
            setAdding: model.setAdding,
            onChange,
          }}
        />
        {model.adding ? (
          <AddChannel
            key={model.adding.terminal ?? 'new'}
            terminal={model.adding.terminal}
            snapshot={snapshot}
            metadata={metadata}
            onCancel={() => model.setAdding(null)}
            onExternal={onExternal}
            onAdd={(value, names, id) => {
              onChange(value);
              onMetadataChange(names);
              model.select(id);
            }}
          />
        ) : model.selected ? (
          <section className="wg:min-w-0 wg:space-y-4 wg:rounded-xl wg:border wg:border-border wg:p-4">
            <header className="wg:space-y-1">
              <div className="wg:flex wg:flex-wrap wg:items-center wg:gap-2">
                <h3 className="wg:min-w-0 wg:max-w-full wg:font-semibold">
                  {metadata.names[model.selected.id] || model.t('channels.unnamed')}
                </h3>
                <Chip size="sm" variant="soft">
                  {model.t(
                    model.selected.capabilities.includes('output')
                      ? 'channels.output'
                      : model.selected.capabilities.includes('measurement')
                        ? 'channels.measurement'
                        : 'channels.input',
                  )}
                </Chip>
              </div>
              <p className="wg:text-sm wg:text-muted">{channelAssignment(snapshot, model.selected, model.t)}</p>
            </header>
            <div>
              {isEditableDigitalChannel(snapshot, model.selected) || model.point?.hardwareProfile === 'modbus' ? (
                <DigitalChannelEditor
                  key={model.selected.id}
                  channel={model.selected}
                  snapshot={snapshot}
                  metadata={metadata}
                  onRename={(id, name) => onMetadataChange({ ...metadata, names: { ...metadata.names, [id]: name } })}
                  assignment={
                    model.point?.hardwareProfile === 'modbus' ? (
                      <ModbusPointForm
                        configuration={snapshot.modbus ?? emptyModbus}
                        value={model.point.modbus ?? { deviceId: '' }}
                        onChange={(binding) =>
                          onChange(bindModbusPoint(snapshot, model.selected.physicalPointId, binding))
                        }
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
                        item.id === model.selected.physicalPointId ? { ...item, channel: terminal } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...snapshot,
                      logicalChannels: snapshot.logicalChannels.filter((item) => item.id !== model.selected.id),
                      physicalPoints: snapshot.physicalPoints.filter(
                        (item) =>
                          item.hardwareProfile !== 'modbus' ||
                          item.id !== model.selected.physicalPointId ||
                          snapshot.logicalChannels.some(
                            (other) => other.id !== model.selected.id && other.physicalPointId === item.id,
                          ),
                      ),
                    })
                  }
                />
              ) : (
                <p>
                  {model.t('channels.dedicatedEditor', { profile: presetDisplayName(model.selected.profile, model.t) })}
                </p>
              )}
            </div>
          </section>
        ) : (
          <Card>
            <Card.Content className="wg:flex wg:items-start wg:gap-4 wg:py-10">
              <Radio className="wg:size-8 wg:text-accent" />
              <h3 className="wg:text-lg wg:font-semibold">{model.t('channels.firstTitle')}</h3>
              <p className="wg:max-w-md wg:text-muted">{model.t('channels.firstDescription')}</p>
              <Button onPress={() => model.setAdding({})}>{model.t('channels.firstAction')}</Button>
            </Card.Content>
          </Card>
        )}
      </div>
    </section>
  );
}
