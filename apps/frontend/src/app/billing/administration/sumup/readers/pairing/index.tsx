import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Form,
  TextField,
  Label,
  Input,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  useOverlayState,
} from '@heroui/react';
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

  const { isOpen, open, setOpen, close } = useOverlayState();
  const { mutate: pairReader, isPending: isPairingReader } = useBillingServicePairSumUpReader({
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });
      queryClient.invalidateQueries({ queryKey: [useBillingServiceGetSumUpReadersKey] });
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
      {children(open)}

      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin onBack={close} />
                  </ModalHeader>
                  <ModalBody>
                    <Form onSubmit={onSubmit} ref={formRef}>
                      <PasswordInput
                        label={t('inputs.pairingCode')}
                        value={pairingCode}
                        onChange={setPairingCode}
                        autoComplete="off"
                        isRequired
                        minLength={8}
                        maxLength={9}
                      />

                      <TextField value={name} onChange={setName} isRequired>
                        <Label>{t('inputs.name')}</Label>
                        <Input autoComplete="off" />
                      </TextField>

                      <input type="submit" hidden />
                    </Form>
                  </ModalBody>

                  <ModalFooter>
                    <Button variant="primary" onPress={onSubmit} isPending={isPairingReader}>
                      {t('actions.pair')}
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
