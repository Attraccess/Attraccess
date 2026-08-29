import {
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  UseBillingServiceGetResourceBillingConfigurationKeyFn,
  useBillingServiceUpdateResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { StandardDrawer } from '../../../../../components/standardDrawer';
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

interface Props {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceBillingInfoEditor(props: Props) {
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

    updateConfiguration({
      resourceId,
      requestBody: {
        creditsPerUsage: userCurrencyToDbCurrency(creditsPerUsage, configuration.minorUnit),
        creditsPerMinute: userCurrencyToDbCurrency(creditsPerMinute, configuration.minorUnit),
        creditsPerOperatingMinute: userCurrencyToDbCurrency(creditsPerOperatingMinute, configuration.minorUnit),
      } as never,
    });
  }, [updateConfiguration, resourceId, creditsPerUsage, creditsPerMinute, creditsPerOperatingMinute, configuration]);

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
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
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
            <input hidden type="submit" />
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="primary" onPress={onSubmit} isPending={isSaving}>
            {t('actions.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
