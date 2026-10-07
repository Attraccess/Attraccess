import {
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
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import type { Props } from './index';

export function useResourceBillingInfoEditorState(props: Props) {
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

  const [creditsPerKwh, setCreditsPerKwh] = useState(
    dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerKwh ?? 0,
      configuration?.minorUnit ?? 1,
    ),
  );

  useEffect(() => {
    if (!configuration) {
      return;
    }

    setCreditsPerKwh(
      dbCurrencyToUserCurrency(resourceBillingConfiguration?.configuration.creditsPerKwh ?? 0, configuration.minorUnit),
    );

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

    updateConfiguration({
      resourceId,
      requestBody: {
        creditsPerUsage: userCurrencyToDbCurrency(creditsPerUsage, configuration.minorUnit),
        creditsPerMinute: userCurrencyToDbCurrency(creditsPerMinute, configuration.minorUnit),
        creditsPerOperatingMinute: userCurrencyToDbCurrency(creditsPerOperatingMinute, configuration.minorUnit),
        creditsPerKwh: userCurrencyToDbCurrency(creditsPerKwh, configuration.minorUnit),
      },
    });
  }, [
    updateConfiguration,
    resourceId,
    creditsPerUsage,
    creditsPerMinute,
    creditsPerOperatingMinute,
    creditsPerKwh,
    configuration,
  ]);

  const { hasPermission } = useAuth();
  return {
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
    creditsPerKwh,
    setCreditsPerKwh,
    onSubmit,
    hasPermission,
    props,
  } as const;
}
