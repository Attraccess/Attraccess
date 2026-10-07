import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { useLogin } from '../../hooks/useAuth';
import { ApiError, useUsersServiceResendVerificationEmail } from '@attraccess/react-query-client';
import { getTranslationKeyForApiError } from '../../utils/apiError';
import { LoginFormProps } from './loginForm.login-form-props';

export function useLoginFormContentState(props: LoginFormProps & { t: TFunction; tExists: TExists }) {
  const { onForgotPassword, t, tExists } = props;

  const { mutate: login, isPending, error } = useLogin();
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<{ title: string; description: string } | null>(null);

  const isEmailNotVerified = useMemo(() => {
    if (!error) return false;
    const apiError = error as ApiError;
    const body = apiError?.body as Record<string, unknown> | undefined;
    return body?.message === 'UserEmailNotVerifiedException';
  }, [error]);

  useEffect(() => {
    setResendSuccess(false);
    setResendError(null);
    setResendEmail('');
  }, [error]);

  const resendVerification = useUsersServiceResendVerificationEmail({
    onSuccess: () => {
      setResendError(null);
      setResendSuccess(true);
    },
    onError: (mutationError) => {
      setResendSuccess(false);
      const { key } = getTranslationKeyForApiError({
        error: mutationError as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
      setResendError({
        title: t(key + '.title', { error: mutationError }),
        description: t(key + '.description', { error: mutationError }),
      });
    },
  });

  const { errorTitle, errorDescription } = useMemo(() => {
    if (!error) {
      return {
        errorTitle: null,
        errorDescription: null,
      };
    }

    const { key } = getTranslationKeyForApiError({
      error: error as ApiError,
      t,
      tExists,
      baseTranslationKey: 'api',
      fallbackKey: 'generic',
    });

    return {
      errorTitle: t(key + '.title', { error }),
      errorDescription: t(key + '.description', {
        error,
      }),
    };
  }, [error, t, tExists]);

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget as HTMLFormElement);
      const username = formData.get('username');
      const password = formData.get('password');

      if (typeof username !== 'string' || typeof password !== 'string') {
        return;
      }

      setResendSuccess(false);
      setResendError(null);

      login({
        username,
        password,
        twoFactorCode: twoFactorCode.trim() || undefined,
        tokenLocation: 'cookie',
      });
    },
    [login, twoFactorCode],
  );

  const arrowRight = <ArrowRight className="group-hover:translate-x-1 transition-transform" />;
  return {
    onForgotPassword,
    t,
    isPending,
    twoFactorCode,
    setTwoFactorCode,
    resendEmail,
    setResendEmail,
    resendSuccess,
    resendError,
    setResendError,
    isEmailNotVerified,
    resendVerification,
    errorTitle,
    errorDescription,
    handleSubmit,
    arrowRight,
  } as const;
}
