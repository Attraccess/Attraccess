import { MailIcon, PencilIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Link } from '@heroui/react';
import en from './en.json';
import de from './de.json';

export type VerifyEmailStepProps = {
  onCorrectAdminDetails?: () => void;
};

export function VerifyEmailStep({ onCorrectAdminDetails }: VerifyEmailStepProps) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900">
          <MailIcon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
        </div>
        <div>
          <h3 className="font-semibold text-default-700">{t('title')}</h3>
          <p className="text-sm text-default-500">{t('subtitle')}</p>
        </div>
      </div>

      <Alert color="primary" variant="flat" description={t('message')} />

      <Button variant="primary" onPress={() => navigate('/', { replace: true })}>
        {t('actions.goToLogin')}
      </Button>

      {onCorrectAdminDetails && (
        <Link
          as="button"
          className="text-sm cursor-pointer self-center"
          onPress={onCorrectAdminDetails}
          data-testid="wrong-admin-details-link"
        >
          <PencilIcon className="h-3.5 w-3.5 mr-1 inline" />
          {t('actions.wrongDetails')}
        </Link>
      )}
    </div>
  );
}
