import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { PasswordInput } from '../../../../../components/PasswordInput';
import { useCallback, useRef, useState } from 'react';
import { useBillingServiceGetSumUpReadersKey, useBillingServicePairSumUpReader } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function SumUpReadersPairing(props: Props) {
  const { children } = props;
  const { t, tExists } = useTranslations({ en, de });
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
        baseTranslationKey: 'error.toast',
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
