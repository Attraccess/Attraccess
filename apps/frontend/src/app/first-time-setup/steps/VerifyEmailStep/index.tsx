import { useCallback, useRef, useState } from 'react';
import { MailIcon, PencilIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Form, Input, Link } from '@heroui/react';
import {
  useUsersServiceCorrectSetupEmail,
  ApiError,
} from '@attraccess/react-query-client';
import { PasswordInput } from '../../../../components/PasswordInput';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export function VerifyEmailStep() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const navigate = useNavigate();
  const toast = useToastMessage();
  const formRef = useRef<HTMLFormElement>(null);

  const [view, setView] = useState<'initial' | 'correcting' | 'corrected'>('initial');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const { mutate: correctEmail, isPending } = useUsersServiceCorrectSetupEmail({
    onSuccess: () => {
      setView('corrected');
      setUsername('');
      setPassword('');
      setNewEmail('');
      toast.success({ title: t('correction.success') });
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

  const handleCorrectSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity() || !username || !password || !newEmail) return;
    correctEmail({
      requestBody: { username, password, newEmail },
    });
  }, [correctEmail, username, password, newEmail]);

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

      {view === 'corrected' ? (
        <Alert color="success" variant="flat" description={t('correction.success')} />
      ) : (
        <Alert color="primary" variant="flat" description={t('message')} />
      )}

      {view !== 'correcting' && (
        <>
          <Button color="primary" onPress={() => navigate('/', { replace: true })}>
            {t('actions.goToLogin')}
          </Button>
          <Link
            as="button"
            className="text-sm cursor-pointer self-center"
            onPress={() => setView('correcting')}
            data-testid="wrong-email-link"
          >
            <PencilIcon className="h-3.5 w-3.5 mr-1 inline" />
            {t('actions.wrongEmail')}
          </Link>
        </>
      )}

      {view === 'correcting' && (
        <div className="flex flex-col gap-4 rounded-lg border border-default-200 p-4">
          <div>
            <h4 className="font-semibold text-default-700">{t('correction.title')}</h4>
            <p className="text-sm text-default-500">{t('correction.subtitle')}</p>
          </div>
          <Form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              handleCorrectSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              label={t('correction.username')}
              value={username}
              onValueChange={setUsername}
              isRequired
              data-testid="correct-email-username"
            />
            <PasswordInput
              label={t('correction.password')}
              value={password}
              onValueChange={setPassword}
              autoComplete="current-password"
              isRequired
              data-testid="correct-email-password"
            />
            <Input
              label={t('correction.newEmail')}
              type="email"
              value={newEmail}
              onValueChange={setNewEmail}
              isRequired
              data-testid="correct-email-new-email"
            />
            <input type="submit" hidden />
          </Form>
          <div className="flex gap-2">
            <Button
              color="primary"
              onPress={handleCorrectSubmit}
              isLoading={isPending}
              isDisabled={!username || !password || !newEmail}
              data-testid="correct-email-submit"
            >
              {isPending ? t('correction.submitting') : t('correction.submit')}
            </Button>
            <Button
              variant="flat"
              onPress={() => setView('initial')}
            >
              {t('actions.hideCorrection')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
