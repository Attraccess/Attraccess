import { useCallback, useMemo, useState } from 'react';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Button, Card, Form } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordField } from '../../components/PasswordField';
import en from './en.json';
import de from './de.json';
import { useUsersServiceChangePasswordViaResetToken } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { PolicyError } from '@attraccess/shared';
import { extractPolicyErrors } from '../../utils/policyErrors';

export function ResetPassword() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverErrors, setServerErrors] = useState<PolicyError[]>([]);

  const token = useMemo(() => query.get('token'), [query]);
  const userId = useMemo(() => query.get('userId'), [query]);

  const toast = useToastMessage();

  const {
    mutate: changeMutation,
    isPending,
    isSuccess,
  } = useUsersServiceChangePasswordViaResetToken({
    onError: (error) => {
      const policyErrors = extractPolicyErrors(error);
      if (policyErrors) {
        setServerErrors(policyErrors);
        return;
      }
      setServerErrors([]);
      toast.error({
        title: t('error.title'),
        description: t('error.message'),
      });
    },
  });

  const onMainButtonPress = useCallback(() => {
    if (password !== confirmPassword) {
      toast.error({
        title: t('error.passwordsDoNotMatch.title'),
        description: t('error.passwordsDoNotMatch.description'),
      });
      return;
    }

    setServerErrors([]);
    changeMutation({ userId: parseInt(userId as string), requestBody: { token: token as string, password } });
  }, [password, confirmPassword, userId, token, t, changeMutation, toast]);

  if (isPending) {
    return <Loading />;
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="reset-password-success-card">
          <Card.Header className="text-center">{t('success.title')}</Card.Header>
          <Card.Content>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{t('success.message')}</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="primary"
              className="w-full"
              onPress={() => navigate('/')}
              data-cy="reset-password-success-go-to-login-button"
            >
              {t('success.goToLogin')}
            </Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onMainButtonPress();
        }}
        className="max-w-md w-full gap-4"
        data-cy="reset-password-form"
      >
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>
        <PasswordField
          value={password}
          onValueChange={(v) => {
            setPassword(v);
            setServerErrors([]);
          }}
          serverErrors={serverErrors}
          passwordLabel={t('inputs.password')}
          confirmationLabel={t('inputs.confirmPassword')}
          showConfirmation
          confirmationValue={confirmPassword}
          onConfirmationChange={setConfirmPassword}
          isRequired
          autoComplete="new-password"
          dataCyPrefix="reset-password"
        />
        <Button variant="primary" className="w-full mt-2" type="submit" data-cy="reset-password-submit-button">
          {t('submit')}
        </Button>
      </Form>
    </div>
  );
}
