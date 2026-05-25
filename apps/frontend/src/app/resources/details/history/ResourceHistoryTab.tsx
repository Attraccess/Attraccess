// Route-level wrapper rendering ResourceUsageHistory for the History tab
// FEATURE: ATT-386 Resource details page History tab
import { useParams } from 'react-router-dom';
import { ResourceUsageHistory } from '../../usage/resourceUsageHistory';

export function ResourceHistoryTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  return <ResourceUsageHistory resourceId={resourceId} hideHeader data-cy="resource-usage-history" />;
}
