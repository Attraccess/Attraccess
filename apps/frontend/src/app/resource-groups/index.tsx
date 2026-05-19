import { useParams } from 'react-router-dom';
import { useResourcesServiceResourceGroupsGetOne } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { GroupDetailsForm } from './GroupDetailsForm';
import { PeopleManagement } from '../resources/PeopleManagement';
import { Spinner } from '@heroui/react';
import en from './en.json';
import de from './de.json';
import { GroupIcon } from 'lucide-react';

export function ResourceGroupEditPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useTranslations({ en, de });
  const numericGroupId = Number(groupId);

  const {
    data: group,
    isLoading,
    error,
  } = useResourcesServiceResourceGroupsGetOne({ id: numericGroupId }, undefined, { enabled: !!groupId });

  if (isLoading) {
    return <Spinner />;
  }

  if (error || !group) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ color: 'red', fontWeight: '500', fontSize: '18px' }}>{t('loadError')}</p>
        <p style={{ opacity: 0.7, marginTop: '8px' }}>{t('loadErrorDescription')}</p>
      </div>
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
          flat
          className="flex-1 min-w-80"
          data-cy="manage-resource-group-people"
        />
      </div>
    </div>
  );
}
