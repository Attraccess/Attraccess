/**
 * THROWAWAY: three configuration designs on /wago?prototype=wago-configuration&variant=A.
 * Question: does a channel workspace, guided setup, or terminal map make configuration clearer?
 * Run: pnpm serve --only=frontend (read .dev-serve-ports.json for the assigned URL).
 * Baseline read from the local DB on 2026-09-10: controller "test", commissioned, runtime 0.1.0,
 * applied revision 1 with no channels; no saved draft. No API calls or persistent writes here.
 * The surrounding navigation is a preview shell; sample channels are explicitly opt-in.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Switch,
  TextField,
} from '@heroui/react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  DoorOpen,
  GitCompareArrows,
  History,
  LayoutGrid,
  List,
  Moon,
  Network,
  Plus,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Unplug,
  Users,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import { AttraccessLogo } from '../../../../../../libs/ui/src/AttraccessLogo';
import { DIGITAL_TERMINALS, digitalTerminalLabel } from '../../../backend/configuration-digital';
import type { WagoConfigurationSnapshot } from '../api';
import './prototype.css';

type Channel = {
  id: string;
  name: string;
  terminal: number;
  direction: 'input' | 'output';
  purpose: 'switch' | 'lock' | 'contact' | 'enable';
  disconnect: 'immediate' | 'watchdog' | 'hold';
  pulse: boolean;
  duration: number;
  watchdog: number;
  guard: string;
  feedback: string;
};
type Device = { id: string; name: string; host: string; port: string; unit: string };
type Section = 'channels' | 'devices' | 'review' | 'history';
const variants = [
  { key: 'A', name: 'Channel workspace', description: 'Browse channels. Focus on one at a time.' },
  { key: 'B', name: 'Guided setup', description: 'Start with a task. Work through a short sequence.' },
  { key: 'C', name: 'Terminal map', description: 'Start at the wiring. Select a terminal to configure it.' },
];
const purposes = [
  { id: 'switch', name: 'Switch a device', description: 'An output that stays on until switched off.', icon: Zap },
  { id: 'lock', name: 'Pulse a lock', description: 'A short output pulse, then automatically off.', icon: DoorOpen },
  {
    id: 'contact',
    name: 'Monitor a contact',
    description: 'Read a door contact, button, or status signal.',
    icon: ArrowDownLeft,
  },
  {
    id: 'enable',
    name: 'Request an enable',
    description: 'Allow an output only while an input is on.',
    icon: ShieldCheck,
  },
] as const;
const examples: Channel[] = [
  {
    id: 'door-contact',
    name: 'Workshop door contact',
    terminal: 4,
    direction: 'input',
    purpose: 'contact',
    disconnect: 'hold',
    pulse: false,
    duration: 500,
    watchdog: 1000,
    guard: '',
    feedback: '',
  },
  {
    id: 'door-release',
    name: 'Workshop door release',
    terminal: 0,
    direction: 'output',
    purpose: 'lock',
    disconnect: 'immediate',
    pulse: true,
    duration: 500,
    watchdog: 1000,
    guard: '',
    feedback: 'door-contact',
  },
  {
    id: 'machine-ready',
    name: 'Machine ready',
    terminal: 5,
    direction: 'input',
    purpose: 'contact',
    disconnect: 'hold',
    pulse: false,
    duration: 500,
    watchdog: 1000,
    guard: '',
    feedback: '',
  },
  {
    id: 'machine-enable',
    name: 'Machine enable request',
    terminal: 1,
    direction: 'output',
    purpose: 'enable',
    disconnect: 'immediate',
    pulse: false,
    duration: 500,
    watchdog: 1000,
    guard: 'machine-ready',
    feedback: '',
  },
];
const disconnectLabels = {
  immediate: 'Turn off immediately',
  watchdog: 'Turn off after a delay',
  hold: 'Keep the last state',
};

function Field({
  label,
  value,
  onChange,
  description,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  numeric?: boolean;
}) {
  return (
    <TextField value={value} onChange={onChange}>
      <Label>{label}</Label>
      <Input type={numeric ? 'number' : 'text'} min={numeric ? 1 : undefined} maxLength={numeric ? undefined : 120} />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onChange={(key) => key !== null && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch isSelected={checked} onChange={onChange}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label>{label}</Label>
      </Switch.Content>
      <Description>{description}</Description>
    </Switch>
  );
}
function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <Card.Header className="wcp-row">
        <div>
          <Card.Title>{title}</Card.Title>
          {description && <Card.Description>{description}</Card.Description>}
        </div>
        {action}
      </Card.Header>
      <Card.Content className="wcp-stack">{children}</Card.Content>
    </Card>
  );
}
function ChannelIcon({ channel }: { channel: Channel }) {
  return channel.direction === 'input' ? <ArrowDownLeft /> : channel.pulse ? <DoorOpen /> : <ArrowUpRight />;
}

export function ConfigurationPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = variants.find((item) => item.key === searchParams.get('variant')) ?? variants[0];
  const [channels, setChannels] = useState<Channel[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState('');
  const [section, setSection] = useState<Section>('channels');
  const [adding, setAdding] = useState(false);
  const [terminal, setTerminal] = useState<number | undefined>();
  const [filter, setFilter] = useState('');
  const [step, setStep] = useState(0);
  const [sample, setSample] = useState(false);
  const [saved, setSaved] = useState('');
  const [notice, setNotice] = useState('');
  const [published, setPublished] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [dark, setDark] = useState(
    document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark',
  );
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!selected && !adding) return;
    if (window.innerWidth >= (variant.key === 'C' ? 1000 : 700)) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById('wcp-active-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [selected, adding]);
  const channel = channels.find((item) => item.id === selected);
  const digest = JSON.stringify({ channels, devices });
  const hasDraft = channels.length > 0 || devices.length > 0;
  const dirty = digest !== (saved || JSON.stringify({ channels: [], devices: [] }));
  const inputCount = channels.filter((item) => item.direction === 'input').length;
  const outputCount = channels.length - inputCount;
  const issues = channels
    .flatMap((item) => [
      ...(!item.name.trim() ? [`${digitalTerminalLabel(item.terminal)} needs a channel name.`] : []),
      ...(item.pulse && !(item.duration > 0) ? [`${item.name}: enter a pulse duration above zero.`] : []),
      ...(item.disconnect === 'watchdog' && !(item.watchdog > 0)
        ? [`${item.name}: enter a disconnect delay above zero.`]
        : []),
      ...(item.purpose === 'enable' && !item.guard ? [`${item.name}: choose an input for the enable condition.`] : []),
      ...(item.guard && !channels.some((other) => other.id === item.guard)
        ? [`${item.name}: the condition input was removed.`]
        : []),
      ...(item.feedback && !channels.some((other) => other.id === item.feedback)
        ? [`${item.name}: the feedback input was removed.`]
        : []),
    ])
    .concat(
      devices.flatMap((device) =>
        !device.name.trim() ||
        !device.host.trim() ||
        !(Number(device.port) > 0 && Number(device.port) <= 65535) ||
        !(Number(device.unit) >= 1 && Number(device.unit) <= 247)
          ? ['Complete the external device name, host, port (1–65535), and unit ID (1–247).']
          : [],
      ),
    );
  function switchVariant(delta: number) {
    const next = variants[(variants.indexOf(variant) + delta + variants.length) % variants.length];
    setSearchParams(
      (current) => {
        current.set('variant', next.key);
        return current;
      },
      { replace: true },
    );
    setNotice('');
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="switch"], [role="tablist"]',
        )
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        switchVariant(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [variant.key, searchParams]);
  useEffect(() => {
    document.title = `WAGO configuration · ${variant.name} · Prototype`;
  }, [variant.name]);
  function update(change: Partial<Channel>) {
    setChannels((current) => current.map((item) => (item.id === selected ? { ...item, ...change } : item)));
    setPublished(false);
    setNotice('');
  }
  function beginAdd(at?: number) {
    setTerminal(at);
    setAdding(true);
    setSection('channels');
    setStep(0);
  }
  function add(purpose: Channel['purpose']) {
    const direction = purpose === 'contact' ? 'input' : 'output';
    const free = DIGITAL_TERMINALS.filter(
      (item) => item.direction === direction && !channels.some((used) => used.terminal === item.channel),
    );
    const target = free.find((item) => item.channel === terminal) ?? free[0];
    if (!target) return;
    const id = crypto.randomUUID();
    const item: Channel = {
      id,
      name:
        purpose === 'contact'
          ? 'New contact'
          : purpose === 'lock'
            ? 'New lock release'
            : purpose === 'enable'
              ? 'New enable request'
              : 'New switched device',
      direction,
      terminal: target.channel,
      purpose,
      disconnect: direction === 'input' ? 'hold' : 'immediate',
      pulse: purpose === 'lock',
      duration: 500,
      watchdog: 1000,
      guard: '',
      feedback: '',
    };
    setChannels((current) => [...current, item]);
    setSelected(id);
    setAdding(false);
    setStep(1);
    setPublished(false);
    setNotice('');
  }
  function loadExamples() {
    setChannels(structuredClone(examples));
    setDevices([]);
    setSample(true);
    setSelected('door-release');
    setAdding(false);
    setStep(1);
    setSection('channels');
    setSaved('');
    setPublished(false);
    setNotice('Example channels loaded into this browser only.');
  }
  function reset() {
    setChannels([]);
    setDevices([]);
    setSelected('');
    setAdding(false);
    setSection('channels');
    setSample(false);
    setSaved('');
    setStep(0);
    setPublished(false);
    setNotice('Restored the database snapshot: applied revision 1, no channels.');
  }
  function review() {
    setSection('review');
    setStep(2);
    setAdding(false);
    setNotice('');
  }
  function save() {
    setSaved(digest);
    setNotice('Draft saved for this preview session. The database and controller are unchanged.');
  }
  function selectChannel(id: string) {
    setSelected(id);
    setAdding(false);
    setStep(1);
  }
  const snapshot: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: channels.map((item) => ({
      id: `point-${item.id}`,
      hardwareProfile: '751-9301',
      channel: item.terminal,
    })),
    logicalChannels: channels.map((item) => ({
      id: item.id,
      physicalPointId: `point-${item.id}`,
      profile:
        item.purpose === 'lock'
          ? 'pulsed-lock-bank'
          : item.purpose === 'enable'
            ? 'guarded-enable-request'
            : item.direction === 'input'
              ? 'generic-monitored-input'
              : 'generic-digital-output',
      capabilities: [
        item.direction,
        ...(item.pulse ? ['pulse' as const] : []),
        ...(item.guard ? ['guard' as const] : []),
        ...(item.feedback ? ['feedback' as const] : []),
      ],
      disconnectPolicy:
        item.disconnect === 'watchdog' ? { mode: 'watchdog', timeoutMs: item.watchdog } : { mode: item.disconnect },
      ...(item.pulse ? { pulse: { durationMs: item.duration } } : {}),
      ...(item.guard ? { guard: { channelId: item.guard, when: 'on' as const } } : {}),
      ...(item.feedback ? { feedback: { channelId: item.feedback, expected: 'match' as const, timeoutMs: 1000 } } : {}),
    })),
  };
  const purposePicker = (
    <div className="wcp-stack">
      <div className="wcp-row">
        <div>
          <p className="wcp-eyebrow">
            ADD A CHANNEL{terminal !== undefined ? ` · ${digitalTerminalLabel(terminal)}` : ''}
          </p>
          <h2>What do you want to connect?</h2>
          <p className="wcp-muted">Choose a starting point. You can adjust its behavior next.</p>
        </div>
        {(channels.length > 0 || adding) && (
          <Button
            variant="ghost"
            onPress={() => {
              setAdding(false);
              setStep(1);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      <div className="wcp-purpose-grid">
        {purposes
          .filter(
            (purpose) =>
              terminal === undefined || (terminal >= 4 ? purpose.id === 'contact' : purpose.id !== 'contact'),
          )
          .map((purpose) => {
            const direction = purpose.id === 'contact' ? 'input' : 'output';
            const available = DIGITAL_TERMINALS.some(
              (item) => item.direction === direction && !channels.some((used) => used.terminal === item.channel),
            );
            const terminalMismatch = terminal !== undefined && (terminal >= 4 ? 'input' : 'output') !== direction;
            return (
              <Button
                key={purpose.id}
                variant="secondary"
                className="wcp-purpose"
                isDisabled={!available || terminalMismatch}
                onPress={() => add(purpose.id)}
              >
                <purpose.icon />
                <span>
                  <strong>{purpose.name}</strong>
                  <small>{purpose.description}</small>
                </span>
                <ChevronRight />
              </Button>
            );
          })}
      </div>
      <p className="wcp-muted wcp-small">
        These create named channels that can be used in Attraccess flows. External meters and devices are configured
        separately.
      </p>
    </div>
  );
  const empty = (
    <Panel
      title="Your controller is ready. What will it do?"
      description="Commissioning is complete. Add the first input or output to start its configuration."
    >
      <div className="wcp-empty-icon">
        <Cpu size={36} />
      </div>
      <div className="wcp-capacity">
        <span>
          <strong>8</strong> digital inputs available
        </span>
        <span>
          <strong>4</strong> digital outputs available
        </span>
      </div>
      <div className="wcp-actions">
        <Button onPress={() => beginAdd()}>
          <Plus />
          Add your first channel
        </Button>
        <Button variant="secondary" onPress={() => setSection('devices')}>
          <Network />
          Connect an external device
        </Button>
      </div>
      <Separator />
      <p className="wcp-muted wcp-small">
        Applied revision 1 has no channels. Nothing changes on the controller until a configuration is reviewed and
        published.
      </p>
    </Panel>
  );
  const editor = channel ? (
    <div className="wcp-stack" key={channel.id}>
      <Panel
        title={channel.name || 'Unnamed channel'}
        description={`${digitalTerminalLabel(channel.terminal)} · ${channel.direction === 'input' ? 'Digital input' : 'Digital output'}`}
        action={
          <Chip size="sm" variant="soft">
            Draft
          </Chip>
        }
      >
        <div className="wcp-two">
          <Field
            label="Channel name"
            value={channel.name}
            onChange={(name) => update({ name })}
            description="Use a name you will recognize in flows."
          />
          <Choice
            label="Connected to"
            value={String(channel.terminal)}
            options={DIGITAL_TERMINALS.filter(
              (item) =>
                item.direction === channel.direction &&
                !channels.some((other) => other.id !== channel.id && other.terminal === item.channel),
            ).map((item) => ({ id: String(item.channel), label: `CC100 · ${item.label}` }))}
            onChange={(value) => update({ terminal: Number(value) })}
          />
        </div>
        <div className="wcp-signal">
          <span>
            {channel.direction === 'input'
              ? `CC100 · ${digitalTerminalLabel(channel.terminal)}`
              : 'Activated by a flow'}
          </span>
          <ArrowRight />
          <strong>{channel.name || 'Unnamed channel'}</strong>
          <ArrowRight />
          <span>
            {channel.direction === 'input' ? 'Available to flows' : `CC100 · ${digitalTerminalLabel(channel.terminal)}`}
          </span>
        </div>
      </Panel>
      {channel.direction === 'output' ? (
        <>
          <Panel title="Output behavior" description="Choose what happens when a flow activates this channel.">
            <Toggle
              label="Turn off automatically after a pulse"
              description="Useful for lock releases and momentary commands."
              checked={channel.pulse}
              onChange={(pulse) =>
                update({ pulse, purpose: channel.purpose === 'lock' && !pulse ? 'switch' : channel.purpose })
              }
            />
            {channel.pulse && (
              <Field
                label="Pulse duration (ms)"
                value={String(channel.duration)}
                onChange={(value) => update({ duration: Number(value) })}
                numeric
                description="500 ms is half a second."
              />
            )}
            <Separator />
            <Choice
              label="If the controller loses its connection"
              value={channel.disconnect}
              options={Object.entries(disconnectLabels).map(([id, label]) => ({ id, label }))}
              onChange={(value) => update({ disconnect: value as Channel['disconnect'] })}
            />
            {channel.disconnect === 'watchdog' && (
              <Field
                label="Disconnect delay (ms)"
                value={String(channel.watchdog)}
                onChange={(value) => update({ watchdog: Number(value) })}
                numeric
              />
            )}
            <p className="wcp-explanation">
              <Unplug />
              {channel.disconnect === 'immediate'
                ? 'This output turns off as soon as the runtime detects a lost connection.'
                : channel.disconnect === 'hold'
                  ? 'This output may remain on after the connection is lost.'
                  : `This output turns off after ${channel.watchdog} ms without a connection.`}
            </p>
          </Panel>
          <details className="wcp-details" open={channel.purpose === 'enable' || Boolean(channel.guard)}>
            <summary>
              <ShieldCheck />
              Conditions & feedback <span>Optional</span>
            </summary>
            <div className="wcp-stack">
              <Choice
                label="Only allow the output while this input is on"
                value={channel.guard || 'none'}
                options={[
                  { id: 'none', label: 'No input condition' },
                  ...channels
                    .filter((item) => item.direction === 'input')
                    .map((item) => ({ id: item.id, label: item.name })),
                ]}
                onChange={(value) => update({ guard: value === 'none' ? '' : value })}
              />
              {inputCount === 0 && (
                <p className="wcp-muted">Add a digital input first to use conditions or feedback.</p>
              )}
              <Choice
                label="Check that this input follows the output"
                value={channel.feedback || 'none'}
                options={[
                  { id: 'none', label: 'Do not monitor feedback' },
                  ...channels
                    .filter((item) => item.direction === 'input')
                    .map((item) => ({ id: item.id, label: item.name })),
                ]}
                onChange={(value) => update({ feedback: value === 'none' ? '' : value })}
              />
              <p className="wcp-muted wcp-small">
                Operational conditions are not certified electrical safety functions. Feedback in this preview expects a
                matching signal within 1 second.
              </p>
            </div>
          </details>
        </>
      ) : (
        <Panel title="Input behavior" description="This channel reports whether its physical input is on or off.">
          <div className="wcp-signal">
            <ArrowDownLeft />
            <strong>Observe the contact state</strong>
          </div>
          <p className="wcp-muted">
            Use this channel as a trigger in a flow, as an output condition, or as feedback. On disconnect, the last
            value is retained and its freshness must be checked.
          </p>
        </Panel>
      )}
      <div className="wcp-row">
        <Button
          variant="ghost"
          onPress={() => {
            setChannels((items) => items.filter((item) => item.id !== selected));
            setSelected('');
            setPublished(false);
          }}
        >
          <Trash2 />
          Remove from draft
        </Button>
        <span className="wcp-muted wcp-small">Controller configuration stays unchanged</span>
      </div>
    </div>
  ) : (
    empty
  );
  const channelList = (
    <div className="wcp-channel-list">
      <div className="wcp-row">
        <h3>
          Channels <span className="wcp-muted">{channels.length}</span>
        </h3>
        <Button isIconOnly size="sm" variant="secondary" aria-label="Add channel" onPress={() => beginAdd()}>
          <Plus />
        </Button>
      </div>
      {channels.length > 0 && (
        <TextField aria-label="Find a channel" value={filter} onChange={setFilter}>
          <Input placeholder="Find a channel…" />
        </TextField>
      )}
      {(['output', 'input'] as const).map((direction) => (
        <div key={direction}>
          <p className="wcp-eyebrow">
            {direction === 'output' ? 'OUTPUTS' : 'INPUTS'} · {direction === 'input' ? inputCount : outputCount}
          </p>
          {channels
            .filter(
              (item) =>
                item.direction === direction &&
                `${item.name} ${digitalTerminalLabel(item.terminal)}`.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((item) => (
              <Button
                key={item.id}
                variant={selected === item.id && !adding ? 'secondary' : 'ghost'}
                className="wcp-channel"
                aria-pressed={selected === item.id && !adding}
                onPress={() => selectChannel(item.id)}
              >
                <ChannelIcon channel={item} />
                <span>
                  <strong>{item.name || 'Unnamed channel'}</strong>
                  <small>
                    {digitalTerminalLabel(item.terminal)} ·{' '}
                    {item.pulse
                      ? `${item.duration} ms pulse`
                      : item.direction === 'input'
                        ? 'Monitored contact'
                        : 'Switched output'}
                  </small>
                </span>
              </Button>
            ))}
        </div>
      ))}
      <Separator />
      <p className="wcp-muted wcp-small">
        {8 - inputCount} inputs and {4 - outputCount} outputs still available.
      </p>
    </div>
  );
  const reviewContent = (
    <div className="wcp-review wcp-stack">
      <div>
        <p className="wcp-eyebrow">BEFORE PUBLISHING</p>
        <h2>Review what will change</h2>
        <p className="wcp-muted">Compare your draft with the configuration applied to “test”.</p>
      </div>
      <div className="wcp-comparison">
        <div>
          <span className="wcp-eyebrow">ON THE CONTROLLER</span>
          <h3>Revision 1</h3>
          <p>No channels configured</p>
          <Chip color="success" size="sm">
            Applied · database snapshot
          </Chip>
        </div>
        <ArrowRight />
        <div>
          <span className="wcp-eyebrow">YOUR DRAFT</span>
          <h3>{channels.length} channels</h3>
          <p>
            {outputCount} outputs · {inputCount} inputs · {devices.length} external devices
          </p>
          <Chip size="sm" color={issues.length ? 'warning' : 'accent'}>
            {issues.length ? `${issues.length} items to resolve` : 'Ready for preview'}
          </Chip>
        </div>
      </div>
      {issues.length > 0 && (
        <Panel title="Resolve these before publishing">
          {issues.map((issue) => (
            <p key={issue} className="wcp-error">
              {issue}
            </p>
          ))}
          <Button
            variant="secondary"
            onPress={() => {
              setSection('channels');
              setStep(1);
            }}
          >
            Return to configuration
          </Button>
        </Panel>
      )}
      <Panel
        title={hasDraft ? 'Changes in this draft' : 'No changes yet'}
        description="Names and behavior are reviewed together."
      >
        {channels.map((item) => (
          <div className="wcp-change" key={item.id}>
            <Chip color="success" size="sm">
              Add
            </Chip>
            <div>
              <strong>{item.name || 'Unnamed channel'}</strong>
              <p className="wcp-muted wcp-small">
                {digitalTerminalLabel(item.terminal)} ·{' '}
                {item.direction === 'input'
                  ? 'Monitored input'
                  : `${item.pulse ? `${item.duration} ms pulse · ` : ''}${disconnectLabels[item.disconnect]}`}
                {item.guard
                  ? ` · Condition: ${channels.find((other) => other.id === item.guard)?.name ?? 'Missing input'}`
                  : ''}
                {item.feedback
                  ? ` · Feedback: ${channels.find((other) => other.id === item.feedback)?.name ?? 'Missing input'}`
                  : ''}
              </p>
            </div>
          </div>
        ))}
        {devices.map((device) => (
          <div className="wcp-change" key={device.id}>
            <Chip color="success" size="sm">
              Add
            </Chip>
            <div>
              <strong>{device.name || 'External device'}</strong>
              <p className="wcp-muted wcp-small">
                Modbus TCP · {device.host}:{device.port} · unit {device.unit}
              </p>
            </div>
          </div>
        ))}
        {!hasDraft && <p className="wcp-muted">Add a channel or external device to see a readable comparison here.</p>}
      </Panel>
      <Panel
        title="Publish with a clear outcome"
        description="The final flow will distinguish sending, controller acceptance, and application."
      >
        <ol className="wcp-publish-steps">
          <li>
            <strong>Save & validate</strong>
            <span>Check the complete draft</span>
          </li>
          <li>
            <strong>Send to controller</strong>
            <span>Create a new revision</span>
          </li>
          <li>
            <strong>Wait for confirmation</strong>
            <span>Show applied or rejected</span>
          </li>
        </ol>
        <p className="wcp-muted wcp-small">
          This prototype checks the displayed fields only. Live validation, resource impact checks, delivery, and
          rollback will be connected after design review.
        </p>
        <Button
          isDisabled={!hasDraft || issues.length > 0}
          onPress={() => {
            setPublished(true);
            setSaved(digest);
            setNotice(
              'Preview complete. In the real flow, the controller must confirm the applied revision. Nothing was sent.',
            );
          }}
        >
          <GitCompareArrows />
          Preview publication
        </Button>
        {published && (
          <p role="status" className="wcp-success">
            <Check />
            Publication preview complete. Controller remains on revision 1.
          </p>
        )}
      </Panel>
    </div>
  );
  const devicesContent = (
    <div className="wcp-review wcp-stack">
      <div className="wcp-row">
        <div>
          <p className="wcp-eyebrow">EXTERNAL DEVICES</p>
          <h2>Connect beyond the built-in terminals</h2>
          <p className="wcp-muted">Keep connection details here. Named signals appear in Channels.</p>
        </div>
        <Button
          onPress={() => {
            setDevices((items) => [...items, { id: crypto.randomUUID(), name: '', host: '', port: '502', unit: '1' }]);
            setPublished(false);
          }}
        >
          <Plus />
          Add Modbus device
        </Button>
      </div>
      {devices.length === 0 && (
        <Panel
          title="No external devices connected"
          description="Add a Modbus TCP device, then choose its profile and the signals you need."
        >
          <Network size={32} />
          <p className="wcp-muted">Built-in CC100 inputs and outputs do not need an external connection.</p>
          <p className="wcp-muted wcp-small">
            This concept previews TCP connection setup. Serial connections, register profiles, and signal mapping need a
            dedicated follow-up design.
          </p>
        </Panel>
      )}
      {devices.map((device) => (
        <Panel
          key={device.id}
          title={device.name || 'New Modbus TCP device'}
          description="Connection draft · not tested"
          action={
            <Button
              isIconOnly
              aria-label="Remove device"
              variant="ghost"
              onPress={() => setDevices((items) => items.filter((item) => item.id !== device.id))}
            >
              <Trash2 />
            </Button>
          }
        >
          <div className="wcp-two">
            {(
              [
                ['name', 'Device name'],
                ['host', 'Hostname or IP address'],
                ['port', 'TCP port'],
                ['unit', 'Unit ID'],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={device[key]}
                onChange={(value) => {
                  setDevices((items) =>
                    items.map((item) => (item.id === device.id ? { ...item, [key]: value } : item)),
                  );
                  setPublished(false);
                }}
                numeric={key === 'port' || key === 'unit'}
              />
            ))}
          </div>
          <p className="wcp-muted wcp-small">
            Next in the real flow: test the connection, choose a device profile, and expose named signals. No connection
            is attempted in this prototype.
          </p>
        </Panel>
      ))}
    </div>
  );
  const historyContent = (
    <div className="wcp-review">
      <Panel
        title="Configuration history"
        description="An applied configuration is separate from commissioning and from your draft."
      >
        <div className="wcp-change">
          <History />
          <div>
            <strong>Revision 1</strong>
            <p className="wcp-muted">Applied configuration · 0 channels · from the current database</p>
          </div>
          <Chip color="success">Applied</Chip>
        </div>
        <Separator />
        <p className="wcp-muted">
          Published revisions will appear here with delivery status, a readable comparison, and an option to review a
          rollback. The prototype does not send revisions.
        </p>
      </Panel>
    </div>
  );
  // Variant A: a persistent channel index beside one focused editor.
  const VariantA = (
    <div className={channels.length || adding ? 'wcp-workspace' : 'wcp-review'}>
      {(channels.length > 0 || adding) && channelList}
      <div id="wcp-active-editor">{adding ? purposePicker : editor}</div>
    </div>
  );
  // Variant B: purpose -> wiring and behavior -> review, with a compact draft outline.
  const VariantB = (
    <div className="wcp-guided">
      <aside className="wcp-guide">
        <p className="wcp-eyebrow">CONFIGURATION GUIDE</p>
        <h2>Build it one task at a time.</h2>
        <p className="wcp-muted">Start with what the connection should do. Then choose its terminal and behavior.</p>
        <ol>
          {['Choose a purpose', 'Wire & configure', 'Review changes'].map((label, index) => (
            <li key={label}>
              <Button
                variant={step === index ? 'secondary' : 'ghost'}
                isDisabled={index === 1 && !channel}
                onPress={() => {
                  if (index === 2) review();
                  else {
                    setStep(index);
                    setAdding(index === 0);
                  }
                }}
              >
                <span className="wcp-step-number">{index + 1}</span>
                {label}
              </Button>
            </li>
          ))}
        </ol>
        {channels.length > 0 && (
          <>
            <Separator />
            <p className="wcp-eyebrow">IN YOUR DRAFT · {channels.length}</p>
            {channels.map((item) => (
              <Button key={item.id} variant="ghost" className="wcp-channel" onPress={() => selectChannel(item.id)}>
                <ChannelIcon channel={item} />
                <span>
                  {item.name}
                  <small>{digitalTerminalLabel(item.terminal)}</small>
                </span>
              </Button>
            ))}
          </>
        )}
      </aside>
      <div className="wcp-stack" id="wcp-active-editor">
        {step === 0 || adding ? purposePicker : editor}
        {step === 1 && channel && (
          <div className="wcp-actions">
            <Button variant="secondary" onPress={() => beginAdd()}>
              <Plus />
              Add another channel
            </Button>
            <Button onPress={review}>
              Continue to review
              <ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
  // Variant C: terminal allocation is the primary navigation, with an adjacent inspector.
  const VariantC = (
    <div className="wcp-terminal-layout">
      <div className="wcp-stack">
        <Panel
          title="CC100 terminal map"
          description="Select a free terminal to add a channel, or an assigned terminal to edit it."
        >
          <div className="wcp-controller-label">
            <Cpu />
            <div>
              <strong>WAGO CC100</strong>
              <span>751-9301 · built-in digital I/O</span>
            </div>
            <Chip variant="soft" size="sm">
              Wiring overview
            </Chip>
          </div>
          {(['output', 'input'] as const).map((direction) => (
            <section key={direction}>
              <div className="wcp-row">
                <h3>{direction === 'input' ? 'Digital inputs' : 'Digital outputs'}</h3>
                <span className="wcp-muted wcp-small">
                  {direction === 'input' ? `${inputCount} / 8` : `${outputCount} / 4`} assigned
                </span>
              </div>
              <div className="wcp-terminal-grid">
                {DIGITAL_TERMINALS.filter((item) => item.direction === direction).map((item) => {
                  const assignment = channels.find((used) => used.terminal === item.channel);
                  return (
                    <Button
                      key={item.channel}
                      variant={assignment ? 'secondary' : 'outline'}
                      className="wcp-terminal"
                      aria-pressed={assignment?.id === selected}
                      aria-label={`${item.label}: ${assignment?.name ?? 'Available'}`}
                      onPress={() => (assignment ? selectChannel(assignment.id) : beginAdd(item.channel))}
                    >
                      <span className="wcp-row">
                        <strong>{item.label}</strong>
                        {assignment ? <Check /> : <Plus />}
                      </span>
                      <span>{assignment?.name ?? 'Available'}</span>
                    </Button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="wcp-muted wcp-small">
            Logical terminal overview, not a physical wiring diagram. No live I/O states are shown.
          </p>
        </Panel>
        <Button variant="secondary" onPress={() => setSection('devices')}>
          <Network />
          Manage external devices
          <ArrowRight />
        </Button>
      </div>
      <div id="wcp-active-editor">
        {adding ? (
          purposePicker
        ) : channel ? (
          editor
        ) : (
          <Panel title="Start with a terminal" description="Which terminal have you connected?">
            <p className="wcp-muted">
              Choose DO1–DO4 for an output or DI1–DI8 for an input. Its purpose and behavior will appear here.
            </p>
            <div className="wcp-empty-icon">
              <Settings2 size={36} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
  return (
    <div className="wcp-shell">
      <aside className={`wcp-appnav ${navOpen ? 'wcp-appnav-open' : ''}`}>
        <AttraccessLogo />
        <div className="wcp-appnav-links">
          <span>
            <LayoutGrid />
            Resources
          </span>
          <span>
            <Users />
            Users
          </span>
          <span>
            <Workflow />
            Flows
          </span>
          <p className="wcp-eyebrow">DEVICES</p>
          <strong>
            <Cpu />
            WAGO
          </strong>
          <span>
            <Wrench />
            Attractap
          </span>
        </div>
        <p className="wcp-muted wcp-small">Configuration design preview</p>
        <Button
          variant="ghost"
          onPress={() => {
            setDark(!dark);
            document.documentElement.classList.toggle('dark', !dark);
            document.documentElement.dataset.theme = !dark ? 'dark' : 'light';
          }}
        >
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light appearance' : 'Dark appearance'}
        </Button>
      </aside>
      <div className="wcp-main">
        <div className="wcp-context">
          <Button
            className="wcp-mobile-nav"
            isIconOnly
            variant="ghost"
            aria-label="Toggle navigation"
            onPress={() => setNavOpen(!navOpen)}
          >
            <List />
          </Button>
          <span>Devices</span>
          <ChevronRight />
          <span>WAGO</span>
          <ChevronRight />
          <strong>test</strong>
          <span className="wcp-context-end">Configuration</span>
        </div>
        <main className="wcp-page">
          <header className="wcp-page-header">
            <div>
              <p className="wcp-eyebrow">WAGO CC100 / TEST</p>
              <h1>Controller configuration</h1>
              <p className="wcp-muted">
                Give each connection a purpose. Review changes before they reach your controller.
              </p>
            </div>
            <div className="wcp-header-actions">
              <Chip variant="soft" color="success">
                <Check size={14} />
                Commissioned
              </Chip>
              <span className="wcp-muted wcp-small">Runtime 0.1.0 · applied revision 1</span>
            </div>
          </header>
          <div className="wcp-status">
            <div>
              <span className="wcp-dot" />
              <strong>
                {published
                  ? 'Publication preview complete'
                  : dirty
                    ? 'Draft has unsaved changes'
                    : saved
                      ? 'Draft saved in this preview'
                      : 'Starting from applied configuration'}
              </strong>
              <span className="wcp-muted">
                {channels.length} channels · {devices.length} external devices
              </span>
            </div>
            <div className="wcp-actions">
              <Button variant="secondary" size="sm" isDisabled={!dirty || issues.length > 0} onPress={save}>
                Save draft
              </Button>
              <Button size="sm" onPress={review}>
                Review changes
                <ArrowRight />
              </Button>
            </div>
          </div>
          <nav className="wcp-sections" aria-label="Controller configuration sections">
            {(
              [
                { id: 'channels', label: 'Channels', icon: Settings2 },
                { id: 'devices', label: 'External devices', icon: Network },
                { id: 'review', label: 'Review & publish', icon: GitCompareArrows },
                { id: 'history', label: 'History', icon: History },
              ] as const
            ).map((item) => (
              <Button
                key={item.id}
                variant={section === item.id ? 'secondary' : 'ghost'}
                aria-current={section === item.id ? 'page' : undefined}
                onPress={() => {
                  setSection(item.id);
                  if (item.id === 'review') setStep(2);
                  else if (step === 2) setStep(channel ? 1 : 0);
                }}
              >
                <item.icon />
                {item.label}
                {item.id === 'channels' && channels.length > 0 && <span>{channels.length}</span>}
              </Button>
            ))}
          </nav>
          <div className="wcp-design-intro">
            <div>
              <strong>{variant.name}</strong>
              <span>{variant.description}</span>
            </div>
            <Chip size="sm" color={sample ? 'warning' : 'default'}>
              {sample ? 'Example channels' : 'Database starting point'}
            </Chip>
          </div>
          {notice && (
            <div role="status" className="wcp-notice">
              <Check />
              {notice}
            </div>
          )}
          {section === 'review'
            ? reviewContent
            : section === 'devices'
              ? devicesContent
              : section === 'history'
                ? historyContent
                : variant.key === 'A'
                  ? VariantA
                  : variant.key === 'B'
                    ? VariantB
                    : VariantC}
        </main>
      </div>
      {import.meta.env.DEV && (
        <div className="wcp-prototype-bar">
          <span className="wcp-prototype-badge">PROTOTYPE</span>
          <Button isIconOnly variant="ghost" aria-label="Previous design" onPress={() => switchVariant(-1)}>
            <ChevronLeft />
          </Button>
          <span className="wcp-variant-label">
            {variant.key} / {variant.name}
          </span>
          <Button isIconOnly variant="ghost" aria-label="Next design" onPress={() => switchVariant(1)}>
            <ChevronRight />
          </Button>
          <span className="wcp-bar-divider" />
          <Button variant="ghost" size="sm" onPress={sample || hasDraft ? reset : loadExamples}>
            {sample || hasDraft ? 'Reset to database' : 'Load example channels'}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setInspect(!inspect)}>
            {inspect ? 'Hide' : 'Inspect'} draft
          </Button>
          <span className="wcp-preview-only">Browser only · no device writes</span>
        </div>
      )}
      {inspect && (
        <aside className="wcp-state">
          <div className="wcp-row">
            <h3>Prototype state</h3>
            <Button size="sm" variant="ghost" onPress={() => setInspect(false)}>
              Close
            </Button>
          </div>
          <pre>
            {JSON.stringify(
              {
                variant: variant.key,
                source: sample ? 'Examples layered on database baseline' : 'Database baseline + local edits',
                database: {
                  controller: 'test',
                  commissioned: true,
                  appliedRevision: 1,
                  logicalChannels: [],
                  savedDraft: null,
                },
                dirty,
                localDraftSaved: saved === digest,
                issues,
                snapshot,
                editor: { names: Object.fromEntries(channels.map((item) => [item.id, item.name])) },
                externalDeviceDrafts: devices,
              },
              null,
              2,
            )}
          </pre>
        </aside>
      )}
    </div>
  );
}
