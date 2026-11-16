import { useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { UserPlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { InviteUserModal } from '../../user-management/invite-user-modal/index';
import { useCanOpenPage } from './access';
import { WidgetActions, WidgetLinkButton, WidgetSearch } from './widgetParts';
import de from './de.json';
import en from './en.json';

/** A user search that opens the user list with the term, plus invitations and shortcuts. */
export function UsersWidget() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canOpen = useCanOpenPage();

  return (
    <div className="flex flex-col gap-3">
      <WidgetSearch
        label={t('users.searchLabel')}
        submitLabel={t('search')}
        onSearch={(term) => navigate(term ? `/users?q=${encodeURIComponent(term)}` : '/users')}
        data-cy="dashboard-users-search"
      />
      <WidgetActions>
        <WidgetLinkButton href="/users" data-cy="dashboard-users-all">
          {t('users.all')}
        </WidgetLinkButton>
        {/* The same URL the user list writes for its "email verified: no" filter. */}
        <WidgetLinkButton href="/users?emailVerified=false" data-cy="dashboard-users-unverified">
          {t('users.unverified')}
        </WidgetLinkButton>
        {canOpen('/settings/roles') && (
          <WidgetLinkButton href="/settings/roles" data-cy="dashboard-users-roles">
            {t('users.roles')}
          </WidgetLinkButton>
        )}
        {hasPermission('users.create') && (
          <InviteUserModal>
            {(onOpen) => (
              <Button size="sm" variant="secondary" onPress={onOpen} data-cy="dashboard-users-invite">
                <UserPlusIcon className="w-4 h-4" />
                {t('users.invite')}
              </Button>
            )}
          </InviteUserModal>
        )}
      </WidgetActions>
    </div>
  );
}
