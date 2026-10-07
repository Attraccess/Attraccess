import { Button, Form } from '@heroui/react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import { type AuthState } from './api';
import { TextFieldRow } from './drawer';
import { useShellyTranslations } from './i18n';

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
  const [visible, setVisible] = useState(false);

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
        <div className="sh:relative">
          <TextFieldRow
            label={t('password.title')}
            value={currentPassword}
            onChange={onChange}
            placeholder={t('info.passwordPlaceholder')}
            dataCy="shelly-info-current-password"
          />
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={t(visible ? 'password.hide' : 'password.show')}
            className="sh:absolute sh:right-1 sh:top-6"
            onPress={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon className="sh:h-4 sh:w-4" /> : <EyeIcon className="sh:h-4 sh:w-4" />}
          </Button>
        </div>
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
