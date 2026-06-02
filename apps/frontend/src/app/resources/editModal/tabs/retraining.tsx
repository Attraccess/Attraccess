import { TextField, Label, Input } from '@heroui/react';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { EditorTabProps } from './props';

export function RetrainingTab(props: EditorTabProps) {
  const { t, formData, setField } = props;

  const numberToValue = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);

  const onNumberChange = (field: 'retrainingMaxAgeDays' | 'retrainingMaxInactivityDays', raw: string) => {
    const trimmed = raw.trim();
    setField(field, trimmed === '' ? null : Math.max(0, Math.floor(Number(trimmed))));
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-tiny text-default-400">{t('inputs.retraining.description')}</span>

      <TextField
        value={numberToValue(formData.retrainingMaxAgeDays)}
        onChange={(v) => onNumberChange('retrainingMaxAgeDays', v)}
        data-cy="resource-edit-modal-retraining-max-age-input"
        className="w-full"
      >
        <Label>{t('inputs.retraining.maxAgeDays.label')}</Label>
        <Input type="number" min={0} className="w-full" placeholder={t('inputs.retraining.disabledPlaceholder')} />
        <span className="text-tiny text-default-400">{t('inputs.retraining.maxAgeDays.description')}</span>
      </TextField>

      <TextField
        value={numberToValue(formData.retrainingMaxInactivityDays)}
        onChange={(v) => onNumberChange('retrainingMaxInactivityDays', v)}
        data-cy="resource-edit-modal-retraining-max-inactivity-input"
        className="w-full"
      >
        <Label>{t('inputs.retraining.maxInactivityDays.label')}</Label>
        <Input type="number" min={0} className="w-full" placeholder={t('inputs.retraining.disabledPlaceholder')} />
        <span className="text-tiny text-default-400">{t('inputs.retraining.maxInactivityDays.description')}</span>
      </TextField>

      <LabeledSwitch
        isSelected={formData.retrainingBlocksAccess ?? false}
        onChange={(value) => setField('retrainingBlocksAccess', value)}
        data-cy="resource-edit-modal-retraining-blocks-access-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.retraining.blocksAccess.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.retraining.blocksAccess.description')}</span>
        </div>
      </LabeledSwitch>
    </div>
  );
}
