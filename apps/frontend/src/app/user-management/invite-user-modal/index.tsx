import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  TextField,
  Label,
  Input,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ApiError, useUsersServiceFindManyKey, useUsersServiceInviteUser } from '@attraccess/react-query-client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { CsvInvite } from './csv-invite';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../../components/UsernameInput';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function InviteUserModal(props: Props) {
  const { children } = props;
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

  const { mutate: inviteUser, isPending } = useUsersServiceInviteUser({
    onSuccess: () => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
      });
      resetSingleInviteForm();
      close();
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
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
      requestBody: {
        username: trimmedUsername,
        email: trimmedEmail,
      },
    });
  }, [inviteUser, trimmedEmail, trimmedUsername, usernameError]);

  const [tab, setTab] = useState<'single' | 'csv'>('single');

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
              <Form
                ref={formRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
                className="flex flex-col gap-4"
              >
                <UsernameInput
                  label={t('inputs.username.label')}
                  name="username"
                  isRequired
                  value={username}
                  onChange={setUsername}
                  validationMessages={usernameValidationMessages}
                  description={t('inputs.username.description', {
                    min: USERNAME_RULES.minLength,
                    max: USERNAME_RULES.maxLength,
                  })}
                />
                <TextField isRequired value={email} onChange={setEmail}>
                  <Label>{t('inputs.email.label')}</Label>
                  <Input name="email" type="email" required />
                </TextField>
              </Form>
            </TabPanel>
            <TabPanel id="csv">
              <CsvInvite
                onSuccess={close}
                onError={(error) =>
                  toast.apiError({
                    error: error as ApiError,
                    t,
                    tExists,
                    baseTranslationKey: 'api',
                  })
                }
              />
            </TabPanel>
          </Tabs>
        </DrawerBody>
        {tab === 'single' && (
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              onPress={onSubmit}
              isPending={isPending}
              isDisabled={!canSubmit}
            >
              {t('actions.invite')}
            </Button>
          </DrawerFooter>
        )}
      </StandardDrawer>
    </>
  );
}
