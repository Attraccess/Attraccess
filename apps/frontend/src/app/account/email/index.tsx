import {
  ApiError,
  useUsersServiceChangeMyEmail,
  useUsersServiceGetCurrent,
  useUsersServiceGetCurrentKey,
} from '@attraccess/react-query-client';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
import { StandardModal } from '../../../components/standardModal';

export function EmailForm() {
  const { t } = useTranslations({ en, de });

  const { data: me, isLoading: isLoadingMe } = useUsersServiceGetCurrent();
  const [email, setEmail] = useState('');
  const { isOpen, open, close } = useOverlayState();
  const queryClient = useQueryClient();
  const trimmedEmail = email.trim();
  const isEmailValid = trimmedEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const { success: showSuccess, error: showError } = useToastMessage();

  const { mutate, isPending } = useUsersServiceChangeMyEmail({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetCurrentKey],
      });
      showSuccess({ title: t('messages.updated') });
    },
    onError: (rawError) => {
      let messageToDisplay = t('errors.updateFailed');
      if (rawError instanceof ApiError) {
        const body = rawError.body as { message?: string | string[] } | undefined;
        const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          messageToDisplay = msg;
        }
      } else if (rawError instanceof Error && rawError.message) {
        messageToDisplay = rawError.message;
      }
      showError({ title: messageToDisplay });
    },
  });

  const onSubmit = useCallback(() => {
    if (!isEmailValid) {
      return;
    }
    open();
  }, [isEmailValid, open]);

  const confirmEmailChange = useCallback(() => {
    mutate({
      requestBody: { email: trimmedEmail },
    });
    close();
  }, [close, mutate, trimmedEmail]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <TextField value={me?.email ?? ''} isDisabled={isLoadingMe} isReadOnly>
          <Label>{t('email.currentLabel')}</Label>
          <Input type="email" />
        </TextField>
        <TextField value={email} onChange={setEmail}>
          <Label>{t('email.newLabel')}</Label>
          <Input type="email" />
        </TextField>
        <Button variant="primary" isPending={isPending} onPress={onSubmit} isDisabled={!isEmailValid || isPending}>
          {t('actions.save')}
        </Button>
      </div>
      <StandardModal
        isOpen={isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) close();
        }}
        size="md"
      >
        {({ close: modalClose }) => (
          <>
            <ModalHeader>{t('modal.title')}</ModalHeader>
            <ModalBody>
              <Alert status="warning">
                <AlertStatusIcon status="warning" />
                <AlertContent>
                  <AlertDescription>{t('modal.warning')}</AlertDescription>
                </AlertContent>
              </Alert>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={modalClose}>
                {t('actions.cancel')}
              </Button>
              <Button variant="primary" onPress={confirmEmailChange} isPending={isPending}>
                {t('actions.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </>
  );
}
