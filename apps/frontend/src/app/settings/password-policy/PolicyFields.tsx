import { NumberInput, Switch } from '@heroui/react';
import { PasswordPolicyDto } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface Props {
  value: PasswordPolicyDto;
  onChange: (next: PasswordPolicyDto) => void;
  testIdPrefix?: string;
}

export function PolicyFields({ value, onChange, testIdPrefix = 'policy' }: Props) {
  const { t } = useTranslations({ en, de });
  const update = <K extends keyof PasswordPolicyDto>(key: K, v: PasswordPolicyDto[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <NumberInput
        label={t('fields.minLength.label')}
        description={t('fields.minLength.description')}
        value={value.minLength}
        onValueChange={(v) => update('minLength', v)}
        minValue={1}
        maxValue={1024}
        variant="bordered"
        data-testid={`${testIdPrefix}-minLength`}
      />
      <NumberInput
        label={t('fields.maxLength.label')}
        description={t('fields.maxLength.description')}
        value={value.maxLength}
        onValueChange={(v) => update('maxLength', v)}
        minValue={1}
        maxValue={1024}
        variant="bordered"
        data-testid={`${testIdPrefix}-maxLength`}
      />
      <NumberInput
        label={t('fields.minZxcvbnScore.label')}
        description={t('fields.minZxcvbnScore.description')}
        value={value.minZxcvbnScore}
        onValueChange={(v) => update('minZxcvbnScore', v)}
        minValue={0}
        maxValue={4}
        variant="bordered"
        data-testid={`${testIdPrefix}-minZxcvbnScore`}
      />
      <NumberInput
        label={t('fields.historySize.label')}
        description={t('fields.historySize.description')}
        value={value.historySize}
        onValueChange={(v) => update('historySize', v)}
        minValue={0}
        maxValue={50}
        variant="bordered"
        data-testid={`${testIdPrefix}-historySize`}
      />
      <NumberInput
        label={t('fields.rotationDays.label')}
        description={t('fields.rotationDays.description')}
        value={value.rotationDays}
        onValueChange={(v) => update('rotationDays', v)}
        minValue={0}
        maxValue={3650}
        variant="bordered"
        data-testid={`${testIdPrefix}-rotationDays`}
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
        <Switch
          key={key}
          isSelected={value[key]}
          onValueChange={(v) => update(key, v)}
          data-testid={`${testIdPrefix}-${key}`}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
            <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
          </div>
        </Switch>
      ))}
    </div>
  );
}
