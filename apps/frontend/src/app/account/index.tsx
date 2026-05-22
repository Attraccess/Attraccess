import { PageHeader } from '../../components/pageHeader';
import { Button, Card, DrawerBody, DrawerFooter, DrawerHeader, useOverlayState } from '@heroui/react';
import { StandardDrawer } from '../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { UsernameForm } from './username';
import { EmailForm } from './email';
import { SetPasswordForm } from '../user-management/details/components/setPasswordForm';
import { useAuth } from '../../hooks/useAuth';
import { TwoFactorCard } from './two-factor';
import { useUsersServiceRequestDeleteAccount, ApiError } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';

export default function AccountPage() {
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const { user: me } = useAuth();
  const toast = useToastMessage();
  const { isOpen, open, close, setOpen } = useOverlayState();

  const { mutate: requestDelete, isPending: isRequestingDelete } = useUsersServiceRequestDeleteAccount({
    onSuccess: () => {
      toast.success({
        title: t('deleteAccount.toast.title'),
        description: t('deleteAccount.toast.description'),
      });
      close();
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'apiErrors',
      });
    },
  });

  return (
    <div>
      <PageHeader title={t('title')} backTo="/" />

      <div className="flex flex-row flex-wrap gap-4">
        <Card className="max-w-md">
          <Card.Header>
            <PageHeader title={t('sections.profile')} noMargin />
          </Card.Header>
          <Card.Content className="flex flex-col gap-6">
            <EmailForm />
            <UsernameForm />
          </Card.Content>
        </Card>

        <Card className="max-w-md">
          <Card.Header>
            <PageHeader title={t('sections.security')} noMargin />
          </Card.Header>
          <Card.Content className="flex flex-col gap-6">
            {me && <SetPasswordForm userId={me.id} username={me.username} />}
            {me && <TwoFactorCard />}
          </Card.Content>
        </Card>

        <Card className="max-w-md">
          <Card.Header>
            <PageHeader title={t('sections.dangerZone')} noMargin />
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
            <p className="text-sm text-default-500">{t('deleteAccount.description')}</p>
            <Button variant="danger-soft" onPress={open} data-cy="delete-account-open-modal">
              {t('deleteAccount.actions.request')}
            </Button>
          </Card.Content>
        </Card>
      </div>

      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('deleteAccount.modal.title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <p className="text-sm text-default-500">{t('deleteAccount.modal.description')}</p>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={close} isDisabled={isRequestingDelete}>
            {t('deleteAccount.actions.cancel')}
          </Button>
          <Button
            variant="danger"
            onPress={() => requestDelete()}
            isPending={isRequestingDelete}
            data-cy="delete-account-confirm-button"
          >
            {t('deleteAccount.actions.confirm')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </div>
  );
}
