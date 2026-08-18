import { DrawerBody, DrawerFooter, DrawerHeader, Form, TextField, Label, Input, useOverlayState } from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ApiError, useGuestsServiceCreateGuest, useGuestsServiceFindManyGuestsKey } from '@attraccess/react-query-client';
import { useCallback, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function CreateGuestModal(props: Props) {
  const { children } = props;
  const { isOpen, open, close } = useOverlayState();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: createGuest, isPending } = useGuestsServiceCreateGuest({
    onSuccess: (data) => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({ queryKey: [useGuestsServiceFindManyGuestsKey] });
      close();
      navigate(`/guests/${data.guest.id}`);
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const onSubmit = useCallback(() => {
    if (!formRef.current) {
      return;
    }
    if (!formRef.current.checkValidity()) {
      return;
    }

    createGuest({
      requestBody: {
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      },
    });
  }, [createGuest, email, name]);

  return (
    <>
      {children(open)}
      <StandardDrawer
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <p className="text-sm text-default-500 mb-4">{t('description')}</p>
          <Form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <TextField isRequired value={name} onChange={setName}>
              <Label>{t('inputs.name.label')}</Label>
              <Input name="name" required placeholder={t('inputs.name.placeholder')} data-cy="create-guest-name-input" />
            </TextField>
            <TextField value={email} onChange={setEmail}>
              <Label>{t('inputs.email.label')}</Label>
              <Input name="email" type="email" placeholder={t('inputs.email.placeholder')} data-cy="create-guest-email-input" />
            </TextField>
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onPress={close}>
            {t('actions.cancel')}
          </Button>
          <Button variant="primary" onPress={onSubmit} isPending={isPending} isDisabled={!name.trim()}>
            {t('actions.create')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
