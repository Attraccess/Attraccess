import { Button, Card, Chip, Input, Label, TextField } from '@heroui/react';
import { ArrowDownToLine, ArrowUpFromLine, LayoutGrid, List, Plus, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { addDigitalChannel, type Channel } from './configuration-model';
import {
  availableDigitalTerminals,
  DIGITAL_TERMINALS,
  digitalTerminalLabel,
  isEditableDigitalChannel,
} from '../../backend/configuration-digital';
import { Choice, DigitalChannelEditor, NumericField, PhysicalAssignments } from './DigitalChannelEditor';
import { ModbusPointForm } from './ModbusConfigurationForm';
import { bindModbusPoint, emptyModbus } from './modbus-editor';
import { useWagoTranslations } from './i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';

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

const purposes = [
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
type Purpose = (typeof purposes)[number]['id'];

function canAddChannel(
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

/** The wizard holds its own proposal. Nothing enters the working draft until confirmation. */
function AddChannel({
  snapshot,
  metadata,
  terminal,
  onAdd,
  onCancel,
  onExternal,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  terminal?: number;
  onAdd: (snapshot: WagoConfigurationSnapshot, metadata: ConfigurationEditorMetadata, selected: string) => void;
  onCancel: () => void;
  onExternal: () => void;
}) {
  const { t } = useWagoTranslations();
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<Purpose>(terminal !== undefined && terminal >= 4 ? 'input' : 'output');
  const [name, setName] = useState('');
  const [assignment, setAssignment] = useState<number | undefined>(terminal);
  const [pulseMs, setPulseMs] = useState(500);
  const [guardId, setGuardId] = useState('');
  const [disconnect, setDisconnect] = useState('immediate');
  const [timeoutMs, setTimeoutMs] = useState(1000);
  const direction = purpose === 'input' ? 'input' : 'output';
  const terminals = availableDigitalTerminals(snapshot, direction);
  const selectedTerminal = terminals.find((item) => item.channel === assignment) ?? terminals[0];
  const inputs = snapshot.logicalChannels.filter((item) => item.capabilities.includes('input'));
  const valid = canAddChannel({ name, purpose, pulseMs, guardId, disconnect, timeoutMs }, !!selectedTerminal, inputs);

  function create() {
    if (!valid || !selectedTerminal) return;
    const next = addDigitalChannel(snapshot, direction);
    next.point.channel = selectedTerminal.channel;
    if (purpose === 'pulse') {
      next.channel.profile = 'pulsed-lock-bank';
      next.channel.capabilities.push('pulse');
      next.channel.pulse = { durationMs: pulseMs };
    }
    if (purpose === 'guard') {
      next.channel.profile = 'guarded-enable-request';
      next.channel.capabilities.push('guard');
      next.channel.guard = { channelId: guardId, when: 'on' };
    }
    if (direction === 'output')
      next.channel.disconnectPolicy =
        disconnect === 'watchdog' ? { mode: 'watchdog', timeoutMs } : { mode: disconnect as 'hold' | 'immediate' };
    const presets =
      purpose === 'pulse' || purpose === 'guard'
        ? [
            ...metadata.presets,
            {
              presetId: next.channel.profile,
              channelId: next.channel.id,
              physicalPointId: next.point.id,
              ...(purpose === 'guard' ? { guardChannelId: guardId } : {}),
            },
          ]
        : metadata.presets;
    onAdd(
      next.snapshot,
      {
        ...metadata,
        presets,
        names: { ...metadata.names, [next.channel.id]: name.trim(), [next.point.id]: selectedTerminal.label },
      },
      next.channel.id,
    );
  }
  return (
    <section
      aria-label={t('channels.add')}
      className="wg:w-full wg:min-w-0 wg:space-y-5 wg:rounded-xl wg:border wg:border-border wg:p-4 wg:[overflow-wrap:anywhere]"
    >
      <header className="wg:space-y-1">
        <h3 className="wg:font-semibold">{t('channels.addTitle')}</h3>
        <p className="wg:text-sm wg:text-muted">{t('channels.addDescription')}</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-5">
        <ol className="wg:flex wg:flex-wrap wg:gap-4 wg:text-sm" aria-label={t('channels.progress')}>
          {['channels.purpose', 'channels.wiringBehavior', 'channels.confirm'].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={step === index ? 'wg:font-semibold wg:text-accent' : 'wg:text-muted'}
            >
              {index + 1}. {t(label)}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <>
            <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
              {purposes.map((item) => (
                <Button
                  key={item.id}
                  variant={purpose === item.id ? 'secondary' : 'outline'}
                  aria-pressed={purpose === item.id}
                  className="wg:h-auto wg:w-full wg:justify-start wg:whitespace-normal wg:p-4 wg:text-left"
                  onPress={() => setPurpose(item.id)}
                >
                  <item.icon className="wg:size-5 wg:shrink-0" />
                  <span>
                    <strong className="wg:block">{t(`channels.purposes.${item.id}.label`)}</strong>
                    <span className="wg:font-normal wg:text-muted">
                      {t(`channels.purposes.${item.id}.description`)}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
            <p className="wg:text-sm wg:text-muted">{t('channels.externalHint')}</p>
            <Button variant="ghost" onPress={onExternal}>
              {t('channels.external')}
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <TextField isRequired>
              <Label>{t('channels.newName')}</Label>
              <Input
                autoFocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t(direction === 'input' ? 'channels.inputPlaceholder' : 'channels.outputPlaceholder')}
              />
            </TextField>
            {!selectedTerminal ? (
              <p role="alert">{t('channels.allAssigned', { direction: t(`channels.${direction}`) })}</p>
            ) : (
              <Choice
                label={t('channels.assign')}
                value={String(selectedTerminal.channel)}
                options={terminals.map((item) => ({ id: String(item.channel), label: `CC100 ${item.label}` }))}
                onChange={(value) => setAssignment(Number(value))}
              />
            )}
            {purpose === 'pulse' && (
              <NumericField label={t('channels.pulseDuration')} value={pulseMs} min={1} onChange={setPulseMs} />
            )}
            {purpose === 'guard' && (
              <>
                <Choice
                  label={t('channels.guardInput')}
                  value={guardId}
                  options={inputs.map((item) => ({ id: item.id, label: metadata.names[item.id] || item.id }))}
                  onChange={setGuardId}
                />
                <p className="wg:text-sm wg:text-muted">{t('channels.guardHint')}</p>
                {!inputs.length && <p role="alert">{t('channels.inputFirst')}</p>}
              </>
            )}
            {direction === 'output' && (
              <>
                <Choice
                  label={t('channels.disconnect')}
                  value={disconnect}
                  options={[
                    { id: 'immediate', label: t('channels.immediate') },
                    { id: 'watchdog', label: t('channels.watchdog') },
                    { id: 'hold', label: t('channels.hold') },
                  ]}
                  onChange={setDisconnect}
                />
                {disconnect === 'watchdog' && (
                  <NumericField
                    label={t('channels.watchdogTimeout')}
                    min={1}
                    value={timeoutMs}
                    onChange={setTimeoutMs}
                  />
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <div className="wg:flex wg:flex-col wg:gap-3">
            <h3 className="wg:text-lg wg:font-semibold">{name.trim()}</h3>
            <p>
              {t(`channels.purposes.${purpose}.label`)} · CC100 {selectedTerminal?.label}
            </p>
            {purpose === 'pulse' && <p>{t('channels.pulseSummary', { duration: pulseMs })}</p>}
            {purpose === 'guard' && <p>{t('channels.guardSummary', { name: metadata.names[guardId] || guardId })}</p>}
            <p>
              {direction === 'input'
                ? t('channels.monitorSummary')
                : t('channels.disconnectSummary', {
                    policy:
                      disconnect === 'watchdog'
                        ? t('channels.watchdogSummary', { timeout: timeoutMs })
                        : t(`channels.${disconnect}`),
                  })}
            </p>
            <p className="wg:text-sm wg:text-muted">{t('channels.localHint')}</p>
          </div>
        )}
      </div>
      <footer className="wg:flex wg:flex-wrap wg:justify-between wg:gap-3">
        <Button variant="ghost" onPress={onCancel}>
          {t('channels.cancelAdd')}
        </Button>
        <div className="wg:flex wg:gap-2">
          {step > 0 && (
            <Button variant="secondary" onPress={() => setStep(step - 1)}>
              {t('channels.back')}
            </Button>
          )}
          {step < 2 ? (
            <Button isDisabled={step === 1 && !valid} onPress={() => setStep(step + 1)}>
              {t('channels.continue')}
            </Button>
          ) : (
            <Button isDisabled={!valid} onPress={create}>
              {t('channels.addToConfiguration')}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
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
        <div className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
          <section className="wg:space-y-4 wg:rounded-xl wg:border wg:border-border wg:p-4">
            <header className="wg:space-y-1">
              <h3 className="wg:font-semibold">
                {t(view === 'list' ? 'channels.yourChannels' : 'channels.terminals')}
              </h3>
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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('channels.searchPlaceholder')}
                    />
                  </TextField>
                  {channels.map((channel) => (
                    <Button
                      key={channel.id}
                      variant={!adding && selected?.id === channel.id ? 'secondary' : 'ghost'}
                      aria-pressed={!adding && selected?.id === channel.id}
                      className="wg:h-auto wg:min-h-16 wg:w-full wg:justify-start wg:whitespace-normal wg:py-3 wg:text-left"
                      onPress={() => select(channel.id)}
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
                  {!channels.length && (
                    <p className="wg:py-5 wg:text-sm wg:text-muted">
                      {t(search ? 'channels.noMatch' : 'channels.empty')}
                    </p>
                  )}
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
                              variant={channel && !adding && selected?.id === channel.id ? 'secondary' : 'outline'}
                              aria-label={`${terminal.label}: ${channel ? metadata.names[channel.id] || t('channels.unnamed') : t(assigned ? 'channels.reservedAssignment' : 'channels.available')}`}
                              className="wg:h-auto wg:min-h-20 wg:w-full wg:flex-col wg:items-start wg:whitespace-normal wg:p-3 wg:text-left"
                              isDisabled={!!assigned && !channel}
                              onPress={() => (channel ? select(channel.id) : setAdding({ terminal: terminal.channel }))}
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
                        onPress={() => select(channel.id)}
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
                <p>{t('channels.dedicatedEditor', { profile: selected.profile.replaceAll('-', ' ') })}</p>
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
