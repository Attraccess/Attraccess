// Route-level wrapper rendering PeopleManagement for the People tab
// FEATURE: ATT-386 Resource details page People tab
import { useParams } from 'react-router-dom';
import { useAccessControlServiceResourceIntroducersIsIntroducer } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { PeopleManagement } from '../../PeopleManagement';

export function ResourcePeopleTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('canManageResources');

  const { data: isIntroducer } = useAccessControlServiceResourceIntroducersIsIntroducer(
    {
      resourceId,
      userId: user?.id as number,
      includeGroups: true,
    },
    undefined,
    { enabled: !!user?.id },
  );

  return (
    <PeopleManagement
      target={{ type: 'resource', id: resourceId }}
      canManageIntroducers={canManageResources}
      canManageIntroductions={isIntroducer?.isIntroducer || canManageResources}
      flat
      data-cy="manage-resource-people"
    />
  );
}
