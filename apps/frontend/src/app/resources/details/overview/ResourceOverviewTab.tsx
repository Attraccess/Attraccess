// Overview tab compositing Session, Billing, Docs preview, Recent sessions
// FEATURE: ATT-386 Resource details page Overview tab
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { ResourceUsageSession } from '../../usage/resourceUsageSession';
import { ResourceBillingInfo } from '../resourceBillingInfo';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { RecentSessionsCard } from './RecentSessionsCard';
import { ResourceDocsPreviewCard } from './ResourceDocsPreviewCard';
import { PluginSlot } from '../../../plugins/PluginSlot';
import { RESOURCE_OVERVIEW_SLOT, ResourceSlotContext } from '@attraccess/plugins-frontend-sdk';
import { OperatingDurationCard } from './OperatingDurationCard';

const CARD_CLASS = 'break-inside-avoid mb-6';

export function ResourceOverviewTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const [insufficientBalanceDesiredAmount, setInsufficientBalanceDesiredAmount] = useState(10);

  if (!resource) return null;

  return (
    <div className="columns-1 lg:columns-2 gap-6 [&>*:last-child]:mb-0">
      <ResourceUsageSession
        className={CARD_CLASS}
        resourceId={resourceId}
        resource={resource}
        data-cy="resource-usage-session"
        insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
      />
      <ResourceBillingInfo
        className={CARD_CLASS}
        resourceId={resourceId}
        onExampleAmountChange={(value) => setInsufficientBalanceDesiredAmount(Math.ceil(value))}
      />
      <ResourceDocsPreviewCard className={CARD_CLASS} resourceId={resourceId} />
      <RecentSessionsCard className={CARD_CLASS} resourceId={resourceId} />
      <OperatingDurationCard className={CARD_CLASS} resourceId={resourceId} />
      <PluginSlot<ResourceSlotContext> slotId={RESOURCE_OVERVIEW_SLOT} context={{ resourceId }} />
    </div>
  );
}
