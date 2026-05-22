import { useCallback, useMemo, useState } from 'react';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Button, Card, Form } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import en from './en.json';
import de from './de.json';
import { useUsersServiceChangePasswordViaResetToken } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';

export function ResetPassword() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const token = useMemo(() => query.get('token'), [query]);
  const userId = useMemo(() => query.get('userId'), [query]);

  const toast = useToastMessage();

  const {
    mutate: changeMutation,
    isPending,
    isSuccess,
  } = useUsersServiceChangePasswordViaResetToken({
    onError: (error) => {
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
        <PasswordInput
          label={t('inputs.password')}
          value={password}
          onChange={setPassword}
          minLength={8}
          required
          data-cy="reset-password-password-input"
          autoComplete="new-password"
        />
        <PasswordInput
          label={t('inputs.confirmPassword')}
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          validate={() => {
            if (password !== confirmPassword) {
              return t('error.passwordsDoNotMatch.description');
            }
            return true;
          }}
          data-cy="reset-password-confirm-password-input"
          autoComplete="new-password"
        />
        <Button variant="primary" className="w-full mt-2" type="submit" data-cy="reset-password-submit-button">
          {t('submit')}
        </Button>
      </Form>
    </div>
  );
}
