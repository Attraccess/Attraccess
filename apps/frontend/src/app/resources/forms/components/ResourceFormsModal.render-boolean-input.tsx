import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { FieldValue } from './ResourceFormsModal.field-value';

export function renderBooleanInput(
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
) {
  const isChecked = value === true;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-default-500">{t('modal.booleanNo')}</span>
        <LabeledSwitch
          isSelected={isChecked}
          onChange={(checked) => onChange(checked)}
          aria-label={t('modal.booleanLabel')}
          className={error ? 'text-danger' : undefined}
        />
        <span className="text-xs text-default-500">{t('modal.booleanYes')}</span>
      </div>
      {error && (
        <p className="flex items-start gap-1 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
