import {
  ApiError,
  SSOProvider,
  SSOProviderType,
  User,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
  useUsersServiceDeleteUser,
  useUsersServiceGetOneUserById,
} from '@attraccess/react-query-client';

import { PageHeader } from '../../../components/pageHeader';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPermissionForm } from './components/permissionsForm';
import { SetPasswordForm } from './components/setPasswordForm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChangeUsernameForm } from './components/changeUsername';
import { ChangeEmailForm } from './components/changeEmail';

import en from './en.json';
import de from './de.json';
import { Card, Chip, ModalBody, ModalFooter, ModalHeader, Separator, useOverlayState } from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { useAuth } from '../../../hooks/useAuth';
import { useMemo } from 'react';
import { getSsoManagedPermissionKeys, hasConfiguredPermissionMapping } from '@attraccess/shared';

export function UserManagementDetailsPage() {
  const { id: idParam } = useParams<{ id: string }>();

  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { isOpen, open, setOpen } = useOverlayState();
  const { user: me } = useAuth();

  const id = parseInt(idParam || '', 10);

  const { data: user } = useUsersServiceGetOneUserById({ id });
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = useMemo(
    () => new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider])),
    [ssoProviders],
  );
  type AuthenticationDetailSummary = {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
    type?: string | null;
  };
  type UserWithAuthDetails = Omit<User, 'authenticationDetails'> & {
    authenticationDetails?: AuthenticationDetailSummary[];
  };
  const ssoDetails = useMemo(
    () =>
      (user as UserWithAuthDetails | undefined)?.authenticationDetails?.filter(
        (detail) => detail.ssoSubject || detail.providerId || detail.providerType,
      ) ?? [],
    [user],
  );

  const ssoManagedProviders = useMemo(() => {
    if (ssoDetails.length === 0) {
      return [];
    }

    const labels = new Set<string>();

    ssoDetails.forEach((detail) => {
      if (!detail.providerId || !detail.providerType) {
        return;
      }

      const provider = providersById.get(detail.providerId);
      if (!provider) {
        return;
      }

      const permissionMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.permissionMappings
          : detail.providerType === SSOProviderType.SAML
            ? provider.samlConfiguration?.permissionMappings
            : undefined;

      if (hasConfiguredPermissionMapping(permissionMappings)) {
        labels.add(provider.name ?? `${detail.providerType} #${detail.providerId}`);
      }
    });

    return Array.from(labels);
  }, [providersById, ssoDetails]);

  const ssoManagedPermissionKeys = useMemo(() => {
    const keys = new Set<string>();

    ssoDetails.forEach((detail) => {
      if (!detail.providerId || !detail.providerType) {
        return;
      }

      const provider = providersById.get(detail.providerId);
      if (!provider) {
        return;
      }

      const permissionMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.permissionMappings
          : detail.providerType === SSOProviderType.SAML
            ? provider.samlConfiguration?.permissionMappings
            : undefined;

      getSsoManagedPermissionKeys(permissionMappings).forEach((key) => keys.add(key));
    });

    return keys;
  }, [providersById, ssoDetails]);

  const isSelf = !!me && !!user && me.id === user.id;
  const { mutate: deleteUser, isPending: isDeleting } = useUsersServiceDeleteUser({
    onSuccess: () => {
      toast.success({
        title: t('delete.success.title'),
        description: t('delete.success.description', { username: user?.username ?? '' }),
      });
      navigate('/users');
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
      <PageHeader
        title={`${user?.username ?? ''} (ID: ${user?.id ?? ''})`}
        subtitle={t('details.externalIdentifier', { identifier: user?.externalIdentifier })}
        backTo="/users"
      />

      {user && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start"
          data-cy="user-details-sections"
        >
          <Card className="w-full" data-cy="user-details-permissions-card">
            <Card.Content className="flex flex-col gap-4">
              <UserPermissionForm
                user={user}
                ssoManagedProviders={ssoManagedProviders}
                ssoManagedPermissionKeys={ssoManagedPermissionKeys}
              />
            </Card.Content>
          </Card>

          <Card className="w-full" data-cy="user-details-username-section">
            <Card.Content className="flex flex-col gap-4">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('profile.usernameTitle')}
              </h3>
              <ChangeUsernameForm userId={user.id} />
            </Card.Content>
          </Card>

          <Card className="w-full" data-cy="user-details-email-section">
            <Card.Content className="flex flex-col gap-4">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('profile.emailTitle')}
              </h3>
              <ChangeEmailForm userId={user.id} />
            </Card.Content>
          </Card>

          <Card className="w-full" data-cy="user-details-password-section">
            <Card.Content className="flex flex-col gap-4">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('profile.passwordTitle')}
              </h3>
              <SetPasswordForm userId={user.id} username={user.username} />
            </Card.Content>
          </Card>

          <Card className="w-full" data-cy="user-details-sso-section">
            <Card.Content className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                  {t('sso.title')}
                </h3>
                <Chip
                  color={ssoDetails.length > 0 ? 'accent' : 'default'}
                  variant={ssoDetails.length > 0 ? 'secondary' : 'primary'}
                >
                  {ssoDetails.length > 0 ? t('sso.linked', { count: ssoDetails.length }) : t('sso.notLinkedChip')}
                </Chip>
              </div>
              {ssoDetails.length === 0 ? (
                <div className="flex items-center gap-2">
                  <Chip color="default" variant="soft">
                    {t('sso.notLinked')}
                  </Chip>
                  <span className="text-sm text-default-500">{t('sso.notLinkedHint')}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {ssoDetails.map((detail, index) => {
                    const providerName = detail.providerId ? providersById.get(detail.providerId)?.name : undefined;
                    const providerLabel =
                      providerName ??
                      (detail.providerType && detail.providerId
                        ? `${detail.providerType} #${detail.providerId}`
                        : (detail.providerType ?? '-'));
                    const itemKey = `${detail.providerId ?? 'unknown'}-${detail.ssoSubject ?? 'unknown'}-${
                      detail.providerType ?? 'unknown'
                    }`;
                    return (
                      <div key={itemKey} className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs uppercase tracking-wide text-default-500">
                            {t('sso.provider')}
                          </span>
                          <div className="text-sm font-semibold text-default-900 break-words">{providerLabel}</div>
                          <div className="text-xs text-default-500">{detail.providerType ?? '-'}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs uppercase tracking-wide text-default-500">{t('sso.userId')}</span>
                          <div className="font-mono text-xs text-default-800 break-all">
                            {detail.ssoSubject ?? '-'}
                          </div>
                        </div>
                        {index < ssoDetails.length - 1 ? <Separator /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card.Content>
          </Card>

          <Card className="w-full" data-cy="user-details-delete-section">
            <Card.Content className="flex flex-col gap-4">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('delete.title')}
              </h3>
              <p className="text-sm text-default-500">{t('delete.description')}</p>
              <div className="flex w-full justify-end">
                <Button
                  variant="danger-soft"
                  onPress={open}
                  isDisabled={isSelf}
                  data-cy="admin-delete-user-open-modal"
                >
                  {t('delete.actions.open')}
                </Button>
              </div>
              {isSelf ? <p className="text-xs text-default-400">{t('delete.selfDisabled')}</p> : null}
            </Card.Content>
          </Card>
        </div>
      )}

      <StandardModal isOpen={isOpen} onOpenChange={setOpen} size="sm">
        {({ close: modalClose }) => (
          <>
            <ModalHeader>{t('delete.modal.title')}</ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-500">{t('delete.modal.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={modalClose} isDisabled={isDeleting}>
                {t('delete.actions.cancel')}
              </Button>
              <Button
                variant="danger"
                onPress={() => user && deleteUser({ id: user.id })}
                isPending={isDeleting}
                data-cy="admin-delete-user-confirm-button"
              >
                {t('delete.actions.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </div>
  );
}
