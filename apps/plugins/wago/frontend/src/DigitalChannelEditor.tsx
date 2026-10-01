import { Button, Checkbox, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import type { ReactNode } from 'react';
import type { Channel } from './configuration-model';
import { pointLabel, presetDisplayName } from './configuration-model';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { ModbusPointForm } from './ModbusConfigurationForm';
import { bindModbusPoint, emptyModbus } from './modbus-editor';
import { outputBehavior } from '../../channel-behavior';
import { availableDigitalTerminals } from '../../backend/configuration-digital';
import { useWagoTranslations } from './i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';

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
  const { t } = useWagoTranslations();
  return (
    <Select
      value={value || null}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      placeholder={t('channels.select')}
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

const options = <T extends string>(values: readonly T[], t: TFunction) =>
  values.map((id) => ({ id, label: t(`channels.${id}`) }));

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
  const { t } = useWagoTranslations();
  const inputs = snapshot.logicalChannels
    .filter((item) => item.id !== channel.id && item.capabilities.includes('input'))
    .map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }));
  const output = channel.capabilities.includes('output');
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  const { guard, feedback, range } = channel;
  if (!point) return <p role="alert">{t('channels.noAssignment')}</p>;
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
      <legend className="wg:sr-only">{metadata.names[channel.id] ?? channel.id}</legend>
      <p className="wg:text-sm wg:text-muted">
        {t('channels.preset', { preset: presetDisplayName(channel.profile, t) })}
      </p>
      <TextField isRequired>
        <Label>{t('channels.name')}</Label>
        <Input
          maxLength={120}
          value={metadata.names[channel.id] ?? channel.id}
          onChange={(event) => onRename(channel.id, event.target.value)}
        />
      </TextField>
      {assignment ?? (
        <Choice
          label={t('channels.terminal')}
          value={String(point.channel)}
          options={availableDigitalTerminals(snapshot, output ? 'output' : 'input', point.id).map((terminal) => ({
            id: String(terminal.channel),
            label: `CC100 ${terminal.label}`,
          }))}
          onChange={(value) => onAssign(Number(value))}
        />
      )}
      <details className="wg:rounded-lg wg:border wg:border-border wg:p-3">
        <summary className="wg:cursor-pointer wg:font-medium">{t('channels.wiringLabel')}</summary>
        <TextField isRequired>
          <Label>{t('channels.pointLabel')}</Label>
          <Input
            maxLength={120}
            value={metadata.names[point.id] ?? pointLabel(point, metadata.names, t)}
            onChange={(event) => onRename(point.id, event.target.value)}
          />
        </TextField>
      </details>
      <h3 className="wg:mt-3 wg:font-semibold">{t('channels.behavior')}</h3>
      <p className="wg:text-sm wg:text-muted">
        {t(output ? 'channels.outputDescription' : 'channels.inputDescription')}
      </p>
      <Choice
        label={t('channels.disconnect')}
        value={channel.disconnectPolicy.mode}
        options={[
          { id: 'immediate', label: t('channels.immediate') },
          { id: 'watchdog', label: t('channels.watchdog') },
          { id: 'hold', label: t('channels.hold') },
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
          label={t('channels.watchdogTimeout')}
          min={1}
          value={channel.disconnectPolicy.timeoutMs ?? 1000}
          onChange={(timeoutMs) => onChange({ ...channel, disconnectPolicy: { mode: 'watchdog', timeoutMs } })}
        />
      )}
      {output && (
        <>
          <Choice
            label={t('channels.outputBehavior')}
            value={outputBehavior(channel) ?? 'switched'}
            options={[
              { id: 'switched', label: t('channels.switched') },
              { id: 'pulsed', label: t('channels.pulsed') },
            ]}
            onChange={(behavior) => capability('pulse', behavior === 'pulsed')}
          />
          <p className="wg:text-sm wg:text-muted">
            {t(outputBehavior(channel) === 'pulsed' ? 'channels.pulsedDescription' : 'channels.switchedDescription')}
          </p>
          {channel.pulse && (
            <NumericField
              label={t('channels.pulseDuration')}
              min={1}
              value={channel.pulse.durationMs}
              onChange={(durationMs) => onChange({ ...channel, pulse: { durationMs } })}
            />
          )}
          <details className="wg:rounded-lg wg:border wg:border-border wg:p-3" open={!!guard || !!feedback}>
            <summary className="wg:cursor-pointer wg:font-medium">{t('channels.conditions')}</summary>
            <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
              <p className="wg:text-sm wg:text-muted">{t('channels.safetyHint')}</p>
              <Checkbox
                isSelected={channel.capabilities.includes('guard')}
                onChange={(enabled) => capability('guard', enabled)}
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  <Label>{t('channels.guard')}</Label>
                </Checkbox.Content>
              </Checkbox>
              {guard && (
                <>
                  <Choice
                    label={t('channels.guardInput')}
                    value={guard.channelId}
                    options={inputs}
                    onChange={(channelId) => onChange({ ...channel, guard: { ...guard, channelId } })}
                  />
                  <Choice
                    label={t('channels.guardWhen')}
                    value={guard.when}
                    options={options(['on', 'off'], t)}
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
                  <Label>{t('channels.feedback')}</Label>
                </Checkbox.Content>
              </Checkbox>
              {feedback && (
                <>
                  <Choice
                    label={t('channels.feedbackInput')}
                    value={feedback.channelId}
                    options={inputs}
                    onChange={(channelId) => onChange({ ...channel, feedback: { ...feedback, channelId } })}
                  />
                  <Choice
                    label={t('channels.expectedFeedback')}
                    value={feedback.expected}
                    options={options(['match', 'inverse'], t)}
                    onChange={(expected) =>
                      onChange({ ...channel, feedback: { ...feedback, expected: expected as 'match' | 'inverse' } })
                    }
                  />
                  <NumericField
                    label={t('channels.feedbackTimeout')}
                    min={1}
                    value={feedback.timeoutMs}
                    onChange={(timeoutMs) => onChange({ ...channel, feedback: { ...feedback, timeoutMs } })}
                  />
                </>
              )}
              {!inputs.length && <p>{t('channels.addInput')}</p>}
            </div>
          </details>
        </>
      )}
      {(channel.capabilities.includes('input') || channel.capabilities.includes('measurement')) && (
        <details className="wg:rounded-lg wg:border wg:border-border wg:p-3" open={!!range}>
          <summary className="wg:cursor-pointer wg:font-medium">{t('channels.range')}</summary>
          <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
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
                <Label>{t('channels.valueRange')}</Label>
              </Checkbox.Content>
            </Checkbox>
            {range && (
              <>
                <NumericField
                  label={t('channels.minimum')}
                  integer={false}
                  value={range.minimum}
                  onChange={(minimum) => onChange({ ...channel, range: { ...range, minimum } })}
                />
                <NumericField
                  label={t('channels.maximum')}
                  integer={false}
                  value={range.maximum}
                  onChange={(maximum) => onChange({ ...channel, range: { ...range, maximum } })}
                />
              </>
            )}
          </div>
        </details>
      )}
      <details>
        <summary>{t('channels.reference')}</summary>
        <p>{channel.id}</p>
      </details>
      <Button variant="danger" onPress={onRemove}>
        {t('channels.remove')}
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
  const { t } = useWagoTranslations();
  const unused = snapshot.physicalPoints.filter(
    (point) =>
      (point.hardwareProfile === '751-9301' || point.hardwareProfile === 'modbus') &&
      !snapshot.logicalChannels.some((channel) => channel.physicalPointId === point.id),
  );
  if (!unused.length) return null;
  return (
    <section aria-label={t('channels.unusedAssignments')} className="wg:min-w-0">
      <h3>{t('channels.unusedAssignments')}</h3>
      {unused.map((point) => (
        <fieldset key={point.id} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-3">
          <legend className="wg:max-w-full wg:whitespace-normal wg:break-words">
            {pointLabel(point, metadata.names, t)}
          </legend>
          {point.hardwareProfile === 'modbus' && (
            <ModbusPointForm
              configuration={snapshot.modbus ?? emptyModbus}
              value={point.modbus ?? { deviceId: '' }}
              onChange={(binding) => onChange(bindModbusPoint(snapshot, point.id, binding))}
            />
          )}
          <Button
            className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
            variant="secondary"
            onPress={() =>
              onChange({ ...snapshot, physicalPoints: snapshot.physicalPoints.filter((item) => item.id !== point.id) })
            }
          >
            {t('channels.release', { point: pointLabel(point, metadata.names, t) })}
          </Button>
        </fieldset>
      ))}
    </section>
  );
}
