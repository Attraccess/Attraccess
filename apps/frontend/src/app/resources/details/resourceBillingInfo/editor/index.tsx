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
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  useDisclosure,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';

interface Props {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceBillingInfoEditor(props: Props) {
  const { resourceId } = props;

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const { t, tExists } = useTranslations({ en, de });
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
      onClose();
    },
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'error.toast',
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
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} noMargin />
          </ModalHeader>
          <ModalBody>
            <Form onSubmit={onSubmit}>
              <NumberInput
                label={t('inputs.creditsPerUsage.label', { currency: configuration.currency })}
                description={t('inputs.creditsPerUsage.description')}
                value={creditsPerUsage}
                minValue={0}
                onValueChange={(value) => setCreditsPerUsage(value)}
                isClearable
                defaultValue={0}
              />
              <NumberInput
                label={t('inputs.creditsPerMinute.label', { currency: configuration.currency })}
                description={t('inputs.creditsPerMinute.description')}
                value={creditsPerMinute}
                minValue={0}
                onValueChange={(value) => setCreditsPerMinute(value)}
                isClearable
                defaultValue={0}
              />
              <input hidden type="submit" />
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button onPress={onSubmit} color="primary" isLoading={isSaving}>
              {t('actions.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
