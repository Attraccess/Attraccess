import { Checkbox } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';
import type { Channel } from '../model';
import { NumericField } from './NumericField';
import { OptionSelect } from './OptionSelect';
import { translatedOptions } from './translatedOptions';

interface ChannelConditionsEditorProps {
  channel: Channel;
  inputs: Array<{ id: string; label: string }>;
  onChange: (channel: Channel) => void;
  onCapabilityChange: (kind: 'pulse' | 'guard' | 'feedback', enabled: boolean) => void;
}

export function ChannelConditionsEditor({
  channel,
  inputs,
  onChange,
  onCapabilityChange,
}: ChannelConditionsEditorProps) {
  const { t } = useWagoTranslations();
  const { guard, feedback } = channel;
  return (
    <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
      <p className="wg:text-sm wg:text-muted">{t('channels.safetyHint')}</p>
      <Checkbox
        isSelected={channel.capabilities.includes('guard')}
        onChange={(enabled) => onCapabilityChange('guard', enabled)}
      >
        <Checkbox.Content className="wg:items-start">
          <Checkbox.Control className="wg:mt-0.5">
            <Checkbox.Indicator />
          </Checkbox.Control>
          {t('channels.guard')}
        </Checkbox.Content>
      </Checkbox>
      {guard && (
        <>
          <OptionSelect
            label={t('channels.guardInput')}
            value={guard.channelId}
            options={inputs}
            onChange={(channelId) => onChange({ ...channel, guard: { ...guard, channelId } })}
          />
          <OptionSelect
            label={t('channels.guardWhen')}
            value={guard.when}
            options={translatedOptions(['on', 'off'], t)}
            onChange={(when) => onChange({ ...channel, guard: { ...guard, when: when as 'on' | 'off' } })}
          />
        </>
      )}
      <Checkbox
        isSelected={channel.capabilities.includes('feedback')}
        onChange={(enabled) => onCapabilityChange('feedback', enabled)}
      >
        <Checkbox.Content className="wg:items-start">
          <Checkbox.Control className="wg:mt-0.5">
            <Checkbox.Indicator />
          </Checkbox.Control>
          {t('channels.feedback')}
        </Checkbox.Content>
      </Checkbox>
      {feedback && (
        <>
          <OptionSelect
            label={t('channels.feedbackInput')}
            value={feedback.channelId}
            options={inputs}
            onChange={(channelId) => onChange({ ...channel, feedback: { ...feedback, channelId } })}
          />
          <OptionSelect
            label={t('channels.expectedFeedback')}
            value={feedback.expected}
            options={translatedOptions(['match', 'inverse'], t)}
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
  );
}
