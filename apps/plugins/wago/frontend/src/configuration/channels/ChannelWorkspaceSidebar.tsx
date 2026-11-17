import { EmptyState } from '@attraccess/plugins-frontend-ui';
import { Button, Input, TextField } from '@heroui/react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { availableDigitalTerminals, DIGITAL_TERMINALS } from '../../../../backend/configuration/digital';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import type { Channel } from '../model';
import { channelAssignment } from './channelWorkspaceModel';
import { PhysicalAssignments } from './PhysicalAssignments';
interface ChannelWorkspaceSidebarProps {
  view: 'list' | 'terminals';
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  search: string;
  onSearchChange: (search: string) => void;
  channels: Channel[];
  adding: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onAddAtTerminal: (terminal: number) => void;
  onChange: (snapshot: WagoConfigurationSnapshot) => void;
}

export function ChannelWorkspaceSidebar({
  view,
  snapshot,
  metadata,
  search,
  onSearchChange,
  channels,
  adding,
  selectedId,
  onSelect,
  onAddAtTerminal,
  onChange,
}: ChannelWorkspaceSidebarProps) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
      <section className="wg:space-y-4 wg:rounded-xl wg:border wg:border-border wg:p-4">
        <header className="wg:space-y-1">
          <h3 className="wg:font-semibold">{t(view === 'list' ? 'channels.yourChannels' : 'channels.terminals')}</h3>
          <p className="wg:text-sm wg:text-muted">
            {t('channels.free', {
              inputs: availableDigitalTerminals(snapshot, 'input').length,
              outputs: availableDigitalTerminals(snapshot, 'output').length,
            })}
          </p>
        </header>
        <div className="wg:flex wg:flex-col wg:gap-2">
          {view === 'list' ? (
            <>
              <TextField aria-label={t('channels.search')}>
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={t('channels.searchPlaceholder')}
                />
              </TextField>
              {channels.map((channel) => (
                <Button
                  key={channel.id}
                  variant={!adding && selectedId === channel.id ? 'secondary' : 'ghost'}
                  aria-pressed={!adding && selectedId === channel.id}
                  className="wg:h-auto wg:min-h-16 wg:w-full wg:justify-start wg:whitespace-normal wg:py-3 wg:text-left"
                  onPress={() => onSelect(channel.id)}
                >
                  {channel.capabilities.includes('output') ? (
                    <ArrowUpFromLine className="wg:size-4 wg:shrink-0" />
                  ) : (
                    <ArrowDownToLine className="wg:size-4 wg:shrink-0" />
                  )}
                  <span className="wg:min-w-0 wg:break-words">
                    <strong className="wg:block">{metadata.names[channel.id] || t('channels.unnamed')}</strong>
                    <span className="wg:text-xs wg:font-normal wg:text-muted">
                      {channelAssignment(snapshot, channel, t)}
                    </span>
                  </span>
                </Button>
              ))}
              {!channels.length && <EmptyState message={t(search ? 'channels.noMatch' : 'channels.empty')} />}
            </>
          ) : (
            <>
              {(['output', 'input'] as const).map((direction) => (
                <div key={direction}>
                  <h3 className="wg:mb-2 wg:text-sm wg:font-medium">
                    {t(direction === 'output' ? 'channels.digitalOutputs' : 'channels.digitalInputs')}
                  </h3>
                  <div className="wg:grid wg:grid-cols-2 wg:gap-2">
                    {DIGITAL_TERMINALS.filter((item) => item.direction === direction).map((terminal) => {
                      const assigned = snapshot.physicalPoints.find(
                        (item) => item.hardwareProfile === '751-9301' && item.channel === terminal.channel,
                      );
                      const channel =
                        assigned && snapshot.logicalChannels.find((item) => item.physicalPointId === assigned.id);
                      return (
                        <Button
                          key={terminal.channel}
                          variant={channel && !adding && selectedId === channel.id ? 'secondary' : 'outline'}
                          aria-label={`${terminal.label}: ${channel ? metadata.names[channel.id] || t('channels.unnamed') : t(assigned ? 'channels.reservedAssignment' : 'channels.available')}`}
                          className="wg:h-auto wg:min-h-20 wg:w-full wg:flex-col wg:items-start wg:whitespace-normal wg:p-3 wg:text-left"
                          isDisabled={!!assigned && !channel}
                          onPress={() => (channel ? onSelect(channel.id) : onAddAtTerminal(terminal.channel))}
                        >
                          <strong>{terminal.label}</strong>
                          <span className="wg:max-w-full wg:text-xs wg:font-normal wg:text-muted">
                            {channel
                              ? metadata.names[channel.id] || t('channels.unnamed')
                              : assigned
                                ? t('channels.reserved')
                                : t('channels.assignAction')}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {snapshot.logicalChannels
                .filter(
                  (item) =>
                    snapshot.physicalPoints.find((point) => point.id === item.physicalPointId)?.hardwareProfile !==
                    '751-9301',
                )
                .map((channel) => (
                  <Button
                    key={channel.id}
                    variant="ghost"
                    className="wg:h-auto wg:w-full wg:justify-start wg:whitespace-normal wg:text-left"
                    onPress={() => onSelect(channel.id)}
                  >
                    {metadata.names[channel.id] || channel.id}
                  </Button>
                ))}
              <p className="wg:text-xs wg:text-muted">{t('channels.overview')}</p>
            </>
          )}
        </div>
      </section>
      <PhysicalAssignments snapshot={snapshot} metadata={metadata} onChange={onChange} />
    </div>
  );
}
