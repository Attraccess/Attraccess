import { Checkbox } from '@heroui/react';
import { NumericField } from './DigitalChannelEditor';
import { useDigitalChannelEditorState } from './useDigitalChannelEditorState';
type Props = Pick<ReturnType<typeof useDigitalChannelEditorState>, 'range' | 't' | 'channel' | 'onChange'>;
export function DigitalChannelEditorDetails({ range, t, channel, onChange }: Props) {
  return (
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
          <Checkbox.Content className="wg:items-start">
            <Checkbox.Control className="wg:mt-0.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('channels.valueRange')}
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
  );
}
