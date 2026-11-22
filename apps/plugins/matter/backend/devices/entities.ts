// Row types of the Matter device model. The tables are declared in `../plugin-storage/tables.ts` (the host owns the DDL);
// these types narrow the declared string columns to the values the plugin writes. Matter 64-bit IDs are decimal
// strings and timestamps are ISO-8601 strings, like in `plugin_matter_connection`. There is deliberately no column
// that relates a Matter record to an Attraccess resource: those links live in flow node configuration and reference
// the stable `id` UUIDs below.
import type { PluginStorageRow } from '@attraccess/plugins-backend-sdk';
import type { MATTER_TABLES } from '../plugin-storage/tables';

export type FabricStatus = 'active' | 'absent';
export type LifecycleState = 'unclaimed' | 'claimed' | 'detached' | 'archived' | 'removed';
export type DetachedReason = 'absent_from_sidecar' | 'fabric_mismatch' | 'fabric_absent';
/** `removed_from_fabric` / `forced_from_fabric` (ATT-1002): the sidecar removed or forgot the node. */
export type RemovalReason = 'force_removed' | 'merged' | 'replaced' | 'removed_from_fabric' | 'forced_from_fabric';
/** Why an endpoint row was retired. */
export type EndpointRemovalReason = 'absent_from_sidecar' | 'replaced' | 'force_removed' | 'merged';
export type AttestationStatus = 'verified' | 'unverified' | 'failed' | 'unknown';
export type ClusterRole = 'server' | 'client';
export type StateSource = 'subscription_report' | 'read' | 'command_response';
export type StateQuality = 'good' | 'uncertain' | 'fault' | 'unavailable';
export type CommandState = 'none' | 'requested' | 'accepted' | 'reported' | 'uncertain' | 'failed';
export type ReconciliationResult = 'applied' | 'skipped_unavailable' | 'skipped_non_authoritative' | 'failed';

type Tables = typeof MATTER_TABLES;
/** The declared row with some of its string columns narrowed. */
type Narrow<Row, Narrowed> = Omit<Row, keyof Narrowed> & Narrowed;

export type MatterFabric = Narrow<PluginStorageRow<Tables['fabrics']>, { status: FabricStatus }>;

export type MatterNode = Narrow<
  PluginStorageRow<Tables['nodes']>,
  {
    attestationStatus: AttestationStatus | null;
    lifecycleState: LifecycleState;
    detachedReason: DetachedReason | null;
    removalReason: RemovalReason | null;
  }
>;

export type MatterEndpoint = Narrow<
  PluginStorageRow<Tables['endpoints']>,
  { removalReason: EndpointRemovalReason | null }
>;

export type MatterEndpointCluster = Narrow<PluginStorageRow<Tables['endpointClusters']>, { role: ClusterRole }>;

export type MatterEndpointCapability = PluginStorageRow<Tables['endpointCapabilities']>;

export type MatterEndpointState = Narrow<
  PluginStorageRow<Tables['endpointState']>,
  { source: StateSource | null; quality: StateQuality | null; commandState: CommandState }
>;

export type MatterCommand = PluginStorageRow<Tables['commands']>;

export type MatterReconciliationStatus = Narrow<
  PluginStorageRow<Tables['reconciliationStatus']>,
  { lastResult: ReconciliationResult | null }
>;

/** The singleton row describing the last reconciliation run. */
export const RECONCILIATION_ROW_ID = 1;
