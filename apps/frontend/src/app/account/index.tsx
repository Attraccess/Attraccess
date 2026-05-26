import { PageHeader } from '../../components/pageHeader';
import { DrawerBody, DrawerFooter, DrawerHeader, useOverlayState } from '@heroui/react';
import { Button } from '../../components/button';
import { AlertTriangleIcon, ShieldIcon, UserIcon } from 'lucide-react';
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
import { FlatSection } from '../../components/flatSection';
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <FlatSection icon={<UserIcon size={16} />} title={t('sections.profile')}>
          <div className="flex flex-col gap-6">
            <EmailForm />
            <UsernameForm />
          </div>
        </FlatSection>

        <FlatSection icon={<ShieldIcon size={16} />} title={t('sections.security')}>
          <div className="flex flex-col gap-6">
            {me && <SetPasswordForm userId={me.id} username={me.username} />}
            {me && <TwoFactorCard />}
          </div>
        </FlatSection>

        <FlatSection icon={<AlertTriangleIcon size={16} className="text-danger" />} title={t('sections.dangerZone')}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-default-500">{t('deleteAccount.description')}</p>
            <div>
              <Button variant="danger" onPress={open} data-cy="delete-account-open-modal">
                {t('deleteAccount.actions.request')}
              </Button>
            </div>
          </div>
        </FlatSection>
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
