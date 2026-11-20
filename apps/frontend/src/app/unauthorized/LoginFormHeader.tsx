import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './loginForm.en.json';
import de from './loginForm.de.json';

interface LoginFormHeaderProps {
  onNeedsAccount: (() => void) | null;
  isLocalSignupEnabled: boolean;
}

export function LoginFormHeader(props: Readonly<LoginFormHeaderProps>) {
  const { onNeedsAccount, isLocalSignupEnabled } = props;
  const { t } = useTranslations({ en, de });

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
