import { useOverlayState } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ApiError, useUsersServiceFindManyKey, useUsersServiceInviteUser } from '@attraccess/react-query-client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { USERNAME_RULES, useUsernameValidation } from '../../../components/UsernameInput';
import type { Props } from './index';

export function useInviteUserModalState(props: Props) {
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
  return {
    children,
    isOpen,
    open,
    close,
    t,
    tExists,
    toast,
    username,
    setUsername,
    email,
    setEmail,
    formRef,
    usernameValidationMessages,
    canSubmit,
    isPending,
    onSubmit,
    tab,
    setTab,
  } as const;
}
