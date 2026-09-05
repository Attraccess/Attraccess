import { Button, Checkbox, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import type { ReactNode } from 'react';
import type { Channel } from './configuration-model';
import { pointLabel } from './configuration-model';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { availableDigitalTerminals } from '../../backend/configuration-digital';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || null}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      placeholder="Select…"
    >
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

export function NumericField({
  label,
  value,
  onChange,
  min,
  integer = true,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  integer?: boolean;
}) {
  return (
    <TextField isRequired>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        step={integer ? 1 : 'any'}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      />
    </TextField>
  );
}

const options = <T extends string>(values: readonly T[]) => values.map((id) => ({ id, label: id }));

export function DigitalChannelEditor({
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
  const inputs = snapshot.logicalChannels
    .filter((item) => item.id !== channel.id && item.capabilities.includes('input'))
    .map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }));
  const output = channel.capabilities.includes('output');
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  const { guard, feedback, range } = channel;
  if (!point) return <p role="alert">This channel has no physical assignment.</p>;
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
  return (
    <fieldset className="wg:flex wg:flex-col wg:gap-3">
      <legend className="wg:font-medium">{metadata.names[channel.id] ?? channel.id}</legend>
      <p>
        {channel.profile.replaceAll('-', ' ')} · {channel.capabilities.join(', ')}
      </p>
      <TextField isRequired>
        <Label>Channel name</Label>
        <Input
          maxLength={120}
          value={metadata.names[channel.id] ?? channel.id}
          onChange={(event) => onRename(channel.id, event.target.value)}
        />
      </TextField>
      {assignment ?? (
        <Choice
          label="Physical terminal"
          value={String(point.channel)}
          options={availableDigitalTerminals(snapshot, output ? 'output' : 'input', point.id).map((terminal) => ({
            id: String(terminal.channel),
            label: `CC100 ${terminal.label}`,
          }))}
          onChange={(value) => onAssign(Number(value))}
        />
      )}
      <TextField isRequired>
        <Label>Physical point label</Label>
        <Input
          maxLength={120}
          value={metadata.names[point.id] ?? pointLabel(point, metadata.names)}
          onChange={(event) => onRename(point.id, event.target.value)}
        />
      </TextField>
      <Choice
        label="On disconnect"
        value={channel.disconnectPolicy.mode}
        options={[
          { id: 'immediate', label: 'Immediately off' },
          { id: 'watchdog', label: 'Off after watchdog timeout' },
          { id: 'hold', label: 'Hold last state' },
        ]}
        onChange={(mode) =>
          onChange({
            ...channel,
            disconnectPolicy: mode === 'watchdog' ? { mode, timeoutMs: 1000 } : { mode: mode as 'hold' | 'immediate' },
          })
        }
      />
      {channel.disconnectPolicy.mode === 'watchdog' && (
        <NumericField
          label="Watchdog timeout (ms)"
          min={1}
          value={channel.disconnectPolicy.timeoutMs ?? 1000}
          onChange={(timeoutMs) => onChange({ ...channel, disconnectPolicy: { mode: 'watchdog', timeoutMs } })}
        />
      )}
      {output && (
        <>
          <Checkbox
            isSelected={channel.capabilities.includes('pulse')}
            isDisabled={channel.profile === 'pulsed-lock-bank'}
            onChange={(enabled) => capability('pulse', enabled)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>Pulse output</Label>
            </Checkbox.Content>
          </Checkbox>
          {channel.pulse && (
            <NumericField
              label="Pulse duration (ms)"
              min={1}
              value={channel.pulse.durationMs}
              onChange={(durationMs) => onChange({ ...channel, pulse: { durationMs } })}
            />
          )}
          <Checkbox
            isSelected={channel.capabilities.includes('guard')}
            isDisabled={channel.profile === 'guarded-enable-request'}
            onChange={(enabled) => capability('guard', enabled)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>Operational guard</Label>
            </Checkbox.Content>
          </Checkbox>
          {guard && (
            <>
              <Choice
                label="Guard input"
                value={guard.channelId}
                options={inputs}
                onChange={(channelId) => onChange({ ...channel, guard: { ...guard, channelId } })}
              />
              <Choice
                label="Allow output when guard is"
                value={guard.when}
                options={options(['on', 'off'])}
                onChange={(when) => onChange({ ...channel, guard: { ...guard, when: when as 'on' | 'off' } })}
              />
            </>
          )}
          <Checkbox
            isSelected={channel.capabilities.includes('feedback')}
            onChange={(enabled) => capability('feedback', enabled)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>Monitor feedback</Label>
            </Checkbox.Content>
          </Checkbox>
          {feedback && (
            <>
              <Choice
                label="Feedback input"
                value={feedback.channelId}
                options={inputs}
                onChange={(channelId) => onChange({ ...channel, feedback: { ...feedback, channelId } })}
              />
              <Choice
                label="Expected feedback"
                value={feedback.expected}
                options={options(['match', 'inverse'])}
                onChange={(expected) =>
                  onChange({ ...channel, feedback: { ...feedback, expected: expected as 'match' | 'inverse' } })
                }
              />
              <NumericField
                label="Feedback timeout (ms)"
                min={1}
                value={feedback.timeoutMs}
                onChange={(timeoutMs) => onChange({ ...channel, feedback: { ...feedback, timeoutMs } })}
              />
            </>
          )}
          {!inputs.length && <p>Add a digital input to configure guards or feedback.</p>}
        </>
      )}
      {channel.capabilities.includes('input') && (
        <>
          <Checkbox
            isSelected={!!channel.range}
            onChange={(enabled) => {
              const next = { ...channel };
              if (enabled) next.range = { minimum: 0, maximum: 1 };
              else delete next.range;
              onChange(next);
            }}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>Expected value range</Label>
            </Checkbox.Content>
          </Checkbox>
          {range && (
            <>
              <NumericField
                label="Minimum"
                integer={false}
                value={range.minimum}
                onChange={(minimum) => onChange({ ...channel, range: { ...range, minimum } })}
              />
              <NumericField
                label="Maximum"
                integer={false}
                value={range.maximum}
                onChange={(maximum) => onChange({ ...channel, range: { ...range, maximum } })}
              />
            </>
          )}
        </>
      )}
      <details>
        <summary>Stable internal reference</summary>
        <p>{channel.id}</p>
      </details>
      <Button variant="danger" onPress={onRemove}>
        Remove channel
      </Button>
    </fieldset>
  );
}

export function PhysicalAssignments({
  snapshot,
  metadata,
  onChange,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onChange: (snapshot: WagoConfigurationSnapshot) => void;
}) {
  const unused = snapshot.physicalPoints.filter(
    (point) =>
      point.hardwareProfile === '751-9301' &&
      !snapshot.logicalChannels.some((channel) => channel.physicalPointId === point.id),
  );
  if (!unused.length) return null;
  return (
    <section aria-label="Unused physical assignments">
      <h3>Unused physical assignments</h3>
      {unused.map((point) => (
        <div key={point.id}>
          <p>{pointLabel(point, metadata.names)}</p>
          <Button
            variant="secondary"
            onPress={() =>
              onChange({ ...snapshot, physicalPoints: snapshot.physicalPoints.filter((item) => item.id !== point.id) })
            }
          >
            Release {pointLabel(point, metadata.names)}
          </Button>
        </div>
      ))}
    </section>
  );
}
