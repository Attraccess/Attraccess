import { PageHeader } from '../../components/pageHeader';
import { DrawerBody, DrawerFooter, DrawerHeader, useOverlayState } from '@heroui/react';
import { Button } from '../../components/button';
import { BellIcon, KeyRoundIcon, LockKeyholeIcon, ShieldIcon, Trash2Icon, UserIcon } from 'lucide-react';
import { StandardDrawer } from '../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { UsernameForm } from './username';
import { EmailForm } from './email';
import { SetPasswordForm } from '../user-management/details/components/setPasswordForm';
import { useAuth } from '../../hooks/useAuth';
import { TwoFactorCard } from './two-factor';
import { PasskeysCard } from './passkeys';
import { ApiTokensCard } from './api-tokens';
import { NotificationPreferencesForm } from './notifications';
import { useUsersServiceRequestDeleteAccount, ApiError } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { SettingsDirectory, type SettingsDirectoryGroup } from '../../components/settingsDirectory';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';

export default function AccountPage() {
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const { user: me, hasPermission } = useAuth();
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

  const groups: SettingsDirectoryGroup[] = [
    {
      key: 'identity',
      label: t('groups.identity'),
      items: [{
        key: 'profile',
        title: t('topics.profile.title'),
        description: t('topics.profile.description'),
        icon: <UserIcon size={19} />,
        searchTerms: [t('searchTerms.email'), t('searchTerms.username')],
        content: <div className="flex max-w-xl flex-col gap-6"><EmailForm /><UsernameForm /></div>,
      }],
    },
    {
      key: 'access',
      label: t('groups.access'),
      items: me ? [
        {
          key: 'password',
          title: t('topics.password.title'),
          description: t('topics.password.description'),
          icon: <LockKeyholeIcon size={19} />,
          content: <div className="max-w-xl"><SetPasswordForm userId={me.id} username={me.username} /></div>,
        },
        {
          key: 'twoFactor',
          title: t('topics.twoFactor.title'),
          description: t('topics.twoFactor.description'),
          icon: <ShieldIcon size={19} />,
          searchTerms: [t('searchTerms.authenticator')],
          content: <TwoFactorCard />,
        },
        {
          key: 'passkeys',
          title: t('topics.passkeys.title'),
          description: t('topics.passkeys.description'),
          icon: <KeyRoundIcon size={19} />,
          content: <PasskeysCard />,
        },
      ] : [],
    },
    {
      key: 'preferences',
      label: t('groups.preferences'),
      items: [{
        key: 'notifications',
        title: t('topics.notifications.title'),
        description: t('topics.notifications.description'),
        icon: <BellIcon size={19} />,
        searchTerms: [t('searchTerms.push'), t('searchTerms.email')],
        content: <NotificationPreferencesForm />,
      }],
    },
    {
      key: 'advanced',
      label: t('groups.advanced'),
      items: [
        ...(me && hasPermission('users.api-tokens.manage') ? [{
          key: 'tokens',
          title: t('topics.tokens.title'),
          description: t('topics.tokens.description'),
          icon: <KeyRoundIcon size={19} />,
          content: <ApiTokensCard availablePermissions={me.effectivePermissions ?? []} />,
        }] : []),
        {
          key: 'delete',
          title: t('topics.delete.title'),
          description: t('topics.delete.description'),
          icon: <Trash2Icon size={19} className="text-danger" />,
          content: <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted">{t('deleteAccount.description')}</p>
            <Button variant="danger" onPress={open} data-cy="delete-account-open-modal">
              {t('deleteAccount.actions.request')}
            </Button>
          </div>,
        },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} backTo="/" />
      <SettingsDirectory groups={groups} searchLabel={t('search')} emptyMessage={t('noResults')} />

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
