import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useOverlayState,
} from '@heroui/react';
import { ApiError, useFindManyKey, useInviteUser } from '@attraccess/react-query-client';
import { CsvInvite } from './csv-invite/index';
import { USERNAME_RULES, useUsernameValidation } from '../../../components/UsernameInput/index';
import { SingleInviteForm } from './SingleInviteForm';
import { Button, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

export interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function InviteUserModal({ children }: Readonly<Props>) {
  const { isOpen, open, close } = useOverlayState();
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

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<'single' | 'csv'>('single');

  const usernameValidationMessages = useMemo(
    () => ({
      length: t('inputs.username.validation.length', {
        min: USERNAME_RULES.minLength,
        max: USERNAME_RULES.maxLength,
      }),
      format: t('inputs.username.validation.format'),
    }),
    [t],
  );

  const {
    trimmed: trimmedUsername,
    error: usernameError,
    isValid: isUsernameValid,
  } = useUsernameValidation(username, usernameValidationMessages);
  const trimmedEmail = useMemo(() => email.trim(), [email]);

  const canSubmit = useMemo(() => isUsernameValid && !!trimmedEmail, [isUsernameValid, trimmedEmail]);

  const resetSingleInviteForm = useCallback(() => {
    setUsername('');
    setEmail('');
  }, [setEmail, setUsername]);

  const showApiError = (error: unknown) =>
    toast.apiError({
      error: error as ApiError,
      t,
      tExists,
      baseTranslationKey: 'api',
    });

  const { mutate: inviteUser, isPending } = useInviteUser(undefined, {
    onSuccess: () => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: [useFindManyKey],
      });
      resetSingleInviteForm();
      close();
    },
    onError: showApiError,
  });

  const onSubmit = useCallback(() => {
    if (!formRef.current) {
      return;
    }

    if (usernameError) {
      return;
    }

    if (!formRef.current.checkValidity()) {
      return;
    }

    inviteUser({
      body: {
        username: trimmedUsername,
        email: trimmedEmail,
      },
    });
  }, [inviteUser, trimmedEmail, trimmedUsername, usernameError]);

  return (
    <>
      {children(open)}
      <StandardDrawer
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        dialogProps={{ 'aria-label': t('title') }}
      >
        <DrawerHeader>
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
        </DrawerHeader>
        <DrawerBody>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as 'single' | 'csv')}>
            <Tabs.ListContainer>
              <TabList>
                <Tab id="single">
                  <Tabs.Indicator />
                  {t('tabs.single')}
                </Tab>
                <Tab id="csv">
                  <Tabs.Indicator />
                  {t('tabs.csv')}
                </Tab>
              </TabList>
            </Tabs.ListContainer>
            <TabPanel id="single">
              <SingleInviteForm
                formRef={formRef}
                username={username}
                onUsernameChange={setUsername}
                email={email}
                onEmailChange={setEmail}
                usernameValidationMessages={usernameValidationMessages}
                onSubmit={onSubmit}
              />
            </TabPanel>
            <TabPanel id="csv">
              <CsvInvite onSuccess={close} onError={showApiError} />
            </TabPanel>
          </Tabs>
        </DrawerBody>
        {tab === 'single' && (
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('actions.cancel')}
            </Button>
            <Button variant="primary" onPress={onSubmit} isPending={isPending} isDisabled={!canSubmit}>
              {t('actions.invite')}
            </Button>
          </DrawerFooter>
        )}
      </StandardDrawer>
    </>
  );
}
