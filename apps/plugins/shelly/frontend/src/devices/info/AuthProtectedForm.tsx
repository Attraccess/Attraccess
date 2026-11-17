import { Button, PasswordInput } from '@attraccess/plugins-frontend-ui';
import { Form } from '@heroui/react';
import type { AuthState } from '../../api';
import { useShellyTranslations } from '../../i18n';

export function AuthProtectedForm({
  authState,
  currentPassword,
  onChange,
  loading,
  onLoad,
}: {
  authState: AuthState;
  currentPassword: string;
  onChange: (v: string) => void;
  loading: boolean;
  onLoad: () => void;
}) {
  const { t } = useShellyTranslations();

  if (authState !== 'required') return null;

  return (
    <div className="sh:rounded-md sh:border-l-4 sh:border-l-warning sh:bg-warning/5 sh:p-4">
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onLoad();
        }}
        className="sh:flex sh:flex-col sh:gap-3"
      >
        <p className="sh:text-sm">{t('info.auth')}</p>
        <PasswordInput
          label={t('password.title')}
          value={currentPassword}
          onChange={onChange}
          placeholder={t('info.passwordPlaceholder')}
          autoComplete="current-password"
          data-cy="shelly-info-current-password"
        />
        <div className="sh:flex sh:justify-end">
          <Button variant="primary" size="sm" isPending={loading} onPress={onLoad} data-cy="shelly-info-unlock">
            {t('info.load')}
          </Button>
        </div>
        <input type="submit" hidden />
      </Form>
    </div>
  );
}
