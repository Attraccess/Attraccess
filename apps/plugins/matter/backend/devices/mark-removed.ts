// Marks a node `removed` and retires its endpoints: shared by the record-only force removal and the removal from the
// fabric through the sidecar. The row, its endpoints, their state, commands and the audit trail stay as history.
import type { MatterTables } from '../plugin-storage/access';
import type { LifecycleState, RemovalReason } from './entities';
import { findLive, retireEndpoint } from './sync';

/**
 * Compare-and-set: changes the node only while it is in one of `from`. Returns false, and changes nothing, when it
 * no longer is (it changed in the meantime). Endpoints are retired as `force_removed`: their node was removed.
 */
export async function markNodeRemoved(
  tables: MatterTables,
  nodeRef: string,
  from: readonly LifecycleState[],
  removal: { removedBy: number | null; removalReason: RemovalReason },
  now: string,
): Promise<boolean> {
  const changed = await tables.nodes.update(
    { id: nodeRef, lifecycleState: { in: [...from] } },
    { lifecycleState: 'removed', removedAt: now, ...removal, updatedAt: now },
  );
  if (changed === 0) return false;
  for (const endpoint of await findLive(tables.endpoints, 'nodeRef', nodeRef)) {
    await retireEndpoint(tables, endpoint, 'force_removed', now);
  }
  return true;
}
