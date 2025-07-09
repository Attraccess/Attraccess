import { useUsersServiceGetOneUserById } from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { useParams } from 'react-router-dom';
import { UserPermissionForm } from './components/permissionsForm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import en from './en.json';
import de from './de.json';

export function UserManagementDetailsPage() {
  const { id: idParam } = useParams<{ id: string }>();

  const { t } = useTranslations('userManagementDetails', {
    en,
    de,
  });

  const id = parseInt(idParam || '', 10);

  const { data: user } = useUsersServiceGetOneUserById({ id });

  return (
    <div>
      <PageHeader
        title={`${user?.username ?? ''} (ID: ${user?.id ?? ''})`}
        subtitle={t('details.externalIdentifier', { identifier: user?.externalIdentifier })}
        backTo="/users"
      />

      <div className="flex flex-col gap-4">{user && <UserPermissionForm user={user} />}</div>
    </div>
  );
}
