import { useCallback, useMemo, useRef, useState } from 'react';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription, AlertTitle, Button, Form } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ApiError, useUsersServiceAcceptInvitation } from '@attraccess/react-query-client';
import { PageHeader } from '../../components/pageHeader';
import { PasswordInput } from '../../components/PasswordInput';
import { useLogin } from '../../hooks/useAuth';
import { useToastMessage } from '../../components/toastProvider';

export function AcceptInvitation() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const { t, tExists } = useTranslations({ en, de });
  const toast = useToastMessage();

  const token = useMemo(() => query.get('token'), [query]);
  const email = useMemo(() => query.get('email'), [query]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: login } = useLogin();

  const { mutate: acceptInvitation, isPending } = useUsersServiceAcceptInvitation({
    onSuccess: (user) => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      login({
        username: user.username,
        password,
        tokenLocation: 'cookie',
      });
      navigate('/');
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

    if (!token || !email) {
      return;
    }

    if (!formRef.current.checkValidity()) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    acceptInvitation({ requestBody: { token, email, password } });
  }, [password, confirmPassword, token, email, acceptInvitation]);

  if (!token || !email) {
    return (
      <Alert status="danger"
      >
        <AlertContent>
          <AlertTitle>{t('error.noTokenOrEmail.title')}</AlertTitle>
          <AlertDescription>{t('error.noTokenOrEmail.description')}</AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  return (
    <div>
      <PageHeader title={t('title')} />

      <Form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <PasswordInput
          autoComplete="new-password"
          label={t('inputs.password.label')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          isRequired
        />

        <PasswordInput
          autoComplete="new-password"
          label={t('inputs.confirmPassword.label')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          isRequired
          validate={() => {
            if (password !== confirmPassword) {
              return t('error.passwordsDoNotMatch.description');
            }
            return true;
          }}
        />

        <Button variant="primary" isPending={isPending} type="submit">
          {t('actions.acceptInvitation')}
        </Button>
      </Form>
    </div>
  );
}
