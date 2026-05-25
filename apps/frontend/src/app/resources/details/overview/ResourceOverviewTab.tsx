// Overview tab compositing Session, Billing, Docs preview, Recent sessions
// FEATURE: ATT-386 Resource details page Overview tab
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { ResourceUsageSession } from '../../usage/resourceUsageSession';
import { ResourceBillingInfo } from '../resourceBillingInfo';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { RecentSessionsCard } from './RecentSessionsCard';
import { ResourceDocsPreviewCard } from './ResourceDocsPreviewCard';

export function ResourceOverviewTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const [insufficientBalanceDesiredAmount, setInsufficientBalanceDesiredAmount] = useState(10);

  if (!resource) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2">
          <ResourceUsageSession
            resourceId={resourceId}
            resource={resource}
            data-cy="resource-usage-session"
            insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
          />
        </div>
        <aside className="lg:col-span-1">
          <ResourceBillingInfo
            variant="flat"
            resourceId={resourceId}
            onExampleAmountChange={(value) =>
              setInsufficientBalanceDesiredAmount(Math.ceil(value))
            }
          />
        </aside>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        <ResourceDocsPreviewCard resourceId={resourceId} />
        <RecentSessionsCard resourceId={resourceId} />
      </div>
    </div>
  );
}
