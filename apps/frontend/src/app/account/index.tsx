import { PageHeader } from '../../components/pageHeader';
import { Button, Card, CardContent, CardHeader, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading, useOverlayState } from '@heroui/react';
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
          <CardHeader>
            <PageHeader title={t('sections.profile')} noMargin />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <EmailForm />
            <UsernameForm />
          </CardContent>
        </Card>

        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.security')} noMargin />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {me && <SetPasswordForm userId={me.id} />}
            {me && <TwoFactorCard />}
          </CardContent>
        </Card>

        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.dangerZone')} noMargin />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-default-500">{t('deleteAccount.description')}</p>
            <Button color="danger" variant="flat" onPress={open} data-cy="delete-account-open-modal">
              {t('deleteAccount.actions.request')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <ModalHeading>{t('deleteAccount.modal.title')}</ModalHeading>
                </ModalHeader>
                <ModalBody>
                  <p className="text-sm text-default-500">{t('deleteAccount.modal.description')}</p>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={close} isDisabled={isRequestingDelete}>
                    {t('deleteAccount.actions.cancel')}
                  </Button>
                  <Button
                    color="danger"
                    onPress={() => requestDelete()}
                    isLoading={isRequestingDelete}
                    data-cy="delete-account-confirm-button"
                  >
                    {t('deleteAccount.actions.confirm')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </div>
  );
}
