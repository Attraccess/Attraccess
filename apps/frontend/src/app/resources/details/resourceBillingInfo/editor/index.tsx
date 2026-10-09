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
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../components/button/index';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { MeterNameEditor } from '../../meters/MeterNameEditor';
import { MeterSetupNotice } from '../metering/MeterNotices';
import { formatCredits, parseCredits, dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import {
  UseResourceMeteringServiceListResourceMetersKeyFn,
  useResourceMeteringServiceListResourceMeters,
  useResourceMeteringServiceSetResourceMeterRate,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  UseBillingServiceGetResourceBillingConfigurationKeyFn,
  useBillingServiceUpdateResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

export interface Props {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function useResourceBillingInfoEditorStateInputs(props: Props) {
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

  const { data: configuration } = useBillingServiceGetBillingConfiguration();
  const { data: resourceBillingConfiguration } = useBillingServiceGetResourceBillingConfiguration({ resourceId });
  const { mutate: updateConfiguration, isPending: isSaving } = useBillingServiceUpdateResourceBillingConfiguration({
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });
      queryClient.invalidateQueries({
        queryKey: UseBillingServiceGetResourceBillingConfigurationKeyFn({ resourceId }),
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

  const { data: meters = [] } = useResourceMeteringServiceListResourceMeters({ resourceId });
  const { mutateAsync: setMeterRate, isPending: ratesPending } = useResourceMeteringServiceSetResourceMeterRate();
  const [rates, setRates] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!isOpen) {
      setRates((current) => (Object.keys(current).length ? {} : current));
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
  return {
    resourceId,
    isOpen,
    open,
    setOpen,
    close,
    t,
    tExists,
    toast,
    queryClient,
    configuration,
    resourceBillingConfiguration,
    updateConfiguration,
    isSaving,
    creditsPerUsage,
    setCreditsPerUsage,
    creditsPerMinute,
    setCreditsPerMinute,
    creditsPerOperatingMinute,
    setCreditsPerOperatingMinute,
    meters,
    setMeterRate,
    ratesPending,
    rates,
    setRates,
    props,
  } as const;
}

export function useResourceBillingInfoEditorStateOutput(
  model: ReturnType<typeof useResourceBillingInfoEditorStateInputs>,
) {
  useEffect(() => {
    if (!model.configuration) {
      return;
    }

    model.setCreditsPerUsage(
      dbCurrencyToUserCurrency(
        model.resourceBillingConfiguration?.configuration.creditsPerUsage ?? 0,
        model.configuration.minorUnit,
      ),
    );
    model.setCreditsPerMinute(
      dbCurrencyToUserCurrency(
        model.resourceBillingConfiguration?.configuration.creditsPerMinute ?? 0,
        model.configuration.minorUnit,
      ),
    );
    model.setCreditsPerOperatingMinute(
      dbCurrencyToUserCurrency(
        (model.resourceBillingConfiguration?.configuration as { creditsPerOperatingMinute?: number } | undefined)
          ?.creditsPerOperatingMinute ?? 0,
        model.configuration.minorUnit,
      ),
    );
  }, [model.resourceBillingConfiguration, model.configuration]);

  const onSubmit = useCallback(async () => {
    if (!model.configuration) {
      return;
    }

    let parsedRates: { meterId: number; creditsPerUnit: number }[];
    try {
      parsedRates = model.meters.map((meter) => ({
        meterId: meter.id,
        creditsPerUnit: parseCredits(
          model.rates[meter.id] ??
            formatCredits(meter.creditsPerUnit, model.configuration.minorUnit, { useGrouping: false }),
          model.configuration.minorUnit,
        ),
      }));
    } catch {
      // Invalid prices are shown by the fields; validate every meter before saving any.
      return;
    }
    try {
      for (const rate of parsedRates)
        await model.setMeterRate({
          resourceId: model.resourceId,
          meterId: rate.meterId,
          requestBody: { creditsPerUnit: rate.creditsPerUnit },
        });
      await model.queryClient.invalidateQueries({
        queryKey: UseResourceMeteringServiceListResourceMetersKeyFn({ resourceId: model.resourceId }),
      });
    } catch (error) {
      model.toast.apiError({ error: error as Error, t: model.t, tExists: model.tExists, baseTranslationKey: 'api' });
      return;
    }
    model.updateConfiguration({
      resourceId: model.resourceId,
      requestBody: {
        creditsPerUsage: userCurrencyToDbCurrency(model.creditsPerUsage, model.configuration.minorUnit),
        creditsPerMinute: userCurrencyToDbCurrency(model.creditsPerMinute, model.configuration.minorUnit),
        creditsPerOperatingMinute: userCurrencyToDbCurrency(
          model.creditsPerOperatingMinute,
          model.configuration.minorUnit,
        ),
      },
    });
  }, [
    model.updateConfiguration,
    model.resourceId,
    model.creditsPerUsage,
    model.creditsPerMinute,
    model.creditsPerOperatingMinute,
    model.meters,
    model.rates,
    model.setMeterRate,
    model.queryClient,
    model.toast,
    model.t,
    model.tExists,
    model.configuration,
  ]);

  const { hasPermission } = useAuth();
  return {
    resourceId: model.resourceId,
    isOpen: model.isOpen,
    open: model.open,
    setOpen: model.setOpen,
    t: model.t,
    configuration: model.configuration,
    isSaving: model.isSaving,
    creditsPerUsage: model.creditsPerUsage,
    setCreditsPerUsage: model.setCreditsPerUsage,
    creditsPerMinute: model.creditsPerMinute,
    setCreditsPerMinute: model.setCreditsPerMinute,
    creditsPerOperatingMinute: model.creditsPerOperatingMinute,
    setCreditsPerOperatingMinute: model.setCreditsPerOperatingMinute,
    meters: model.meters,
    ratesPending: model.ratesPending,
    rates: model.rates,
    setRates: model.setRates,
    onSubmit,
    hasPermission,
    props: model.props,
  };
}

export function useResourceBillingInfoEditorState(props: Props) {
  const useResourceBillingInfoEditorStateInputsModel = useResourceBillingInfoEditorStateInputs(props);
  return useResourceBillingInfoEditorStateOutput(useResourceBillingInfoEditorStateInputsModel);
}

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
