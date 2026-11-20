import { useCallback } from 'react';
import { useReconciliation } from '../devices/useReconciliation';
import { getFabricStatus } from '../fabric-backup/api';
import { BackupHealthCard } from '../health/BackupHealthCard';
import { CapabilitiesHealthCard } from '../health/CapabilitiesHealthCard';
import { CompatibilityHealthCard } from '../health/CompatibilityHealthCard';
import { ConnectionHealthCard } from '../health/ConnectionHealthCard';
import { FabricHealthCard } from '../health/FabricHealthCard';
import { ReconciliationHealthCard } from '../health/ReconciliationHealthCard';
import { ThreadHealthCard } from '../health/ThreadHealthCard';
import { useMatterPermissions } from '../permissions';
import { useMatterResource } from '../useMatterResource';
import { useVisiblePoll } from '../useVisiblePoll';

/** How often the open Health tab refreshes the fabric, backup and reconciliation cards. */
export const HEALTH_POLL_MS = 30_000;

/**
 * Health: connection, compatibility, fabric, backup, reconciliation and capabilities on one page, each linking to the
 * tab where it can be fixed. Visible with `matter.devices.read` or `thread.network.read`; the Matter cards need the
 * first (a request the user would get a 403 for is not sent), the Thread card the second. The connection cards follow
 * the page's status poll; fabric, backup and reconciliation are refreshed every 30 s while the browser tab is visible.
 */
export function HealthTab() {
  const { canRead, canReadThread } = useMatterPermissions();
  const loadFabric = useCallback(() => getFabricStatus(), []);
  const fabric = useMatterResource(loadFabric, canRead);
  const reconciliation = useReconciliation(canRead);
  const { refetch: refetchFabric } = fabric;
  const { refetch: refetchReconciliation } = reconciliation;
  useVisiblePoll(() => Promise.all([refetchFabric(), refetchReconciliation()]), HEALTH_POLL_MS, canRead);
  return (
    <div className="mt:grid mt:grid-cols-1 mt:gap-4 mt:md:grid-cols-2" data-cy="matter-health-tab">
      {canRead && (
        <>
          <ConnectionHealthCard />
          <CompatibilityHealthCard />
          <FabricHealthCard status={fabric.data} error={fabric.error} loading={fabric.loading} />
          <BackupHealthCard status={fabric.data} error={fabric.error} loading={fabric.loading} />
          <ReconciliationHealthCard
            data={reconciliation.data}
            error={reconciliation.error}
            loading={reconciliation.loading}
          />
          <CapabilitiesHealthCard />
        </>
      )}
      {canReadThread && <ThreadHealthCard />}
    </div>
  );
}
