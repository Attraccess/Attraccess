import {
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  UseBillingServiceGetResourceBillingConfigurationKeyFn,
  useBillingServiceUpdateResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import {
  Button,
  Form,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  useOverlayState,
} from '@heroui/react';
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
      },
    });
  }, [updateConfiguration, resourceId, creditsPerUsage, creditsPerMinute, configuration]);

  const { user } = useAuth();
  if (!user?.systemPermissions.canManageBilling) {
    return null;
  }

  if (!configuration) {
    return null;
  }

  return (
    <>
      {props.children(open)}
      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog>
              {() => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('title')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>
                    <Form onSubmit={onSubmit} className="flex flex-col gap-4">
                      <NumberField
                        aria-label={t('inputs.creditsPerUsage.label', { currency: configuration.currency })}
                        value={creditsPerUsage}
                        minValue={0}
                        onChange={(value) => setCreditsPerUsage(value)}
                        defaultValue={0}
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                          <NumberFieldInput />
                          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                        </NumberFieldGroup>
                      </NumberField>
                      <NumberField
                        aria-label={t('inputs.creditsPerMinute.label', { currency: configuration.currency })}
                        value={creditsPerMinute}
                        minValue={0}
                        onChange={(value) => setCreditsPerMinute(value)}
                        defaultValue={0}
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                          <NumberFieldInput />
                          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                        </NumberFieldGroup>
                      </NumberField>
                      <input hidden type="submit" />
                    </Form>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="primary" onPress={onSubmit} isPending={isSaving}>
                      {t('actions.save')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
