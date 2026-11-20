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

/**
 * Health: connection, compatibility, fabric, backup, reconciliation and capabilities on one page, each linking to the
 * tab where it can be fixed. Visible with `matter.devices.read` or `thread.network.read`; the Matter cards need the
 * first (a request the user would get a 403 for is not sent), the Thread card the second.
 */
export function HealthTab() {
  const { canRead, canReadThread } = useMatterPermissions();
  const loadFabric = useCallback(() => getFabricStatus(), []);
  const fabric = useMatterResource(loadFabric, canRead);
  const reconciliation = useReconciliation(canRead);
  return (
    <div className="mt:grid mt:grid-cols-1 mt:gap-4 mt:md:grid-cols-2" data-cy="matter-health-tab">
      {canRead && (
        <>
          <ConnectionHealthCard />
          <CompatibilityHealthCard />
          <FabricHealthCard status={fabric.data} error={fabric.error} />
          <BackupHealthCard status={fabric.data} error={fabric.error} />
          <ReconciliationHealthCard resource={reconciliation} />
          <CapabilitiesHealthCard />
        </>
      )}
      {canReadThread && <ThreadHealthCard />}
    </div>
  );
}
