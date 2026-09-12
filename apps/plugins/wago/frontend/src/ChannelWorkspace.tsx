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

export function channelAssignment(snapshot: WagoConfigurationSnapshot, channel: Channel) {
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  if (!point) return 'Missing assignment';
  if (point.hardwareProfile === '751-9301') return `CC100 · ${digitalTerminalLabel(point.channel)}`;
  if (point.hardwareProfile === 'modbus')
    return (
      snapshot.modbus?.devices.find((device) => device.id === point.modbus?.deviceId)?.name ?? 'Missing external device'
    );
  return `Module ${point.hardwareProfile} · channel ${point.channel}`;
}

const purposes = [
  {
    id: 'output',
    label: 'Switch an output',
    description: 'Control a relay, contactor, or enable signal.',
    icon: ArrowUpFromLine,
  },
  {
    id: 'pulse',
    label: 'Pulse a lock or relay',
    description: 'Turn an output on for a defined duration.',
    icon: Radio,
  },
  {
    id: 'input',
    label: 'Monitor an input',
    description: 'Read a contact, switch, or feedback signal.',
    icon: ArrowDownToLine,
  },
  {
    id: 'guard',
    label: 'Request an enable',
    description: 'Allow an output only when an input permits it.',
    icon: ArrowUpFromLine,
  },
] as const;
type Purpose = (typeof purposes)[number]['id'];

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
  const valid =
    !!selectedTerminal &&
    !!name.trim() &&
    name.trim().length <= 120 &&
    (purpose !== 'pulse' || (Number.isInteger(pulseMs) && pulseMs > 0)) &&
    (purpose !== 'guard' || inputs.some((item) => item.id === guardId)) &&
    (direction === 'input' || disconnect !== 'watchdog' || (Number.isInteger(timeoutMs) && timeoutMs > 0));
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
      aria-label="Add channel"
      className="wg:w-full wg:min-w-0 wg:space-y-5 wg:rounded-xl wg:border wg:border-border wg:p-4 wg:[overflow-wrap:anywhere]"
    >
      <header className="wg:space-y-1">
        <h3 className="wg:font-semibold">Add a channel</h3>
        <p className="wg:text-sm wg:text-muted">Start with its purpose, then choose the wiring and behavior.</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-5">
        <ol className="wg:flex wg:flex-wrap wg:gap-4 wg:text-sm" aria-label="Channel creation progress">
          {['Purpose', 'Wiring & behavior', 'Confirm'].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={step === index ? 'wg:font-semibold wg:text-accent' : 'wg:text-muted'}
            >
              {index + 1}. {label}
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
                    <strong className="wg:block">{item.label}</strong>
                    <span className="wg:font-normal wg:text-muted">{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
            <p className="wg:text-sm wg:text-muted">
              For a meter or remote I/O, set up an external device and add its named measurements or actions.
            </p>
            <Button variant="ghost" onPress={onExternal}>
              Set up an external device
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <TextField isRequired>
              <Label>New channel name</Label>
              <Input
                autoFocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={direction === 'input' ? 'e.g. Door contact' : 'e.g. Workshop door lock'}
              />
            </TextField>
            {!selectedTerminal ? (
              <p role="alert">
                All {direction} terminals are assigned. Release an unused assignment or choose another purpose.
              </p>
            ) : (
              <Choice
                label="Assign terminal"
                value={String(selectedTerminal.channel)}
                options={terminals.map((item) => ({ id: String(item.channel), label: `CC100 ${item.label}` }))}
                onChange={(value) => setAssignment(Number(value))}
              />
            )}
            {purpose === 'pulse' && (
              <NumericField label="Pulse duration (ms)" value={pulseMs} min={1} onChange={setPulseMs} />
            )}
            {purpose === 'guard' && (
              <>
                <Choice
                  label="Guard input"
                  value={guardId}
                  options={inputs.map((item) => ({ id: item.id, label: metadata.names[item.id] || item.id }))}
                  onChange={setGuardId}
                />
                <p className="wg:text-sm wg:text-muted">
                  The input must be on to allow the output. Operational guards do not replace certified electrical
                  safety functions.
                </p>
                {!inputs.length && <p role="alert">Add an input channel first.</p>}
              </>
            )}
            {direction === 'output' && (
              <>
                <Choice
                  label="On disconnect"
                  value={disconnect}
                  options={[
                    { id: 'immediate', label: 'Immediately off' },
                    { id: 'watchdog', label: 'Off after watchdog timeout' },
                    { id: 'hold', label: 'Hold last state' },
                  ]}
                  onChange={setDisconnect}
                />
                {disconnect === 'watchdog' && (
                  <NumericField label="Watchdog timeout (ms)" min={1} value={timeoutMs} onChange={setTimeoutMs} />
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <div className="wg:flex wg:flex-col wg:gap-3">
            <h3 className="wg:text-lg wg:font-semibold">{name.trim()}</h3>
            <p>
              {purposes.find((item) => item.id === purpose)?.label} · CC100 {selectedTerminal?.label}
            </p>
            {purpose === 'pulse' && <p>Pulse duration: {pulseMs} ms</p>}
            {purpose === 'guard' && <p>Enabled when {metadata.names[guardId] || guardId} is on.</p>}
            <p>
              {direction === 'input'
                ? 'Monitors the input state.'
                : `On disconnect: ${disconnect === 'immediate' ? 'immediately off' : disconnect === 'hold' ? 'hold last state' : `off after ${timeoutMs} ms`}.`}
            </p>
            <p className="wg:text-sm wg:text-muted">
              This adds the channel to your local edits. Save and publish after reviewing the complete configuration.
            </p>
          </div>
        )}
      </div>
      <footer className="wg:flex wg:flex-wrap wg:justify-between wg:gap-3">
        <Button variant="ghost" onPress={onCancel}>
          Cancel adding channel
        </Button>
        <div className="wg:flex wg:gap-2">
          {step > 0 && (
            <Button variant="secondary" onPress={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button isDisabled={step === 1 && !valid} onPress={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button isDisabled={!valid} onPress={create}>
              Add to configuration
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (focusChannelId) setSelectedId(focusChannelId);
  }, [focusChannelId]);
  const [view, setView] = useState<'list' | 'terminals'>('list');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<{ terminal?: number } | null>(null);
  const selected = snapshot.logicalChannels.find((item) => item.id === selectedId) ?? snapshot.logicalChannels[0];
  const channels = snapshot.logicalChannels.filter((item) =>
    `${metadata.names[item.id] ?? item.id} ${channelAssignment(snapshot, item)} ${item.capabilities.join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function select(id: string) {
    setSelectedId(id);
    setAdding(null);
  }
  const point = selected && snapshot.physicalPoints.find((item) => item.id === selected.physicalPointId);
  return (
    <section aria-label="Channels" className="wg:flex wg:min-w-0 wg:flex-col wg:gap-5 wg:[overflow-wrap:anywhere]">
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-3">
        <div>
          <h2 className="wg:text-xl wg:font-semibold">Channels</h2>
          <p className="wg:text-sm wg:text-muted">Name what each connection does, then define how it behaves.</p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button variant="secondary" aria-pressed={view === 'list'} onPress={() => setView('list')}>
            <List className="wg:size-4" /> Channel list
          </Button>
          <Button variant="secondary" aria-pressed={view === 'terminals'} onPress={() => setView('terminals')}>
            <LayoutGrid className="wg:size-4" /> Terminal map
          </Button>
          <Button onPress={() => setAdding({})}>
            <Plus className="wg:size-4" /> Add channel
          </Button>
        </div>
      </header>
      <div className="wg:grid wg:min-w-0 wg:items-start wg:gap-5 wg:lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <div className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
          <section className="wg:space-y-4 wg:rounded-xl wg:border wg:border-border wg:p-4">
            <header className="wg:space-y-1">
              <h3 className="wg:font-semibold">{view === 'list' ? 'Your channels' : 'CC100 terminals'}</h3>
              <p className="wg:text-sm wg:text-muted">
                {availableDigitalTerminals(snapshot, 'input').length} of 8 inputs free ·{' '}
                {availableDigitalTerminals(snapshot, 'output').length} of 4 outputs free
              </p>
            </header>
            <div className="wg:flex wg:flex-col wg:gap-2">
              {view === 'list' ? (
                <>
                  <TextField aria-label="Search channels">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search channels…"
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
                        <strong className="wg:block">{metadata.names[channel.id] || 'Unnamed channel'}</strong>
                        <span className="wg:text-xs wg:font-normal wg:text-muted">
                          {channelAssignment(snapshot, channel)}
                        </span>
                      </span>
                    </Button>
                  ))}
                  {!channels.length && (
                    <p className="wg:py-5 wg:text-sm wg:text-muted">
                      {search
                        ? 'No channels match your search.'
                        : 'No channels yet. Add one to give a connection its purpose.'}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {(['output', 'input'] as const).map((direction) => (
                    <div key={direction}>
                      <h3 className="wg:mb-2 wg:text-sm wg:font-medium">
                        {direction === 'output' ? 'Digital outputs' : 'Digital inputs'}
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
                              aria-label={`${terminal.label}: ${channel ? metadata.names[channel.id] || 'Unnamed channel' : assigned ? 'Reserved assignment' : 'Available'}`}
                              className="wg:h-auto wg:min-h-20 wg:w-full wg:flex-col wg:items-start wg:whitespace-normal wg:p-3 wg:text-left"
                              isDisabled={!!assigned && !channel}
                              onPress={() => (channel ? select(channel.id) : setAdding({ terminal: terminal.channel }))}
                            >
                              <strong>{terminal.label}</strong>
                              <span className="wg:max-w-full wg:text-xs wg:font-normal wg:text-muted">
                                {channel
                                  ? metadata.names[channel.id] || 'Unnamed channel'
                                  : assigned
                                    ? 'Reserved'
                                    : '+ Assign'}
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
                  <p className="wg:text-xs wg:text-muted">
                    Assignment overview. This view does not show live electrical state.
                  </p>
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
                  {metadata.names[selected.id] || 'Unnamed channel'}
                </h3>
                <Chip size="sm" variant="soft">
                  {selected.capabilities.includes('output')
                    ? 'Output'
                    : selected.capabilities.includes('measurement')
                      ? 'Measurement'
                      : 'Input'}
                </Chip>
              </div>
              <p className="wg:text-sm wg:text-muted">{channelAssignment(snapshot, selected)}</p>
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
                <p>
                  Existing {selected.profile.replaceAll('-', ' ')} configuration is preserved. This hardware module
                  requires its dedicated editor.
                </p>
              )}
            </div>
          </section>
        ) : (
          <Card>
            <Card.Content className="wg:flex wg:items-start wg:gap-4 wg:py-10">
              <Radio className="wg:size-8 wg:text-accent" />
              <h3 className="wg:text-lg wg:font-semibold">Give your first connection a purpose</h3>
              <p className="wg:max-w-md wg:text-muted">
                Start with a named input or output. You can return to wiring, behavior, and advanced settings at any
                time.
              </p>
              <Button onPress={() => setAdding({})}>Create your first channel</Button>
            </Card.Content>
          </Card>
        )}
      </div>
    </section>
  );
}
