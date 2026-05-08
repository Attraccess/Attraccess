import en from './en.json';
import { Modal, ModalContent, useDisclosure } from '../../../../../../utils/heroui-compat';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Form, Input, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { PasswordInput } from '../../../../../../components/PasswordInput';
import { useCallback, useRef, useState } from 'react';
import { useBillingServiceGetSumUpReadersKey, useBillingServicePairSumUpReader } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function SumUpReadersPairing(props: Props) {
  const { children } = props;
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

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const { mutate: pairReader, isPending: isPairingReader } = useBillingServicePairSumUpReader({
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });
      queryClient.invalidateQueries({ queryKey: [useBillingServiceGetSumUpReadersKey] });
      onClose();
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

  const [pairingCode, setPairingCode] = useState('');
  const [name, setName] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) {
      return;
    }

    pairReader({
      requestBody: {
        pairingCode,
        name,
      },
    });
  }, [pairingCode, name, pairReader]);

  return (
    <>
      {children(onOpen)}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin onBack={onClose} />
          </ModalHeader>
          <ModalBody>
            <Form onSubmit={onSubmit} ref={formRef}>
              <PasswordInput
                label={t('inputs.pairingCode')}
                value={pairingCode}
                onValueChange={setPairingCode}
                autoComplete="off"
                isRequired
                minLength={8}
                maxLength={9}
              />

              <Input label={t('inputs.name')} value={name} onValueChange={setName} autoComplete="off" isRequired />

              <input type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button color="primary" onPress={onSubmit} isLoading={isPairingReader}>
              {t('actions.pair')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
