import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Link } from '@heroui/react';
import { UserPlusIcon } from 'lucide-react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useUsersServiceFindMany } from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { InviteUserModal } from '../../user-management/invite-user-modal/index';
import { itemsPerSize, WidgetEmpty, WidgetError, WidgetList, WidgetLoading, WidgetSearch } from './widgetParts';
import de from './de.json';
import en from './en.json';

const RESULTS_PER_SIZE = { medium: 3, large: 7 };

/** A link to the users who have not verified their email address, shown only while there are any. */
export function UnverifiedUsersChip() {
  const { t } = useTranslations({ en, de });
  const { data } = useUsersServiceFindMany({ emailVerified: false, limit: 1 });
  const count = data?.total ?? 0;
  if (count === 0) return null;

  return (
    // The same URL the user list writes for its "email verified: no" filter.
    <Link href="/users?emailVerified=false" className="shrink-0 no-underline" data-cy="dashboard-users-unverified">
      <Chip size="sm" color="warning">
        {t('users.unverified', { count })}
      </Chip>
    </Link>
  );
}

function Results({ term, limit }: Readonly<{ term: string; limit: number }>) {
  const { t } = useTranslations({ en, de });
  const { data, isPending, isError } = useUsersServiceFindMany({ search: term, limit });

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (data.data.length === 0) return <WidgetEmpty>{t('users.noMatch')}</WidgetEmpty>;
  return (
    <WidgetList>
      {data.data.map((user) => (
        <li key={user.id} className="min-w-0">
          <Link
            href={`/users/${user.id}`}
            className="block min-w-0 truncate text-sm leading-tight"
            data-cy="dashboard-users-result"
          >
            {user.username}
          </Link>
        </li>
      ))}
    </WidgetList>
  );
}

/** A user search with live results, each opening the user, and invitations for those who may invite. */
export function UsersWidget({ size, isPreview }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [term, setTerm] = useState('');
  const search = useDebounce(term.trim(), 300);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <WidgetSearch
          label={t('users.searchLabel')}
          value={term}
          onChange={setTerm}
          onSubmit={(value) => navigate(value ? `/users?q=${encodeURIComponent(value)}` : '/users')}
          data-cy="dashboard-users-search"
        />
        {hasPermission('users.create') && !isPreview && (
          <InviteUserModal>
            {(onOpen) => (
              <Button
                isIconOnly
                className="shrink-0"
                variant="secondary"
                aria-label={t('users.invite')}
                onPress={onOpen}
                data-cy="dashboard-users-invite"
              >
                <UserPlusIcon className="w-4 h-4" />
              </Button>
            )}
          </InviteUserModal>
        )}
      </div>
      {search && <Results term={search} limit={itemsPerSize(size, RESULTS_PER_SIZE)} />}
    </div>
  );
}
