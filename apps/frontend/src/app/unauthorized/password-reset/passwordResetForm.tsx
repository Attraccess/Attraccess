import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@heroui/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useUsersServiceRequestPasswordReset } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { Input } from '@heroui/input';

interface PasswordResetFormProps {
  onGoBack: () => void;
}

export function PasswordResetForm({ onGoBack }: PasswordResetFormProps) {
  const { t } = useTranslations({
    en,
    de,
  });

  const [email, setEmail] = useState('');

  const toast = useToastMessage();

  const { mutate: requestPasswordReset, isPending } = useUsersServiceRequestPasswordReset({
    onError: (error) => {
      toast.error({
        title: t('error.title'),
        description: (error as Error).message,
      });
    },
    onSuccess: () => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
    },
  });

  const memoizedArrowRight = useMemo(
    () => <ArrowRight className="group-hover:translate-x-1 transition-transform" />,
    [],
  );

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold">{t('title')}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          <Button
            onPress={onGoBack}
            variant="light"
            color="secondary"
            startContent={<ArrowLeft />}
            data-cy="password-reset-form-go-back-button"
          >
            {t('goBackButton')}
          </Button>
        </p>
      </div>

      <Input
        label={t('emailLabel')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-cy="password-reset-form-email-input"
      />

      <Button
        onPress={() => requestPasswordReset({ requestBody: { email } })}
        fullWidth
        color="primary"
        endContent={memoizedArrowRight}
        isLoading={isPending}
        isDisabled={isPending}
        data-cy="password-reset-form-submit-button"
      >
        {t('mainButton')}
      </Button>
    </>
  );
}
