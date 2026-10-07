import { Checkbox } from '@heroui/react';
import { Choice } from './DigitalChannelEditor.helpers';
import { NumericField } from './DigitalChannelEditor.helpers';
import { options } from './DigitalChannelEditor.options';
import { useDigitalChannelEditorState } from './useDigitalChannelEditorState';
type Props = Pick<
  ReturnType<typeof useDigitalChannelEditorState>,
  't' | 'channel' | 'capability' | 'guard' | 'inputs' | 'onChange' | 'feedback'
>;
export function DigitalChannelEditorChannelsSafetyHint({
  t,
  channel,
  capability,
  guard,
  inputs,
  onChange,
  feedback,
}: Props) {
  return (
    <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
      <p className="wg:text-sm wg:text-muted">{t('channels.safetyHint')}</p>
      <Checkbox
        isSelected={channel.capabilities.includes('guard')}
        onChange={(enabled) => capability('guard', enabled)}
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
        <Checkbox.Content className="wg:items-start">
          <Checkbox.Control className="wg:mt-0.5">
            <Checkbox.Indicator />
          </Checkbox.Control>
          {t('channels.feedback')}
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
  );
}
