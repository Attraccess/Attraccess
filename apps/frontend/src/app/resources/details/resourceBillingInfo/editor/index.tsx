import {
  Description,
  FieldError,
  Input,
  TextField,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Form,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { MeterNameEditor } from '../../meters/MeterNameEditor';
import { MeterSetupNotice } from '../metering/MeterNotices';
import { formatCredits, parseCredits } from '@attraccess/shared';
import { Props } from './index.props';
import { useResourceBillingInfoEditorState } from './useResourceBillingInfoEditorState';

export function ResourceBillingInfoEditor(props: Props) {
  const {
    resourceId,
    isOpen,
    open,
    setOpen,
    t,
    configuration,
    isSaving,
    creditsPerUsage,
    setCreditsPerUsage,
    creditsPerMinute,
    setCreditsPerMinute,
    creditsPerOperatingMinute,
    setCreditsPerOperatingMinute,
    meters,
    ratesPending,
    rates,
    setRates,
    onSubmit,
    hasPermission,
  } = useResourceBillingInfoEditorState(props);

  if (!hasPermission('billing.manage')) {
    return null;
  }

  if (!configuration) {
    return null;
  }

  return (
    <>
      {props.children(open)}
      <StandardDrawer dialogProps={{ 'aria-label': t('title') }} isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
        </DrawerHeader>
        <DrawerBody>
          <Form onSubmit={onSubmit} className="flex flex-col gap-4">
            <NumberField
              value={creditsPerUsage}
              minValue={0}
              onChange={(value) => setCreditsPerUsage(value)}
              defaultValue={0}
            >
              <Label>{t('inputs.creditsPerUsage.label', { currency: configuration.currency })}</Label>
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
            <NumberField
              value={creditsPerOperatingMinute}
              minValue={0}
              onChange={(value) => setCreditsPerOperatingMinute(value)}
              defaultValue={0}
            >
              <Label>{t('inputs.creditsPerOperatingMinute.label', { currency: configuration.currency })}</Label>
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
            <NumberField
              value={creditsPerMinute}
              minValue={0}
              onChange={(value) => setCreditsPerMinute(value)}
              defaultValue={0}
            >
              <Label>{t('inputs.creditsPerMinute.label', { currency: configuration.currency })}</Label>
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
            {meters.map((meter) => {
              const value =
                rates[meter.id] ?? formatCredits(meter.creditsPerUnit, configuration.minorUnit, { useGrouping: false });
              let invalid = false;
              try {
                parseCredits(value, configuration.minorUnit);
              } catch {
                invalid = true;
              }
              return (
                <TextField
                  key={meter.id}
                  value={value}
                  onChange={(value) => setRates((previous) => ({ ...previous, [meter.id]: value }))}
                  isInvalid={invalid}
                >
                  <Label>
                    {meter.name} — {t('inputs.meterRate.label', { currency: configuration.currency })}
                  </Label>
                  <Input inputMode="decimal" />
                  <Description>{t('inputs.meterRate.description')}</Description>
                  <FieldError>{t('inputs.meterRate.invalid', { digits: configuration.minorUnit })}</FieldError>
                </TextField>
              );
            })}
            <MeterNameEditor resourceId={resourceId} />
            <MeterSetupNotice resourceId={resourceId} />
            <input hidden type="submit" />
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="primary" onPress={onSubmit} isPending={isSaving || ratesPending}>
            {t('actions.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
