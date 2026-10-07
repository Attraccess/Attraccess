import { UseResourceMeteringServiceListResourceMetersKeyFn } from '@attraccess/react-query-client';
import { useCallback, useEffect } from 'react';
import { useAuth } from '../../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency, formatCredits, parseCredits } from '@attraccess/shared';
import { useResourceBillingInfoEditorStateInputs } from './useResourceBillingInfoEditorStateInputs';

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
