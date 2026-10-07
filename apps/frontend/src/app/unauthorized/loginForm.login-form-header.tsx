import { Button } from '../../components/button';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import type { LoginFormProps } from './loginForm.login-form-props';

export function LoginFormHeader(props: LoginFormProps & { isLocalSignupEnabled: boolean; t: TFunction }) {
  const { onNeedsAccount, isLocalSignupEnabled, t } = props;

  return (
    <div>
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      {isLocalSignupEnabled && onNeedsAccount && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 dark:text-gray-300">
          <span>{t('noAccount')}</span>
          <Button variant="secondary" onPress={onNeedsAccount} data-cy="login-form-sign-up-button">
            {t('signUpButton')}
          </Button>
        </p>
      )}
    </div>
  );
}
