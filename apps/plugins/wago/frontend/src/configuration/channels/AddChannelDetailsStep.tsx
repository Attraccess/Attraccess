import { Input, Label, TextField } from '@heroui/react';
import type { ConfigurationEditorMetadata } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import type { Channel } from '../model';
import type { AddChannelDraft, TerminalOption } from './channelWorkspaceModel';
import { NumericField } from './NumericField';
import { OptionSelect } from './OptionSelect';

interface AddChannelDetailsStepProps {
  draft: AddChannelDraft;
  onDraftChange: (patch: Partial<AddChannelDraft>) => void;
  direction: 'input' | 'output';
  terminals: TerminalOption[];
  selectedTerminal: TerminalOption | undefined;
  inputs: Channel[];
  metadata: ConfigurationEditorMetadata;
}

export function AddChannelDetailsStep({
  draft,
  onDraftChange,
  direction,
  terminals,
  selectedTerminal,
  inputs,
  metadata,
}: AddChannelDetailsStepProps) {
  const { t } = useWagoTranslations();
  const { name, purpose, pulseMs, guardId, disconnect, timeoutMs } = draft;
  return (
    <>
      <TextField isRequired>
        <Label>{t('channels.newName')}</Label>
        <Input
          autoFocus
          maxLength={120}
          value={name}
          onChange={(event) => onDraftChange({ name: event.target.value })}
          placeholder={t(direction === 'input' ? 'channels.inputPlaceholder' : 'channels.outputPlaceholder')}
        />
      </TextField>
      {!selectedTerminal ? (
        <p role="alert">{t('channels.allAssigned', { direction: t(`channels.${direction}`) })}</p>
      ) : (
        <OptionSelect
          label={t('channels.assign')}
          value={String(selectedTerminal.channel)}
          options={terminals.map((item) => ({ id: String(item.channel), label: `CC100 ${item.label}` }))}
          onChange={(value) => onDraftChange({ assignment: Number(value) })}
        />
      )}
      {purpose === 'pulse' && (
        <NumericField
          label={t('channels.pulseDuration')}
          value={pulseMs}
          min={1}
          onChange={(value) => onDraftChange({ pulseMs: value })}
        />
      )}
      {purpose === 'guard' && (
        <>
          <OptionSelect
            label={t('channels.guardInput')}
            value={guardId}
            options={inputs.map((item) => ({ id: item.id, label: metadata.names[item.id] || item.id }))}
            onChange={(value) => onDraftChange({ guardId: value })}
          />
          <p className="wg:text-sm wg:text-muted">{t('channels.guardHint')}</p>
          {!inputs.length && <p role="alert">{t('channels.inputFirst')}</p>}
        </>
      )}
      {direction === 'output' && (
        <>
          <OptionSelect
            label={t('channels.disconnect')}
            value={disconnect}
            options={[
              { id: 'immediate', label: t('channels.immediate') },
              { id: 'watchdog', label: t('channels.watchdog') },
              { id: 'hold', label: t('channels.hold') },
            ]}
            onChange={(value) => onDraftChange({ disconnect: value })}
          />
          {disconnect === 'watchdog' && (
            <NumericField
              label={t('channels.watchdogTimeout')}
              min={1}
              value={timeoutMs}
              onChange={(value) => onDraftChange({ timeoutMs: value })}
            />
          )}
        </>
      )}
    </>
  );
}
