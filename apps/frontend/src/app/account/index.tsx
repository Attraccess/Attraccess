import {
  BellIcon,
  BotIcon,
  CalendarClockIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  ShieldIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';
import { ConfirmableButton, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { UserAccountPluginSlot } from '../plugins/PluginSettingsSlots';
import { UsernameForm } from './username';
import { NameForm } from './name';
import { EmailForm } from './email';
import { SetPasswordForm } from '../user-management/details/components/setPasswordForm';
import { useAuth } from '../../hooks/useAuth';
import { TwoFactorCard } from './two-factor';
import { PasskeysCard } from './passkeys';
import { ApiTokensCard } from './api-tokens';
import { McpConnectionCard, useMcpConnection } from './mcp';
import { McpGrantsCard } from './mcp/McpGrantsCard';
import { DateTimePreferencesForm } from './date-time';
import { NotificationPreferencesForm } from './notifications';
import { useRequestDeleteAccount, ApiError } from '@attraccess/react-query-client';
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
  const canUseApiTokens = Boolean(me && hasPermission('users.api-tokens.manage'));
  const mcpConnection = useMcpConnection(canUseApiTokens);

  const { mutateAsync: requestDelete, isPending: isRequestingDelete } = useRequestDeleteAccount(undefined, {
    onSuccess: () => {
      toast.success({
        title: t('deleteAccount.toast.title'),
        description: t('deleteAccount.toast.description'),
      });
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
      items: [
        {
          key: 'profile',
          title: t('topics.profile.title'),
          description: t('topics.profile.description'),
          icon: <UserIcon size={19} />,
          searchTerms: [t('searchTerms.email'), t('searchTerms.username'), t('searchTerms.name')],
          content: (
            <div className="flex max-w-xl flex-col gap-6">
              <EmailForm />
              <NameForm />
              <UsernameForm />
            </div>
          ),
        },
      ],
    },
    {
      key: 'access',
      label: t('groups.access'),
      items: me
        ? [
            {
              key: 'password',
              title: t('topics.password.title'),
              description: t('topics.password.description'),
              icon: <LockKeyholeIcon size={19} />,
              content: (
                <div className="max-w-xl">
                  <SetPasswordForm userId={me.id} username={me.username} />
                </div>
              ),
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
          ]
        : [],
    },
    {
      key: 'preferences',
      label: t('groups.preferences'),
      items: [
        {
          key: 'dateTime',
          title: t('topics.dateTime.title'),
          description: t('topics.dateTime.description'),
          icon: <CalendarClockIcon size={19} />,
          content: <DateTimePreferencesForm />,
        },
        {
          key: 'notifications',
          title: t('topics.notifications.title'),
          description: t('topics.notifications.description'),
          icon: <BellIcon size={19} />,
          searchTerms: [t('searchTerms.push'), t('searchTerms.email')],
          content: <NotificationPreferencesForm />,
        },
      ],
    },
    {
      key: 'advanced',
      label: t('groups.advanced'),
      items: [
        ...(me && canUseApiTokens
          ? [
              {
                key: 'tokens',
                title: t('topics.tokens.title'),
                description: t('topics.tokens.description'),
                icon: <KeyRoundIcon size={19} />,
                content: <ApiTokensCard availablePermissions={me.effectivePermissions ?? []} />,
              },
            ]
          : []),
        ...(me && mcpConnection
          ? [
              {
                key: 'mcp',
                title: t('topics.mcp.title'),
                description: t('topics.mcp.description'),
                icon: <BotIcon size={19} />,
                searchTerms: [t('searchTerms.mcp')],
                content: (
                  <div className="flex flex-col gap-8">
                    <McpConnectionCard connection={mcpConnection} canUseApiTokens={canUseApiTokens} />
                    <McpGrantsCard oauthEnabled={mcpConnection.oauthEnabled} />
                  </div>
                ),
              },
            ]
          : []),
        {
          key: 'delete',
          title: t('topics.delete.title'),
          description: t('topics.delete.description'),
          icon: <Trash2Icon size={19} className="text-danger" />,
          content: (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted">{t('deleteAccount.description')}</p>
              <ConfirmableButton
                label={t('deleteAccount.actions.request')}
                status="error"
                data-cy="delete-account-open-modal"
                confirm={{
                  title: t('deleteAccount.modal.title'),
                  message: t('deleteAccount.modal.description'),
                  confirmLabel: t('deleteAccount.actions.confirm'),
                  cancelLabel: t('deleteAccount.actions.cancel'),
                  confirmDataCy: 'delete-account-confirm-button',
                }}
                isPending={isRequestingDelete}
                onConfirm={() => requestDelete()}
              />
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} backTo="/" />
      <SettingsDirectory groups={groups} searchLabel={t('search')} emptyMessage={t('noResults')} />
      {me && (
        <div className="mx-auto mt-6 flex w-full max-w-3xl flex-col gap-6 empty:hidden">
          <UserAccountPluginSlot userId={me.id} />
        </div>
      )}
    </div>
  );
}
