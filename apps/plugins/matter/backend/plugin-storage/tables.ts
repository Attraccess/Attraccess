// The Matter plugin's own tables, declared in the backend-neutral schema of the plugin storage contract.
//
// Baseline version 1 is the exact layout the three 1.x TypeORM migrations produced (physical table and column names,
// types, nullability, defaults, plain and unique indexes), so an installed database is adopted without running
// anything. Conventions of that layout, kept as they are:
//   - Timestamps are ISO-8601 strings in varchar columns, so they are `string` fields (not `timestamp`).
//   - JSON documents are JSON text in text columns (`text` fields); the code serializes them itself.
//   - An unbounded legacy `varchar` that can receive more than 255 characters is a `text` field (SQLite stores both
//     as TEXT, so adoption is unaffected); the bounded `string` default would refuse the write.
//   - Matter 64-bit IDs are decimal strings. There is no column that relates a Matter record to an Attraccess
//     resource or user table; user IDs are plain integers.
//   - History is kept: nothing is deleted by cascade, so there are no foreign keys between the tables.
// What the neutral schema cannot express (and the code therefore enforces in its transactions) is listed in
// `LEGACY_ONLY_CONSTRAINTS` at the end.
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

/** Physical-name shorthand: the existing `plugin_matter_*` table. */
const physical = (name: string) => `plugin_matter_${name}`;

/** The ISO-8601 timestamp (varchar) of a legacy column. */
const iso = (column: string) => f.string({ column });

const connection = table(
  {
    id: f.integer(),
    // Validation allows URLs up to 2048 characters (connection/validation.ts); the legacy column is unbounded.
    url: f.text(),
    encryptedCredential: f.text({ column: 'encrypted_credential' }),
    caCertificate: f.text({ column: 'ca_certificate' }).optional(),
    credentialUpdatedAt: iso('credential_updated_at'),
    updatedAt: iso('updated_at'),
    updatedBy: f.integer({ column: 'updated_by' }).optional(),
  },
  { primaryKey: ['id'], physicalName: physical('connection') },
);

const fabrics = table(
  {
    id: f.string(),
    fabricId: f.string({ column: 'fabric_id' }),
    label: f.string().optional(),
    firstSeenAt: iso('first_seen_at'),
    lastSeenAt: iso('last_seen_at'),
    status: f.string(),
    retiredAt: iso('retired_at').optional(),
    fabricGeneration: f.integer({ column: 'fabric_generation' }).optional(),
    storageInstanceId: f.string({ column: 'storage_instance_id' }).optional(),
    rootCertFingerprint: f.string({ column: 'root_cert_fingerprint' }).optional(),
    recordedAt: iso('recorded_at').optional(),
  },
  { primaryKey: ['id'], physicalName: physical('fabrics') },
);

const nodes = table(
  {
    id: f.string(),
    fabricRef: f.string({ column: 'fabric_ref' }),
    nodeId: f.string({ column: 'node_id' }),
    vendorId: f.integer({ column: 'vendor_id' }).optional(),
    productId: f.integer({ column: 'product_id' }).optional(),
    vendorName: f.string({ column: 'vendor_name' }).optional(),
    productName: f.string({ column: 'product_name' }).optional(),
    serialNumber: f.string({ column: 'serial_number' }).optional(),
    uniqueId: f.string({ column: 'unique_id' }).optional(),
    hardwareVersion: f.integer({ column: 'hardware_version' }).optional(),
    softwareVersion: f.integer({ column: 'software_version' }).optional(),
    softwareVersionString: f.string({ column: 'software_version_string' }).optional(),
    attestationStatus: f.string({ column: 'attestation_status' }).optional(),
    attestationCheckedAt: iso('attestation_checked_at').optional(),
    displayName: f.string({ length: 100, column: 'display_name' }).optional(),
    description: f.string({ length: 500 }).optional(),
    location: f.string({ length: 100 }).optional(),
    lifecycleState: f.string({ column: 'lifecycle_state' }),
    detachedReason: f.string({ column: 'detached_reason' }).optional(),
    reachable: f.boolean().optional(),
    firstSeenAt: iso('first_seen_at'),
    lastSeenAt: iso('last_seen_at'),
    claimedAt: iso('claimed_at').optional(),
    claimedBy: f.integer({ column: 'claimed_by' }).optional(),
    detachedAt: iso('detached_at').optional(),
    archivedAt: iso('archived_at').optional(),
    archivedBy: f.integer({ column: 'archived_by' }).optional(),
    removedAt: iso('removed_at').optional(),
    removedBy: f.integer({ column: 'removed_by' }).optional(),
    removalReason: f.string({ column: 'removal_reason' }).optional(),
    mergedInto: f.string({ column: 'merged_into' }).optional(),
    createdAt: iso('created_at'),
    updatedAt: iso('updated_at'),
  },
  {
    primaryKey: ['id'],
    indexes: [{ name: 'IDX_plugin_matter_nodes_lifecycle', fields: ['lifecycleState'] }],
    physicalName: physical('nodes'),
  },
);

const endpoints = table(
  {
    id: f.string(),
    nodeRef: f.string({ column: 'node_ref' }),
    endpointId: f.integer({ column: 'endpoint_id' }),
    parentEndpointId: f.integer({ column: 'parent_endpoint_id' }).optional(),
    deviceTypes: f.text({ column: 'device_types' }),
    profile: f.string(),
    displayName: f.string({ length: 100, column: 'display_name' }).optional(),
    description: f.string({ length: 500 }).optional(),
    location: f.string({ length: 100 }).optional(),
    bridged: f.boolean().optional(),
    bridgedUniqueId: f.string({ column: 'bridged_unique_id' }).optional(),
    bridgedNodeLabel: f.string({ column: 'bridged_node_label' }).optional(),
    bridgedVendorName: f.string({ column: 'bridged_vendor_name' }).optional(),
    bridgedProductName: f.string({ column: 'bridged_product_name' }).optional(),
    bridgedSerialNumber: f.string({ column: 'bridged_serial_number' }).optional(),
    bridgedReachable: f.boolean({ column: 'bridged_reachable' }).optional(),
    firstSeenAt: iso('first_seen_at'),
    lastSeenAt: iso('last_seen_at'),
    removedAt: iso('removed_at').optional(),
    removalReason: f.string({ column: 'removal_reason' }).optional(),
  },
  { primaryKey: ['id'], physicalName: physical('endpoints') },
);

const endpointClusters = table(
  {
    id: f.string(),
    endpointRef: f.string({ column: 'endpoint_ref' }),
    clusterId: f.integer({ column: 'cluster_id' }),
    role: f.string(),
    revision: f.integer().optional(),
    featureMap: f.integer({ column: 'feature_map' }).optional(),
    attributeIds: f.text({ column: 'attribute_ids' }),
    acceptedCommandIds: f.text({ column: 'accepted_command_ids' }),
    removedAt: iso('removed_at').optional(),
  },
  { primaryKey: ['id'], physicalName: physical('endpoint_clusters') },
);

const endpointCapabilities = table(
  {
    id: f.string(),
    endpointRef: f.string({ column: 'endpoint_ref' }),
    capability: f.string(),
    sourceClusterId: f.integer({ column: 'source_cluster_id' }),
    details: f.text(),
  },
  {
    primaryKey: ['id'],
    indexes: [{ name: 'UQ_plugin_matter_endpoint_capabilities', fields: ['endpointRef', 'capability'], unique: true }],
    physicalName: physical('endpoint_capabilities'),
  },
);

const endpointState = table(
  {
    id: f.string(),
    endpointRef: f.string({ column: 'endpoint_ref' }),
    stateKey: f.string({ column: 'state_key' }),
    reportedValue: f.text({ column: 'reported_value' }).optional(),
    reportedAt: iso('reported_at').optional(),
    receivedAt: iso('received_at').optional(),
    source: f.string().optional(),
    quality: f.string().optional(),
    staleAfterMs: f.integer({ column: 'stale_after_ms' }).withDefault(600_000),
    requestedValue: f.text({ column: 'requested_value' }).optional(),
    requestedAt: iso('requested_at').optional(),
    requestedBy: f.integer({ column: 'requested_by' }).optional(),
    requestId: f.string({ column: 'request_id' }).optional(),
    correlationId: f.string({ column: 'correlation_id' }).optional(),
    commandState: f.string({ column: 'command_state' }).withDefault('none'),
    acceptedAt: iso('accepted_at').optional(),
    commandReportedAt: iso('command_reported_at').optional(),
    externalChangeAt: iso('external_change_at').optional(),
    externalChangeValue: f.text({ column: 'external_change_value' }).optional(),
    faultCode: f.string({ column: 'fault_code' }).optional(),
    // The sidecar reports fault messages of up to 256 characters (matter-contract `device.state`).
    faultMessage: f.text({ column: 'fault_message' }).optional(),
    faultAt: iso('fault_at').optional(),
    updatedAt: iso('updated_at'),
  },
  {
    primaryKey: ['id'],
    indexes: [{ name: 'UQ_plugin_matter_endpoint_state_key', fields: ['endpointRef', 'stateKey'], unique: true }],
    physicalName: physical('endpoint_state'),
  },
);

const commands = table(
  {
    requestId: f.string({ column: 'request_id' }),
    endpointRef: f.string({ column: 'endpoint_ref' }),
    clusterId: f.integer({ column: 'cluster_id' }),
    commandId: f.integer({ column: 'command_id' }),
    stateKey: f.string({ column: 'state_key' }).optional(),
    requestedAt: iso('requested_at'),
    requestedBy: f.integer({ column: 'requested_by' }).optional(),
    correlationId: f.string({ column: 'correlation_id' }).optional(),
    outcome: f.string(),
    acceptedAt: iso('accepted_at').optional(),
    reportedAt: iso('reported_at').optional(),
    failureCode: f.string({ column: 'failure_code' }).optional(),
  },
  {
    primaryKey: ['requestId'],
    indexes: [{ name: 'IDX_plugin_matter_commands_requested_at', fields: ['requestedAt', 'requestId'] }],
    physicalName: physical('commands'),
  },
);

const reconciliationStatus = table(
  {
    id: f.integer(),
    lastStartedAt: iso('last_started_at').optional(),
    lastFinishedAt: iso('last_finished_at').optional(),
    lastResult: f.string({ column: 'last_result' }).optional(),
    lastSummary: f.text({ column: 'last_summary' }).optional(),
    sidecarFabricId: f.string({ column: 'sidecar_fabric_id' }).optional(),
  },
  { primaryKey: ['id'], physicalName: physical('reconciliation_status') },
);

const recoveryKeys = table(
  {
    id: f.string(),
    keyId: f.string({ column: 'key_id' }),
    encryptedKey: f.text({ column: 'encrypted_key' }),
    createdAt: iso('created_at'),
    acknowledgedAt: iso('acknowledged_at').optional(),
    retiredAt: iso('retired_at').optional(),
  },
  {
    primaryKey: ['id'],
    indexes: [{ name: 'UQ_plugin_matter_recovery_keys_key_id', fields: ['keyId'], unique: true }],
    physicalName: physical('recovery_keys'),
  },
);

const backups = table(
  {
    id: f.string(),
    createdAt: iso('created_at'),
    trigger: f.string(),
    actor: f.integer().optional(),
    outcome: f.string(),
    reason: f.string().optional(),
    sizeBytes: f.integer({ column: 'size_bytes' }).optional(),
    sha256: f.string().optional(),
    formatVersion: f.integer({ column: 'format_version' }).optional(),
    pluginVersion: f.string({ column: 'plugin_version' }).optional(),
    sidecarVersion: f.string({ column: 'sidecar_version' }).optional(),
    matterJsVersion: f.string({ column: 'matter_js_version' }).optional(),
    storageSchemaVersion: f.integer({ column: 'storage_schema_version' }).optional(),
    pluginMigration: f.string({ column: 'plugin_migration' }).optional(),
    fabricId: f.string({ column: 'fabric_id' }).optional(),
    rootCertFingerprint: f.string({ column: 'root_cert_fingerprint' }).optional(),
    fabricGeneration: f.integer({ column: 'fabric_generation' }).optional(),
    storageInstanceId: f.string({ column: 'storage_instance_id' }).optional(),
    recoveryKeyId: f.string({ column: 'recovery_key_id' }).optional(),
    consistent: f.boolean().optional(),
    // The encrypted backup file, base64 in text: the neutral schema has no binary type, and the legacy column is a
    // `blob`. Rows written by 1.x hold raw bytes there; `plugin-storage/blob.ts` reads both.
    blob: f.text().optional(),
  },
  {
    primaryKey: ['id'],
    indexes: [{ name: 'IDX_plugin_matter_backups_created_at', fields: ['createdAt'] }],
    physicalName: physical('backups'),
  },
);

export const MATTER_TABLES = {
  connection,
  fabrics,
  nodes,
  endpoints,
  endpointClusters,
  endpointCapabilities,
  endpointState,
  commands,
  reconciliationStatus,
  recoveryKeys,
  backups,
};

/** Class names of every TypeORM migration the 1.x plugin shipped, in order. */
export const LEGACY_MIGRATIONS = [
  'CreateMatterConnection1793900000000',
  'CreateMatterDeviceModel1793900001000',
  'CreateMatterBackup1793900002000',
] as const;

/**
 * Constraints of the 1.x layout the neutral schema cannot express. Installed databases keep them (the tables are
 * adopted as they are); new installations do not get them, so the plugin enforces each one in code, inside the
 * transaction that writes. Listed so the baseline test can tell a deliberate gap from an accidental one.
 */
export const LEGACY_ONLY_CONSTRAINTS = {
  partialUniqueIndexes: [
    'UQ_plugin_matter_fabrics_live',
    'UQ_plugin_matter_nodes_live_identity',
    'UQ_plugin_matter_endpoints_live',
    'UQ_plugin_matter_endpoint_clusters_live',
    'UQ_plugin_matter_recovery_keys_current',
  ],
  checkConstraints: [
    'CHK_plugin_matter_connection_singleton',
    'CHK_plugin_matter_fabrics_status',
    'CHK_plugin_matter_nodes_lifecycle',
    'CHK_plugin_matter_nodes_detached_reason',
    'CHK_plugin_matter_nodes_removal_reason',
    'CHK_plugin_matter_nodes_attestation',
    'CHK_plugin_matter_endpoints_range',
    'CHK_plugin_matter_endpoints_removal_reason',
    'CHK_plugin_matter_endpoint_clusters_role',
    'CHK_plugin_matter_endpoint_state_command',
    'CHK_plugin_matter_endpoint_state_quality',
    'CHK_plugin_matter_endpoint_state_source',
    'CHK_plugin_matter_commands_outcome',
    'CHK_plugin_matter_reconciliation_status_singleton',
    'CHK_plugin_matter_reconciliation_status_result',
    'CHK_plugin_matter_backups_outcome',
    'CHK_plugin_matter_backups_trigger',
  ],
  columnTypeDeviations: { plugin_matter_backups: { blob: 'blob stored as text (base64)' } },
} as const;

export const MATTER_STORAGE = definePluginStorage({
  tables: MATTER_TABLES,
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: Object.entries(MATTER_TABLES).map(([name, definition]) => step.createTable(name, definition)),
    },
  ],
  adoption: { legacyMigrations: LEGACY_MIGRATIONS },
});
