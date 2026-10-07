import {
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { useResourceBillingInfoState } from './useResourceBillingInfoState';
type Props = Pick<
  ReturnType<typeof useResourceBillingInfoState>,
  't' | 'exampleSessionMinutes' | 'setExampleSessionMinutes' | 'setExampleOperatingMinutes' | 'exampleOperatingMinutes'
>;
export function ResourceBillingInfoDt({
  t,
  exampleSessionMinutes,
  setExampleSessionMinutes,
  setExampleOperatingMinutes,
  exampleOperatingMinutes,
}: Props) {
  return (
    <dt className="flex flex-col gap-2">
      <span className="font-medium">{t('example.label')}</span>
      <NumberField
        value={exampleSessionMinutes}
        onChange={(value) => {
          setExampleSessionMinutes(value);
          setExampleOperatingMinutes((operatingMinutes) => Math.min(operatingMinutes, value));
        }}
        minValue={0}
        defaultValue={10}
      >
        <Label>{t('example.sessionDuration.label')}</Label>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
      <NumberField
        value={exampleOperatingMinutes}
        onChange={(value) => setExampleOperatingMinutes(value)}
        minValue={0}
        maxValue={exampleSessionMinutes}
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
