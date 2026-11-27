import { f, table } from '@attraccess/plugins-backend-sdk';

/**
 * Head shape of the WAGO plugin tables. Baseline version 1 of the storage definition creates exactly this layout,
 * which is what the nineteen 1.x TypeORM migrations produced; installed databases are adopted without running DDL.
 *
 * Conventions kept from the 1.x layout (adoption must not change a column):
 * - Field names are the entity property names, `column` is the existing snake_case column.
 * - Timestamps are ISO-8601 strings in `varchar` columns, compared lexicographically (so `f.string`, not `f.timestamp`).
 * - Snapshots, provenance and metadata are JSON documents in `text` columns, serialized by the plugin (so `f.text`).
 * - Text that can exceed 255 characters (free-form text, values reported by a controller or set by an administrator
 *   without a length check) is declared `f.text`; the legacy `varchar` columns are unbounded and the 1.x SQLite database gave both
 *   the same TEXT affinity, so adoption is unaffected.
 * - Core identifiers (MQTT server ids, user ids) are plain integers. Only plugin tables are referenced.
 * - Controller sequences are `decimal(15, 0)` strings: a runtime announces `Date.now()`, beyond PostgreSQL's 32-bit
 *   `integer` that baseline version 1 declared (storage version 3 replaces the column).
 * - Lease deadlines are `f.timestamp` (null when no lease is held). Baseline version 1 declared them as epoch
 *   milliseconds in `f.integer` columns, which PostgreSQL creates as 32-bit `integer`, too small for a deadline;
 *   version 2 replaces those columns (see `wagoBaselineTables` and the storage definition).
 */
export const wagoTables = {
  controllers: table(
    {
      id: f.id(),
      /** Reported by the controller without a length limit. */
      hardwareId: f.text({ column: 'hardware_id' }),
      trustState: f.string({ column: 'trust_state' }),
      name: f.text().optional(),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }).optional(),
      /** Durable permanent-identity provisioning intent, retained until confirmed revocation. */
      credentialMqttServerId: f.integer({ column: 'credential_mqtt_server_id' }).optional(),
      /** Changes whenever permanent broker credentials are issued, binding later rotations to that claim. */
      credentialEpoch: f.string({ column: 'credential_epoch' }).optional(),
      enrollmentId: f.integer({ column: 'enrollment_id' }).optional(),
      pairingCodeHash: f.string({ column: 'pairing_code_hash' }),
      /** Fingerprint, protocol and runtime version come from the controller's announcement, without a length limit. */
      fingerprint: f.text().optional(),
      protocolVersion: f.text({ column: 'protocol_version' }),
      runtimeVersion: f.text({ column: 'runtime_version' }),
      /** JSON array of capability names. */
      capabilities: f.text(),
      /** Discovery announces epoch milliseconds (see storage version 3); the protocol caps sequences at 15 digits. */
      lastSequence: f.decimal(15, 0, { column: 'last_sequence' }).withDefault('0'),
      lastHeartbeatAt: f.string({ column: 'last_heartbeat_at' }).optional(),
      lastSeenAt: f.string({ column: 'last_seen_at' }),
      compatibilityError: f.text({ column: 'compatibility_error' }).optional(),
      createdAt: f.string({ column: 'created_at' }),
      updatedAt: f.string({ column: 'updated_at' }),
    },
    {
      physicalName: 'plugin_wago_controllers',
      indexes: [{ name: 'UQ_plugin_wago_controllers_hardware_id', fields: ['hardwareId'], unique: true }],
    },
  ),
  settings: table(
    {
      id: f.id(),
      defaultMqttServerId: f.integer({ column: 'default_mqtt_server_id' }).optional(),
      /** Set by an administrator; only its MQTT segments are validated. */
      operationalPrefix: f.text({ column: 'operational_prefix' }).withDefault('attraccess/wago'),
    },
    { physicalName: 'plugin_wago_settings' },
  ),
  enrollments: table(
    {
      id: f.id(),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }),
      hardwareId: f.text({ column: 'hardware_id' }),
      secretHash: f.string({ column: 'secret_hash' }),
      identity: f.string(),
      createdAt: f.string({ column: 'created_at' }),
      expiresAt: f.string({ column: 'expires_at' }),
      consumedAt: f.string({ column: 'consumed_at' }).optional(),
      revokedAt: f.string({ column: 'revoked_at' }).optional(),
    },
    {
      physicalName: 'plugin_wago_enrollments',
      indexes: [
        { name: 'UQ_plugin_wago_enrollments_secret_hash', fields: ['secretHash'], unique: true },
        { name: 'IDX_plugin_wago_enrollments_active', fields: ['consumedAt', 'expiresAt'] },
      ],
    },
  ),
  configurationDrafts: table(
    {
      id: f.id(),
      controllerId: f.integer({ column: 'controller_id' }),
      snapshot: f.text(),
      reviewedHash: f.string({ column: 'reviewed_hash' }).optional(),
      presetProvenance: f.text({ column: 'preset_provenance' }).optional(),
      updatedAt: f.string({ column: 'updated_at' }),
    },
    {
      physicalName: 'plugin_wago_configuration_drafts',
      indexes: [{ name: 'UQ_plugin_wago_configuration_drafts_controller_id', fields: ['controllerId'], unique: true }],
    },
  ),
  configurationRevisions: table(
    {
      id: f.id(),
      controllerId: f.integer({ column: 'controller_id' }),
      revision: f.integer(),
      snapshot: f.text(),
      presetProvenance: f.text({ column: 'preset_provenance' }).optional(),
      contentHash: f.string({ column: 'content_hash' }),
      state: f.string(),
      rejectionErrors: f.text({ column: 'rejection_errors' }).optional(),
      rejectionAcknowledgedAt: f.string({ column: 'rejection_acknowledged_at' }).optional(),
      /** Core user id of the acknowledging user. */
      rejectionAcknowledgedBy: f.integer({ column: 'rejection_acknowledged_by' }).optional(),
      publishedAt: f.string({ column: 'published_at' }),
      reportedAt: f.string({ column: 'reported_at' }).optional(),
    },
    {
      physicalName: 'plugin_wago_configuration_revisions',
      indexes: [
        {
          name: 'UQ_plugin_wago_configuration_revisions_controller_revision',
          fields: ['controllerId', 'revision'],
          unique: true,
        },
        { name: 'IDX_plugin_wago_configuration_revisions_controller', fields: ['controllerId', 'revision'] },
      ],
    },
  ),
  commissioningSessions: table(
    {
      id: f.id(),
      hardwareId: f.string({ column: 'hardware_id' }),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }),
      targetHost: f.string({ column: 'target_host' }),
      hostKeyFingerprint: f.string({ column: 'host_key_fingerprint' }),
      /** From the operator's WAGO_CC100_FIRMWARE_BASELINE setting. */
      firmwareBaseline: f.text({ column: 'firmware_baseline' }),
      controllerName: f.text({ column: 'controller_name' }).optional(),
      state: f.string(),
      enrollmentExpiresAt: f.string({ column: 'enrollment_expires_at' }).optional(),
      enrollmentId: f.integer({ column: 'enrollment_id' }).optional(),
      pairingCode: f.string({ column: 'pairing_code' }).optional(),
      deliveryToken: f.string({ column: 'delivery_token' }).optional(),
      /** JSON document of the initiating principal. */
      initiatingPrincipal: f.text({ column: 'initiating_principal' }).optional(),
      /** Last attempted delivery's digest for observation only; never used to choose the next bundle. */
      runtimeArtifactDigest: f.string({ column: 'runtime_artifact_digest' }).optional(),
      managementControllerId: f.integer({ column: 'management_controller_id' }).optional(),
      dockerProvisionToken: f.string({ column: 'docker_provision_token' }).optional(),
      dockerProvisionState: f.string({ column: 'docker_provision_state' }).optional(),
      platformReport: f.text({ column: 'platform_report' }).optional(),
      codesysState: f.string({ column: 'codesys_state' }).optional(),
      progressPercent: f.integer({ column: 'progress_percent' }).optional(),
      progressStep: f.string({ column: 'progress_step' }).optional(),
      progressDetail: f.text({ column: 'progress_detail' }).optional(),
      auditLog: f.text({ column: 'audit_log' }),
      failureReason: f.text({ column: 'failure_reason' }).optional(),
      createdAt: f.string({ column: 'created_at' }),
      updatedAt: f.string({ column: 'updated_at' }),
    },
    { physicalName: 'plugin_wago_commissioning_sessions' },
  ),
  /** New enrolments only. Never serialize this row or its encrypted envelope. */
  managedAccess: table(
    {
      sessionId: f.integer({ column: 'session_id' }),
      controllerId: f.integer({ column: 'controller_id' }).optional(),
      host: f.string(),
      fingerprint: f.string(),
      token: f.string(),
      state: f.string(),
      encryptedCredentials: f.text({ column: 'encrypted_credentials' }),
      keyFingerprint: f.string({ column: 'key_fingerprint' }),
    },
    {
      physicalName: 'plugin_wago_managed_access',
      primaryKey: ['sessionId'],
      indexes: [{ name: 'wago_managed_controller', fields: ['controllerId'] }],
    },
  ),
  runtimeUpdates: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      metadata: f.text().optional(),
    },
    { physicalName: 'plugin_wago_runtime_updates', primaryKey: ['controllerId'] },
  ),
  /** Shared by commissioning, managed SSH and updates; keyed by pinned device identity. */
  deviceOperations: table(
    {
      fingerprint: f.string(),
      owner: f.string().optional(),
      leaseUntil: f.timestamp({ column: 'lease_until' }).optional(),
    },
    { physicalName: 'plugin_wago_device_operations', primaryKey: ['fingerprint'] },
  ),
  /** Never return this row from an API. */
  management: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      metadataJson: f.text({ column: 'metadata_json' }).optional(),
      encryptedPrivateKey: f.text({ column: 'encrypted_private_key' }).optional(),
      leaseOwner: f.string({ column: 'lease_owner' }).optional(),
      leaseUntil: f.timestamp({ column: 'lease_until' }).optional(),
    },
    { physicalName: 'plugin_wago_management', primaryKey: ['controllerId'] },
  ),
  /** Never expose this recovery record through an API. */
  credentialRotations: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      revision: f.integer(),
      credentialEpoch: f.string({ column: 'credential_epoch' }),
      phase: f.string(),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }),
      /** The operational prefix the rotation was issued for. */
      prefix: f.text(),
      token: f.string(),
      encryptedCredentials: f.text({ column: 'encrypted_credentials' }).optional(),
    },
    {
      physicalName: 'plugin_wago_credential_rotations',
      primaryKey: ['controllerId'],
      foreignKeys: [
        { fields: ['controllerId'], references: 'controllers', referencedFields: ['id'], onDelete: 'cascade' },
      ],
    },
  ),
  /** Durable roll-forward intent. Only an explicit public projection may leave the backend. */
  networkChanges: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      sessionId: f.integer({ column: 'session_id' }),
      fingerprint: f.string(),
      targetHost: f.string({ column: 'target_host' }),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }).optional(),
      phase: f.string(),
      failure: f.text().optional(),
      encryptedPayload: f.text({ column: 'encrypted_payload' }).optional(),
      updatedAt: f.string({ column: 'updated_at' }),
    },
    {
      physicalName: 'plugin_wago_network_changes',
      primaryKey: ['controllerId'],
      foreignKeys: [
        { fields: ['controllerId'], references: 'controllers', referencedFields: ['id'], onDelete: 'cascade' },
      ],
    },
  ),
  /**
   * Retain the old identity's broker association when it cannot be contacted. Migration success never relies on
   * revocation through an unreachable broker.
   */
  mqttCredentialRetirements: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      mqttServerId: f.integer({ column: 'mqtt_server_id' }),
    },
    {
      physicalName: 'plugin_wago_mqtt_credential_retirements',
      primaryKey: ['controllerId', 'mqttServerId'],
      foreignKeys: [
        { fields: ['controllerId'], references: 'controllers', referencedFields: ['id'], onDelete: 'cascade' },
      ],
    },
  ),
};

/** The lease deadline column that storage version 2 puts in place of the baseline's integer one. */
export const wagoLeaseDeadlineField = wagoTables.deviceOperations.fields.leaseUntil;

/** The controller sequence column that storage version 3 puts in place of the baseline's integer one. */
export const wagoControllerSequenceField = wagoTables.controllers.fields.lastSequence;

/**
 * Baseline version 1 exactly as released: both lease deadlines and the controller sequence were integers with default
 * 0. Adoption of a 1.x database and fresh installs create this layout first; versions 2 and 3 then replace those
 * columns.
 */
export const wagoBaselineTables = {
  ...wagoTables,
  controllers: {
    ...wagoTables.controllers,
    fields: {
      ...wagoTables.controllers.fields,
      lastSequence: f.integer({ column: 'last_sequence' }).withDefault(0),
    },
  },
  deviceOperations: table(
    {
      fingerprint: f.string(),
      owner: f.string().optional(),
      leaseUntil: f.integer({ column: 'lease_until' }).withDefault(0),
    },
    { physicalName: 'plugin_wago_device_operations', primaryKey: ['fingerprint'] },
  ),
  management: table(
    {
      controllerId: f.integer({ column: 'controller_id' }),
      metadataJson: f.text({ column: 'metadata_json' }).optional(),
      encryptedPrivateKey: f.text({ column: 'encrypted_private_key' }).optional(),
      leaseOwner: f.string({ column: 'lease_owner' }).optional(),
      leaseUntil: f.integer({ column: 'lease_until' }).withDefault(0),
    },
    { physicalName: 'plugin_wago_management', primaryKey: ['controllerId'] },
  ),
};
