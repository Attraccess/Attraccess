import { useUsersServiceGetOneUserById } from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { useParams } from 'react-router-dom';
import { UserPermissionForm } from './components/permissionsForm';
import { SetPasswordForm } from './components/setPasswordForm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChangeUsernameForm } from './components/changeUsername';

import en from './en.json';
import de from './de.json';
import { Card, CardBody, CardHeader } from '@heroui/react';

export function UserManagementDetailsPage() {
  const { id: idParam } = useParams<{ id: string }>();

  const { t } = useTranslations({
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

      <div className="flex flex-row flex-wrap gap-4">
        {user && (
          <>
            <UserPermissionForm user={user} />{' '}
            <Card>
              <CardHeader>
                <PageHeader title={t('profile.title')} noMargin />
              </CardHeader>
              <CardBody className="flex flex-col gap-8">
                <ChangeUsernameForm userId={user.id} />
                <SetPasswordForm userId={user.id} />
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
