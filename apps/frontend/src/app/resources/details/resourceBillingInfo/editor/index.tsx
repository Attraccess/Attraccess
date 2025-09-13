import {
  useBillingServiceGetBillingConfiguration,
  UseBillingServiceGetBillingConfigurationKeyFn,
  useBillingServiceUpdateBillingConfiguration,
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

  const { data: configuration } = useBillingServiceGetBillingConfiguration({ resourceId });
  const { mutate: updateConfiguration, isPending: isSaving } = useBillingServiceUpdateBillingConfiguration({
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });
      queryClient.invalidateQueries({
        queryKey: UseBillingServiceGetBillingConfigurationKeyFn({ resourceId }),
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

  const [creditsPerUsage, setCreditsPerUsage] = useState(configuration?.creditsPerUsage ?? 0);
  const [creditsPerMinute, setCreditsPerMinute] = useState(configuration?.creditsPerMinute ?? 0);

  useEffect(() => {
    setCreditsPerUsage(configuration?.creditsPerUsage ?? 0);
    setCreditsPerMinute(configuration?.creditsPerMinute ?? 0);
  }, [configuration]);

  const onSubmit = useCallback(async () => {
    updateConfiguration({
      resourceId,
      requestBody: {
        creditsPerUsage,
        creditsPerMinute,
      },
    });
  }, [updateConfiguration, resourceId, creditsPerUsage, creditsPerMinute]);

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
                label={t('inputs.creditsPerUsage.label')}
                description={t('inputs.creditsPerUsage.description')}
                value={creditsPerUsage}
                minValue={0}
                step={1}
                onValueChange={(value) => setCreditsPerUsage(value)}
                isClearable
                defaultValue={0}
              />
              <NumberInput
                label={t('inputs.creditsPerMinute.label')}
                description={t('inputs.creditsPerMinute.description')}
                value={creditsPerMinute}
                minValue={0}
                step={1}
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
