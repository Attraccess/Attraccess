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
  Radio,
  RadioGroup,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  useOverlayState,
} from '@heroui/react';
import { MeterNameEditor } from '../../meters/MeterNameEditor';
import { MeterSetupNotice } from '../metering/MeterNotices';
import { formatCredits, parseCredits, dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import {
  UseListResourceMetersKeyFn,
  useListResourceMeters,
  useSetResourceMeterRate,
  useSetResourceMeterAllocation,
  UseGetResourceMeteringStatusKeyFn,
  ResourceMeterAllocation,
  useGetBillingConfiguration,
  useGetResourceBillingConfiguration,
  UseGetResourceBillingConfigurationKeyFn,
  useUpdateResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../../hooks/useAuth';
import { Button, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

export interface ResourceBillingInfoEditorProps {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceBillingInfoEditor(props: Readonly<ResourceBillingInfoEditorProps>) {
  const { resourceId } = props;
  const { isOpen, open, setOpen, close } = useOverlayState();
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: configuration } = useGetBillingConfiguration();
  const { data: resourceBillingConfiguration } = useGetResourceBillingConfiguration({ path: { resourceId } });
  const { mutate: updateConfiguration, isPending: isSaving } = useUpdateResourceBillingConfiguration(undefined, {
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });
      queryClient.invalidateQueries({
        queryKey: UseGetResourceBillingConfigurationKeyFn({ path: { resourceId } }),
      });
      close();
    },
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const [creditsPerUsage, setCreditsPerUsage] = useState(
    dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerUsage ?? 0,
      configuration?.minorUnit ?? 1,
    ),
  );
  const [creditsPerMinute, setCreditsPerMinute] = useState(
    dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerMinute ?? 0,
      configuration?.minorUnit ?? 1,
    ),
  );
  const [creditsPerOperatingMinute, setCreditsPerOperatingMinute] = useState(
    dbCurrencyToUserCurrency(
      (resourceBillingConfiguration?.configuration as { creditsPerOperatingMinute?: number } | undefined)
        ?.creditsPerOperatingMinute ?? 0,
      configuration?.minorUnit ?? 1,
    ),
  );

  const { data: meters = [] } = useListResourceMeters({ path: { resourceId } });
  const { mutateAsync: setMeterRate, isPending: ratesPending } = useSetResourceMeterRate();
  const { mutateAsync: setMeterAllocation, isPending: allocationsPending } = useSetResourceMeterAllocation();
  const [rates, setRates] = useState<Record<number, string>>({});
  const [allocations, setAllocations] = useState<Record<number, ResourceMeterAllocation>>({});
  useEffect(() => {
    if (!isOpen) {
      setRates((current) => (Object.keys(current).length ? {} : current));
      setAllocations((current) => (Object.keys(current).length ? {} : current));
      return;
    }
    if (!configuration) return;
    setRates((current) => {
      const added = meters.filter((meter) => current[meter.id] === undefined);
      if (!added.length) return current;
      return {
        ...current,
        ...Object.fromEntries(
          added.map((meter) => [
            meter.id,
            formatCredits(meter.creditsPerUnit, configuration.minorUnit, { useGrouping: false }),
          ]),
        ),
      };
    });
  }, [isOpen, meters, configuration]);

  useEffect(() => {
    if (!configuration) {
      return;
    }

    setCreditsPerUsage(
      dbCurrencyToUserCurrency(
        resourceBillingConfiguration?.configuration.creditsPerUsage ?? 0,
        configuration.minorUnit,
      ),
    );
    setCreditsPerMinute(
      dbCurrencyToUserCurrency(
        resourceBillingConfiguration?.configuration.creditsPerMinute ?? 0,
        configuration.minorUnit,
      ),
    );
    setCreditsPerOperatingMinute(
      dbCurrencyToUserCurrency(
        (resourceBillingConfiguration?.configuration as { creditsPerOperatingMinute?: number } | undefined)
          ?.creditsPerOperatingMinute ?? 0,
        configuration.minorUnit,
      ),
    );
  }, [resourceBillingConfiguration, configuration]);

  const onSubmit = useCallback(async () => {
    if (!configuration) {
      return;
    }

    let parsedRates: { meterId: number; creditsPerUnit: number }[];
    try {
      parsedRates = meters.map((meter) => ({
        meterId: meter.id,
        creditsPerUnit: parseCredits(
          rates[meter.id] ?? formatCredits(meter.creditsPerUnit, configuration.minorUnit, { useGrouping: false }),
          configuration.minorUnit,
        ),
      }));
    } catch {
      // Invalid prices are shown by the fields; validate every meter before saving any.
      return;
    }
    try {
      for (const rate of parsedRates)
        await setMeterRate({
          path: { resourceId: resourceId, meterId: rate.meterId },
          body: { creditsPerUnit: rate.creditsPerUnit },
        });
      for (const meter of meters) {
        const allocation = allocations[meter.id];
        if (allocation && allocation !== meter.allocation)
          await setMeterAllocation({ path: { resourceId: resourceId, meterId: meter.id }, body: { allocation } });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: UseListResourceMetersKeyFn({ path: { resourceId: resourceId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: UseGetResourceMeteringStatusKeyFn({ path: { resourceId: resourceId } }),
        }),
      ]);
    } catch (error) {
      toast.apiError({ error: error as Error, t, tExists, baseTranslationKey: 'api' });
      return;
    }
    updateConfiguration({
      path: { resourceId: resourceId },
      body: {
        creditsPerUsage: userCurrencyToDbCurrency(creditsPerUsage, configuration.minorUnit),
        creditsPerMinute: userCurrencyToDbCurrency(creditsPerMinute, configuration.minorUnit),
        creditsPerOperatingMinute: userCurrencyToDbCurrency(creditsPerOperatingMinute, configuration.minorUnit),
      },
    });
  }, [
    updateConfiguration,
    resourceId,
    creditsPerUsage,
    creditsPerMinute,
    creditsPerOperatingMinute,
    meters,
    rates,
    setMeterRate,
    setMeterAllocation,
    allocations,
    queryClient,
    toast,
    t,
    tExists,
    configuration,
  ]);

  const { hasPermission } = useAuth();

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
              const allocation = allocations[meter.id] ?? meter.allocation ?? ResourceMeterAllocation.SHARED;
              return (
                <div key={meter.id} className="flex flex-col gap-3">
                  <TextField
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
                  <RadioGroup
                    value={allocation}
                    onChange={(next) =>
                      setAllocations((previous) => ({ ...previous, [meter.id]: next as ResourceMeterAllocation }))
                    }
                    data-cy={`meter-allocation-${meter.id}`}
                  >
                    <Label>
                      {meter.name} — {t('inputs.meterAllocation.label')}
                    </Label>
                    {Object.values(ResourceMeterAllocation).map((option) => (
                      <Radio key={option} value={option} data-cy={`meter-allocation-${meter.id}-${option}`}>
                        <Radio.Content>
                          <Radio.Control>
                            <Radio.Indicator />
                          </Radio.Control>
                          <Label>{t(`inputs.meterAllocation.options.${option}`)}</Label>
                        </Radio.Content>
                        <Description>{t(`inputs.meterAllocation.description.${option}`)}</Description>
                      </Radio>
                    ))}
                  </RadioGroup>
                </div>
              );
            })}
            <MeterNameEditor resourceId={resourceId} />
            <MeterSetupNotice resourceId={resourceId} />
            <input hidden type="submit" />
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="primary" onPress={onSubmit} isPending={isSaving || ratesPending || allocationsPending}>
            {t('actions.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
