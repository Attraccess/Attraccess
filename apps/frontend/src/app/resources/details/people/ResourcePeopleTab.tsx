// Route-level wrapper rendering PeopleManagement for the People tab
// FEATURE: ATT-386 Resource details page People tab
import { useParams } from 'react-router-dom';
import { PeopleManagement } from '../../PeopleManagement';
import { useResourceTabs } from '../layout/useResourceTabs';

export function ResourcePeopleTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);

  const { canManageAccess, isIntroducer } = useResourceTabs(resourceId);

  return (
    <PeopleManagement
      target={{ type: 'resource', id: resourceId }}
      canManageIntroducers={canManageAccess}
      canManageIntroductions={isIntroducer || canManageAccess}
      flat
      hideHeader
      data-cy="manage-resource-people"
    />
  );
}
