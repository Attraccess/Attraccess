import type { ResourceApplicableFormDto } from '@attraccess/react-query-client';
import { Select } from '../../../../components/select';
import { useFormsTranslations } from '../../../forms/useFormsTranslations';
import { OverrideAction, OverrideChoice, OverrideFlag, toChoice } from './overrideFlags';

interface OverrideSelectProps {
  item: ResourceApplicableFormDto;
  action: OverrideAction;
  flag: OverrideFlag;
  isDisabled: boolean;
  onChange: (choice: OverrideChoice) => void;
}

/** Inherit the form's default for one action, or require it or not on this resource. */
export function OverrideSelect({ item, action, flag, isDisabled, onChange }: Readonly<OverrideSelectProps>) {
  const { t } = useFormsTranslations();
  const inherited = item.form[flag]
    ? t('resourceTab.override.inheritsRequired')
    : t('resourceTab.override.inheritsNotRequired');
  return (
    <Select
      aria-label={t('resourceTab.override.label', { action: t(`resourceTab.columns.${action}`), name: item.form.name })}
      value={toChoice(item.override?.[flag])}
      onChange={(key) => onChange(key as OverrideChoice)}
      isDisabled={isDisabled}
      // Keeps the choice readable: on a narrow screen the table scrolls instead of squeezing the select.
      className="min-w-28"
      items={[
        { key: 'inherit', label: inherited, textValue: inherited },
        { key: 'required', label: t('resourceTab.override.required') },
        { key: 'notRequired', label: t('resourceTab.override.notRequired') },
      ]}
      data-cy={`resource-form-override-${action}-${item.form.id}`}
    />
  );
}
