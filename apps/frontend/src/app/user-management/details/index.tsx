import { PageHeader } from '../../../components/pageHeader';
import { useParams, useSearchParams } from 'react-router-dom';
import { UserPermissionForm } from './components/permissionsForm';
import { SetPasswordForm } from './components/setPasswordForm';
import { ChangeUsernameForm } from './components/changeUsername';
import { ChangeEmailForm } from './components/changeEmail';
import { Chip, ModalBody, ModalFooter, ModalHeader, Separator } from '@heroui/react';
import { AlertTriangleIcon, KeyRoundIcon, LinkIcon, ListChecksIcon, ShieldIcon, UserIcon } from 'lucide-react';
import { FlatSection } from '../../../components/flatSection';
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { NotFound } from '../../not-found';
import { EffectivePermissionsSection } from './index.effective-permissions-section';
import { useUserDetailsState } from './useUserDetailsState';

// `/users/:id` also matches paths like `/users/security`, which used to render a detail page for a
// user that cannot exist — heading `(ID: )`, empty body. A non-numeric segment is not a user (ATT-869).
export function UserManagementDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  if (!/^\d+$/.test(id ?? '')) {
    return <NotFound />;
  }

  return <UserDetails id={Number(id)} roleIdToAssign={Number(searchParams.get('assignRoleId')) || undefined} />;
}

function UserDetails({ id, roleIdToAssign }: { id: number; roleIdToAssign?: number }) {
  const {
    t,
    isOpen,
    open,
    setOpen,
    user,
    providersById,
    ssoDetails,
    ssoManagedProviders,
    ssoManagedPermissionKeys,
    isSelf,
    deleteUser,
    isDeleting,
  } = useUserDetailsState({ id, roleIdToAssign });

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
          <FlatSection icon={<UserIcon size={16} />} title={t('profile.title')} data-cy="user-details-profile-section">
            <div className="flex flex-col gap-6">
              <ChangeUsernameForm userId={user.id} />
              <ChangeEmailForm userId={user.id} />
            </div>
          </FlatSection>

          <FlatSection
            icon={<ShieldIcon size={16} />}
            title={t('security.title')}
            data-cy="user-details-security-section"
          >
            <SetPasswordForm userId={user.id} username={user.username} />
          </FlatSection>

          <FlatSection
            icon={<KeyRoundIcon size={16} />}
            title={t('permissions.title')}
            data-cy="user-details-permissions-section"
          >
            <UserPermissionForm
              user={user}
              ssoManagedProviders={ssoManagedProviders}
              ssoManagedPermissionKeys={ssoManagedPermissionKeys}
              providersById={providersById}
              roleIdToAssign={roleIdToAssign}
            />
          </FlatSection>

          <FlatSection
            icon={<ListChecksIcon size={16} />}
            title={t('effectivePermissions.title')}
            data-cy="user-details-effective-permissions-section"
          >
            <EffectivePermissionsSection userId={id} t={t} />
          </FlatSection>

          <FlatSection
            icon={<LinkIcon size={16} />}
            title={t('sso.title')}
            data-cy="user-details-sso-section"
            actions={
              <Chip
                color={ssoDetails.length > 0 ? 'accent' : 'default'}
                variant={ssoDetails.length > 0 ? 'secondary' : 'primary'}
              >
                {ssoDetails.length > 0 ? t('sso.linked', { count: ssoDetails.length }) : t('sso.notLinkedChip')}
              </Chip>
            }
          >
            <div className="flex flex-col gap-4">
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
                          <span className="text-xs uppercase tracking-wide text-default-500">{t('sso.provider')}</span>
                          <div className="text-sm font-semibold text-default-900 break-words">{providerLabel}</div>
                          <div className="text-xs text-default-500">{detail.providerType ?? '-'}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs uppercase tracking-wide text-default-500">{t('sso.userId')}</span>
                          <div className="font-mono text-xs text-default-800 break-all">{detail.ssoSubject ?? '-'}</div>
                        </div>
                        {index < ssoDetails.length - 1 ? <Separator /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </FlatSection>

          <FlatSection
            icon={<AlertTriangleIcon size={16} className="text-danger" />}
            title={t('delete.title')}
            data-cy="user-details-delete-section"
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-default-500">{t('delete.description')}</p>
              <div className="flex w-full justify-end">
                <Button variant="danger-soft" onPress={open} isDisabled={isSelf} data-cy="admin-delete-user-open-modal">
                  {t('delete.actions.open')}
                </Button>
              </div>
              {isSelf ? <p className="text-xs text-default-400">{t('delete.selfDisabled')}</p> : null}
            </div>
          </FlatSection>
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
