import { useParams } from 'react-router-dom';
import { useResourceGroupsGetOne } from '@attraccess/react-query-client';
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { GroupDetailsForm } from './GroupDetailsForm';
import { PeopleManagement } from '../resources/PeopleManagement';
import { Alert, Spinner } from '@heroui/react';
import en from './en.json';
import de from './de.json';
import { GroupIcon } from 'lucide-react';
import { isNotFoundError } from '../../api/isNotFoundError';

export function ResourceGroupEditPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useTranslations({ en, de });
  const numericGroupId = Number(groupId);

  const {
    data: group,
    isLoading,
    error,
  } = useResourceGroupsGetOne({ path: { id: numericGroupId } }, undefined, { enabled: !!groupId });

  if (isLoading) {
    return <Spinner />;
  }

  if (error || !group) {
    const notFound = !error || isNotFoundError(error);
    return (
      <Alert status={notFound ? 'warning' : 'danger'} className="max-w-xl mx-auto my-12">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t(notFound ? 'notFound' : 'loadError')}</Alert.Title>
          <Alert.Description>{t(notFound ? 'notFoundDescription' : 'loadErrorDescription')}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div>
      <PageHeader title={group.name} subtitle={t('page.subtitle')} icon={<GroupIcon />} backTo="/" />

      <div className="flex flex-row flex-wrap gap-4 items-stretch">
        <GroupDetailsForm groupId={numericGroupId} className="flex-1 min-w-80" />
        <PeopleManagement
          target={{ type: 'group', id: numericGroupId }}
          canManageIntroducers
          canManageIntroductions
          className="flex-1 min-w-80"
          data-cy="manage-resource-group-people"
        />
      </div>
    </div>
  );
}
