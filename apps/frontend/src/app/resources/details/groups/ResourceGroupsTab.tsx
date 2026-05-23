// Route-level wrapper rendering ManageResourceGroups for the Groups tab
// FEATURE: ATT-386 Resource details page Groups tab
import { useParams } from 'react-router-dom';
import { ManageResourceGroups } from '../../groups';

export function ResourceGroupsTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  return <ManageResourceGroups resourceId={resourceId} data-cy="manage-resource-groups" />;
}
