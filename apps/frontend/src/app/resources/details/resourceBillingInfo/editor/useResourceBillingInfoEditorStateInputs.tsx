import {
  useResourceMeteringServiceListResourceMeters,
  useResourceMeteringServiceSetResourceMeterRate,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  UseBillingServiceGetResourceBillingConfigurationKeyFn,
  useBillingServiceUpdateResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import { useOverlayState } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dbCurrencyToUserCurrency, formatCredits } from '@attraccess/shared';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { Props } from './index.props';

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
