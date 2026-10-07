import { Button, Input, Label, TextField } from '@heroui/react';
import type { ReactNode } from 'react';
import type { Channel } from './configuration-model';
import { pointLabel, presetDisplayName } from './configuration-model';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { outputBehavior } from '../../channel-behavior';
import { availableDigitalTerminals } from '../../backend/configuration-digital';
import { Choice } from './DigitalChannelEditor.helpers';
import { NumericField } from './DigitalChannelEditor.helpers';

import { PhysicalAssignments } from './DigitalChannelEditor.helpers';
import { useDigitalChannelEditorState } from './useDigitalChannelEditorState';
import { DigitalChannelEditorDetails } from './DigitalChannelEditorDetails';
import { DigitalChannelEditorChannelsSafetyHint } from './DigitalChannelEditorChannelsSafetyHint';

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
  const { t, inputs, output, point, guard, feedback, range, capability } = useDigitalChannelEditorState({
    channel,
    snapshot,
    metadata,
    onChange,
    onRename,
    onRemove,
    onAssign,
    assignment,
  });

  if (!point) return <p role="alert">{t('channels.noAssignment')}</p>;
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
            <DigitalChannelEditorChannelsSafetyHint
              {...{ t, channel, capability, guard, inputs, onChange, feedback }}
            />
          </details>
        </>
      )}
      {(channel.capabilities.includes('input') || channel.capabilities.includes('measurement')) && (
        <DigitalChannelEditorDetails {...{ range, t, channel, onChange }} />
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

export { Choice } from './DigitalChannelEditor.helpers';
export { NumericField } from './DigitalChannelEditor.helpers';
export { PhysicalAssignments };
