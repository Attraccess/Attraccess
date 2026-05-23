import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { PasswordPolicyDto } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import en from './en.json';
import de from './de.json';

interface Props {
  value: PasswordPolicyDto;
  onChange: (next: PasswordPolicyDto) => void;
  testIdPrefix?: string;
}

function NumberRow({
  label,
  description,
  value,
  onChange,
  minValue,
  maxValue,
  dataTestid,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  minValue?: number;
  maxValue?: number;
  dataTestid?: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={dataTestid}>
      <span className="text-sm font-medium">{label}</span>
      <NumberField value={value} onChange={onChange} minValue={minValue} maxValue={maxValue}>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
      {description && <span className="text-xs text-default-500">{description}</span>}
    </div>
  );
}

export function PolicyFields({ value, onChange, testIdPrefix = 'policy' }: Props) {
  const { t } = useTranslations({ en, de });
  const update = <K extends keyof PasswordPolicyDto>(key: K, v: PasswordPolicyDto[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <NumberRow
        label={t('fields.minLength.label')}
        description={t('fields.minLength.description')}
        value={value.minLength}
        onChange={(v) => update('minLength', v)}
        minValue={8}
        maxValue={1024}
        dataTestid={`${testIdPrefix}-minLength`}
      />
      <NumberRow
        label={t('fields.maxLength.label')}
        description={t('fields.maxLength.description')}
        value={value.maxLength}
        onChange={(v) => update('maxLength', v)}
        minValue={1}
        maxValue={1024}
        dataTestid={`${testIdPrefix}-maxLength`}
      />
      <NumberRow
        label={t('fields.minZxcvbnScore.label')}
        description={t('fields.minZxcvbnScore.description')}
        value={value.minZxcvbnScore}
        onChange={(v) => update('minZxcvbnScore', v)}
        minValue={0}
        maxValue={4}
        dataTestid={`${testIdPrefix}-minZxcvbnScore`}
      />
      <NumberRow
        label={t('fields.historySize.label')}
        description={t('fields.historySize.description')}
        value={value.historySize}
        onChange={(v) => update('historySize', v)}
        minValue={0}
        maxValue={50}
        dataTestid={`${testIdPrefix}-historySize`}
      />
      <NumberRow
        label={t('fields.rotationDays.label')}
        description={t('fields.rotationDays.description')}
        value={value.rotationDays}
        onChange={(v) => update('rotationDays', v)}
        minValue={0}
        maxValue={3650}
        dataTestid={`${testIdPrefix}-rotationDays`}
      />
      {(
        [
          'allowAllUnicode',
          'requireUppercase',
          'requireLowercase',
          'requireDigit',
          'requireSpecial',
          'checkHIBP',
          'checkCommonPasswords',
        ] as const
      ).map((key) => (
        <LabeledSwitch
          key={key}
          isSelected={value[key]}
          onChange={(v) => update(key, v)}
          data-testid={`${testIdPrefix}-${key}`}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
            <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
          </div>
        </LabeledSwitch>
      ))}
    </div>
  );
}
