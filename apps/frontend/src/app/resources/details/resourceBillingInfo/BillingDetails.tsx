import {
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

interface BillingDetailsProps {
  sessionMinutes: number;
  operatingMinutes: number;
  onSessionMinutesChange: (minutes: number) => void;
  onOperatingMinutesChange: (minutes: number) => void;
}

/** The two number inputs (session and operating duration) of the example cost calculation. */
export function BillingDetails({
  sessionMinutes,
  operatingMinutes,
  onSessionMinutesChange,
  onOperatingMinutesChange,
}: Readonly<BillingDetailsProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <dt className="flex flex-col gap-2">
      <span className="font-medium">{t('example.label')}</span>
      <NumberField value={sessionMinutes} onChange={onSessionMinutesChange} minValue={0} defaultValue={10}>
        <Label>{t('example.sessionDuration.label')}</Label>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
      <NumberField
        value={operatingMinutes}
        onChange={onOperatingMinutesChange}
        minValue={0}
        maxValue={sessionMinutes}
        defaultValue={10}
      >
        <Label>{t('example.operatingDuration.label')}</Label>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
    </dt>
  );
}
