import {
  ApiError,
  SSOProvider,
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
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { useAuth } from '../../../hooks/useAuth';

export function UserManagementDetailsPage() {
  const { id: idParam } = useParams<{ id: string }>();

  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user: me } = useAuth();

  const id = parseInt(idParam || '', 10);

  const { data: user } = useUsersServiceGetOneUserById({ id });
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider]));
  type AuthenticationDetailSummary = {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
    type?: string | null;
  };
  type UserWithAuthDetails = User & {
    authenticationDetails?: AuthenticationDetailSummary[];
  };
  const authenticationDetails =
    (user as UserWithAuthDetails | undefined)?.authenticationDetails as AuthenticationDetailSummary[] | undefined;
  const ssoDetails =
    authenticationDetails?.filter((detail) => detail.ssoSubject || detail.providerId || detail.providerType) ?? [];

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr items-stretch">
        {user && (
          <>
            <div className="w-full">
              <UserPermissionForm user={user} />
            </div>
            <Card className="w-full">
              <CardHeader>
                <PageHeader title={t('profile.usernameTitle')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-8">
                <ChangeUsernameForm userId={user.id} />
              </CardBody>
            </Card>

            <Card className="w-full">
              <CardHeader>
                <PageHeader title={t('profile.emailTitle')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-8">
                <ChangeEmailForm userId={user.id} />
              </CardBody>
            </Card>

            <Card className="w-full">
              <CardHeader>
                <PageHeader title={t('profile.passwordTitle')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-8">
                <SetPasswordForm userId={user.id} />
              </CardBody>
            </Card>

            <Card className="w-full">
              <CardHeader className="flex items-center justify-between">
                <PageHeader title={t('sso.title')} noMargin />
                <Chip
                  color={ssoDetails.length > 0 ? 'primary' : 'default'}
                  variant={ssoDetails.length > 0 ? 'flat' : 'bordered'}
                >
                  {ssoDetails.length > 0 ? t('sso.linked', { count: ssoDetails.length }) : t('sso.notLinkedChip')}
                </Chip>
              </CardHeader>
              <CardBody>
                {ssoDetails.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <Chip color="default" variant="flat">
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
                          : detail.providerType ?? '-');
                      const itemKey = `${detail.providerId ?? 'unknown'}-${detail.ssoSubject ?? 'unknown'}-${detail.providerType ?? 'unknown'
                        }`;
                      return (
                        <div key={itemKey} className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs uppercase tracking-wide text-default-500">{t('sso.provider')}</span>
                            <div className="text-sm font-semibold text-default-900 break-words">{providerLabel}</div>
                            <div className="text-xs text-default-500">{detail.providerType ?? '-'}</div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs uppercase tracking-wide text-default-500">{t('sso.userId')}</span>
                            <div className="font-mono text-xs text-default-800 break-all">{detail.ssoSubject ?? '-'}</div>
                          </div>
                          {index < ssoDetails.length - 1 ? <Divider /> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="w-full">
              <CardHeader>
                <PageHeader title={t('delete.title')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                <p className="text-sm text-default-500">{t('delete.description')}</p>
                <Button
                  color="danger"
                  variant="flat"
                  onPress={onOpen}
                  isDisabled={isSelf}
                  data-cy="admin-delete-user-open-modal"
                >
                  {t('delete.actions.open')}
                </Button>
                {isSelf ? <p className="text-xs text-default-400">{t('delete.selfDisabled')}</p> : null}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      <Modal isOpen={isOpen} onOpenChange={(open) => (open ? onOpen() : onClose())}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('delete.modal.title')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500">{t('delete.modal.description')}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={isDeleting}>
                  {t('delete.actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  onPress={() => user && deleteUser({ id: user.id })}
                  isLoading={isDeleting}
                  data-cy="admin-delete-user-confirm-button"
                >
                  {t('delete.actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
