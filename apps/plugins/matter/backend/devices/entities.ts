// TypeORM entities for the Matter device model. The schema belongs to the plugin migration
// (migrations/1793900001000-create-matter-device-model.ts); the host runs with `synchronize: false`.
//
// Every column declares an explicit `type`, because the esbuild bundle emits no decorator metadata. Matter 64-bit IDs
// are decimal strings and timestamps are ISO-8601 strings, like in `plugin_matter_connection`. There is deliberately
// no column that relates a Matter record to an Attraccess resource: those links live in flow node configuration and
// reference the stable `id` UUIDs below.
import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

export type FabricStatus = 'active' | 'absent';
export type LifecycleState = 'unclaimed' | 'claimed' | 'detached' | 'archived' | 'removed';
export type DetachedReason = 'absent_from_sidecar' | 'fabric_mismatch' | 'fabric_absent';
export type RemovalReason = 'force_removed' | 'merged' | 'replaced';
/** Why an endpoint row was retired. */
export type EndpointRemovalReason = 'absent_from_sidecar' | 'replaced' | 'force_removed' | 'merged';
export type AttestationStatus = 'verified' | 'unverified' | 'failed' | 'unknown';
export type ClusterRole = 'server' | 'client';
export type StateSource = 'subscription_report' | 'read' | 'command_response';
export type StateQuality = 'good' | 'uncertain' | 'fault' | 'unavailable';
export type CommandState = 'none' | 'requested' | 'accepted' | 'reported' | 'uncertain' | 'failed';
export type ReconciliationResult = 'applied' | 'skipped_unavailable' | 'skipped_non_authoritative' | 'failed';

@Entity({ name: 'plugin_matter_fabrics' })
export class MatterFabric {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  /** The Matter fabric ID as a decimal string. The fabric's secrets stay in the sidecar. */
  @Column({ type: 'varchar', name: 'fabric_id' })
  fabricId!: string;

  @Column({ type: 'varchar', nullable: true })
  label!: string | null;

  @Column({ type: 'varchar', name: 'first_seen_at' })
  firstSeenAt!: string;

  @Column({ type: 'varchar', name: 'last_seen_at' })
  lastSeenAt!: string;

  @Column({ type: 'varchar' })
  status!: FabricStatus;

  @Column({ type: 'varchar', name: 'retired_at', nullable: true })
  retiredAt!: string | null;

  // --- identity the plugin recorded for backup and restore (ATT-998). Null on a row the inventory created and that
  // no fabric operation has recorded yet. The newest row with a generation is the plugin's recorded fabric.
  @Column({ type: 'integer', name: 'fabric_generation', nullable: true })
  fabricGeneration!: number | null;

  @Column({ type: 'varchar', name: 'storage_instance_id', nullable: true })
  storageInstanceId!: string | null;

  @Column({ type: 'varchar', name: 'root_cert_fingerprint', nullable: true })
  rootCertFingerprint!: string | null;

  @Column({ type: 'varchar', name: 'recorded_at', nullable: true })
  recordedAt!: string | null;
}

@Entity({ name: 'plugin_matter_nodes' })
export class MatterNode {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  // --- protocol identity: sidecar-sourced, read-only for admins ---------------------------------------------------
  @Column({ type: 'varchar', name: 'fabric_ref' })
  fabricRef!: string;

  @Column({ type: 'varchar', name: 'node_id' })
  nodeId!: string;

  @Column({ type: 'integer', name: 'vendor_id', nullable: true })
  vendorId!: number | null;

  @Column({ type: 'integer', name: 'product_id', nullable: true })
  productId!: number | null;

  @Column({ type: 'varchar', name: 'vendor_name', nullable: true })
  vendorName!: string | null;

  @Column({ type: 'varchar', name: 'product_name', nullable: true })
  productName!: string | null;

  @Column({ type: 'varchar', name: 'serial_number', nullable: true })
  serialNumber!: string | null;

  @Column({ type: 'varchar', name: 'unique_id', nullable: true })
  uniqueId!: string | null;

  @Column({ type: 'integer', name: 'hardware_version', nullable: true })
  hardwareVersion!: number | null;

  @Column({ type: 'integer', name: 'software_version', nullable: true })
  softwareVersion!: number | null;

  @Column({ type: 'varchar', name: 'software_version_string', nullable: true })
  softwareVersionString!: string | null;

  @Column({ type: 'varchar', name: 'attestation_status', nullable: true })
  attestationStatus!: AttestationStatus | null;

  @Column({ type: 'varchar', name: 'attestation_checked_at', nullable: true })
  attestationCheckedAt!: string | null;

  // --- editable Attraccess metadata: reconciliation never writes these ---------------------------------------------
  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  // --- lifecycle ------------------------------------------------------------------------------------------------
  @Column({ type: 'varchar', name: 'lifecycle_state' })
  lifecycleState!: LifecycleState;

  @Column({ type: 'varchar', name: 'detached_reason', nullable: true })
  detachedReason!: DetachedReason | null;

  @Column({ type: 'boolean', nullable: true })
  reachable!: boolean | null;

  @Column({ type: 'varchar', name: 'first_seen_at' })
  firstSeenAt!: string;

  @Column({ type: 'varchar', name: 'last_seen_at' })
  lastSeenAt!: string;

  @Column({ type: 'varchar', name: 'claimed_at', nullable: true })
  claimedAt!: string | null;

  @Column({ type: 'integer', name: 'claimed_by', nullable: true })
  claimedBy!: number | null;

  @Column({ type: 'varchar', name: 'detached_at', nullable: true })
  detachedAt!: string | null;

  @Column({ type: 'varchar', name: 'archived_at', nullable: true })
  archivedAt!: string | null;

  @Column({ type: 'integer', name: 'archived_by', nullable: true })
  archivedBy!: number | null;

  @Column({ type: 'varchar', name: 'removed_at', nullable: true })
  removedAt!: string | null;

  @Column({ type: 'integer', name: 'removed_by', nullable: true })
  removedBy!: number | null;

  @Column({ type: 'varchar', name: 'removal_reason', nullable: true })
  removalReason!: RemovalReason | null;

  /** The plugin UUID of the record this one was merged into by a relink. */
  @Column({ type: 'varchar', name: 'merged_into', nullable: true })
  mergedInto!: string | null;

  @Column({ type: 'varchar', name: 'created_at' })
  createdAt!: string;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;
}

@Entity({ name: 'plugin_matter_endpoints' })
export class MatterEndpoint {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'node_ref' })
  nodeRef!: string;

  @Column({ type: 'integer', name: 'endpoint_id' })
  endpointId!: number;

  @Column({ type: 'integer', name: 'parent_endpoint_id', nullable: true })
  parentEndpointId!: number | null;

  /** JSON text: `[{ deviceTypeId, revision }]`. */
  @Column({ type: 'text', name: 'device_types' })
  deviceTypes!: string;

  /** The primary capability profile, derived from the server clusters. */
  @Column({ type: 'varchar' })
  profile!: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ type: 'boolean', nullable: true })
  bridged!: boolean | null;

  @Column({ type: 'varchar', name: 'bridged_unique_id', nullable: true })
  bridgedUniqueId!: string | null;

  @Column({ type: 'varchar', name: 'bridged_node_label', nullable: true })
  bridgedNodeLabel!: string | null;

  @Column({ type: 'varchar', name: 'bridged_vendor_name', nullable: true })
  bridgedVendorName!: string | null;

  @Column({ type: 'varchar', name: 'bridged_product_name', nullable: true })
  bridgedProductName!: string | null;

  @Column({ type: 'varchar', name: 'bridged_serial_number', nullable: true })
  bridgedSerialNumber!: string | null;

  @Column({ type: 'boolean', name: 'bridged_reachable', nullable: true })
  bridgedReachable!: boolean | null;

  @Column({ type: 'varchar', name: 'first_seen_at' })
  firstSeenAt!: string;

  @Column({ type: 'varchar', name: 'last_seen_at' })
  lastSeenAt!: string;

  @Column({ type: 'varchar', name: 'removed_at', nullable: true })
  removedAt!: string | null;

  @Column({ type: 'varchar', name: 'removal_reason', nullable: true })
  removalReason!: EndpointRemovalReason | null;
}

@Entity({ name: 'plugin_matter_endpoint_clusters' })
export class MatterEndpointCluster {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'endpoint_ref' })
  endpointRef!: string;

  @Column({ type: 'integer', name: 'cluster_id' })
  clusterId!: number;

  @Column({ type: 'varchar' })
  role!: ClusterRole;

  @Column({ type: 'integer', nullable: true })
  revision!: number | null;

  @Column({ type: 'integer', name: 'feature_map', nullable: true })
  featureMap!: number | null;

  /** JSON text: `number[]`. */
  @Column({ type: 'text', name: 'attribute_ids' })
  attributeIds!: string;

  /** JSON text: `number[]`. */
  @Column({ type: 'text', name: 'accepted_command_ids' })
  acceptedCommandIds!: string;

  @Column({ type: 'varchar', name: 'removed_at', nullable: true })
  removedAt!: string | null;
}

@Entity({ name: 'plugin_matter_endpoint_capabilities' })
export class MatterEndpointCapability {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'endpoint_ref' })
  endpointRef!: string;

  @Column({ type: 'varchar' })
  capability!: string;

  @Column({ type: 'integer', name: 'source_cluster_id' })
  sourceClusterId!: number;

  /** JSON text, such as feature flags. */
  @Column({ type: 'text' })
  details!: string;
}

@Entity({ name: 'plugin_matter_endpoint_state' })
export class MatterEndpointState {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', name: 'endpoint_ref' })
  endpointRef!: string;

  /** `<capability>.<attribute>`, such as `onOff.onOff`. */
  @Column({ type: 'varchar', name: 'state_key' })
  stateKey!: string;

  // --- reported ---------------------------------------------------------------------------------------------------
  @Column({ type: 'text', name: 'reported_value', nullable: true })
  reportedValue!: string | null;

  @Column({ type: 'varchar', name: 'reported_at', nullable: true })
  reportedAt!: string | null;

  @Column({ type: 'varchar', name: 'received_at', nullable: true })
  receivedAt!: string | null;

  @Column({ type: 'varchar', nullable: true })
  source!: StateSource | null;

  @Column({ type: 'varchar', nullable: true })
  quality!: StateQuality | null;

  @Column({ type: 'integer', name: 'stale_after_ms' })
  staleAfterMs!: number;

  // --- requested / command ---------------------------------------------------------------------------------------
  @Column({ type: 'text', name: 'requested_value', nullable: true })
  requestedValue!: string | null;

  @Column({ type: 'varchar', name: 'requested_at', nullable: true })
  requestedAt!: string | null;

  @Column({ type: 'integer', name: 'requested_by', nullable: true })
  requestedBy!: number | null;

  @Column({ type: 'varchar', name: 'request_id', nullable: true })
  requestId!: string | null;

  @Column({ type: 'varchar', name: 'correlation_id', nullable: true })
  correlationId!: string | null;

  @Column({ type: 'varchar', name: 'command_state' })
  commandState!: CommandState;

  @Column({ type: 'varchar', name: 'accepted_at', nullable: true })
  acceptedAt!: string | null;

  @Column({ type: 'varchar', name: 'command_reported_at', nullable: true })
  commandReportedAt!: string | null;

  // --- external change -------------------------------------------------------------------------------------------
  @Column({ type: 'varchar', name: 'external_change_at', nullable: true })
  externalChangeAt!: string | null;

  @Column({ type: 'text', name: 'external_change_value', nullable: true })
  externalChangeValue!: string | null;

  // --- fault -----------------------------------------------------------------------------------------------------
  @Column({ type: 'varchar', name: 'fault_code', nullable: true })
  faultCode!: string | null;

  @Column({ type: 'varchar', name: 'fault_message', nullable: true })
  faultMessage!: string | null;

  @Column({ type: 'varchar', name: 'fault_at', nullable: true })
  faultAt!: string | null;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;
}

@Entity({ name: 'plugin_matter_commands' })
export class MatterCommand {
  @PrimaryColumn({ type: 'varchar', name: 'request_id' })
  requestId!: string;

  @Column({ type: 'varchar', name: 'endpoint_ref' })
  endpointRef!: string;

  @Column({ type: 'integer', name: 'cluster_id' })
  clusterId!: number;

  @Column({ type: 'integer', name: 'command_id' })
  commandId!: number;

  @Column({ type: 'varchar', name: 'state_key', nullable: true })
  stateKey!: string | null;

  @Column({ type: 'varchar', name: 'requested_at' })
  requestedAt!: string;

  @Column({ type: 'integer', name: 'requested_by', nullable: true })
  requestedBy!: number | null;

  @Column({ type: 'varchar', name: 'correlation_id', nullable: true })
  correlationId!: string | null;

  @Column({ type: 'varchar' })
  outcome!: string;

  @Column({ type: 'varchar', name: 'accepted_at', nullable: true })
  acceptedAt!: string | null;

  @Column({ type: 'varchar', name: 'reported_at', nullable: true })
  reportedAt!: string | null;

  @Column({ type: 'varchar', name: 'failure_code', nullable: true })
  failureCode!: string | null;
}

/** The singleton row describing the last reconciliation run. */
export const RECONCILIATION_ROW_ID = 1;

@Entity({ name: 'plugin_matter_reconciliation_status' })
export class MatterReconciliationStatus {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar', name: 'last_started_at', nullable: true })
  lastStartedAt!: string | null;

  @Column({ type: 'varchar', name: 'last_finished_at', nullable: true })
  lastFinishedAt!: string | null;

  @Column({ type: 'varchar', name: 'last_result', nullable: true })
  lastResult!: ReconciliationResult | null;

  /** JSON text: counts. */
  @Column({ type: 'text', name: 'last_summary', nullable: true })
  lastSummary!: string | null;

  @Column({ type: 'varchar', name: 'sidecar_fabric_id', nullable: true })
  sidecarFabricId!: string | null;
}

export const DEVICE_ENTITIES = [
  MatterFabric,
  MatterNode,
  MatterEndpoint,
  MatterEndpointCluster,
  MatterEndpointCapability,
  MatterEndpointState,
  MatterCommand,
  MatterReconciliationStatus,
];
