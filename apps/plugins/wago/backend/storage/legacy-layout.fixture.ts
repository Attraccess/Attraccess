/**
 * The SQL of the nineteen 1.x TypeORM migrations (their `up` methods, verbatim apart from the conditional guards of
 * the credential-rotation migration), keyed by class name in execution order. Tests replay it to obtain the schema an
 * installed 1.x database has and compare it with the declared baseline. The migrations themselves were deleted with
 * the TypeORM entities; this file is the only record of the layout adoption has to match.
 */
export const WAGO_LEGACY_MIGRATION_SQL: ReadonlyArray<readonly [name: string, statements: readonly string[]]> = [
  [
    'CreateWagoControllers1780000000000',
    [
      `CREATE TABLE IF NOT EXISTS "plugin_wago_controllers" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardware_id" varchar NOT NULL,
      "trust_state" varchar NOT NULL, "name" varchar, "mqtt_server_id" integer, "enrollment_id" integer,
      "pairing_code_hash" varchar NOT NULL, "fingerprint" varchar,
      "protocol_version" varchar NOT NULL, "runtime_version" varchar NOT NULL,
      "capabilities" varchar NOT NULL, "last_sequence" integer NOT NULL DEFAULT (0),
      "last_heartbeat_at" varchar, "last_seen_at" varchar NOT NULL,
      "compatibility_error" varchar, "created_at" varchar NOT NULL, "updated_at" varchar NOT NULL,
      CONSTRAINT "UQ_plugin_wago_controllers_hardware_id" UNIQUE ("hardware_id"))`,
      `CREATE TABLE IF NOT EXISTS "plugin_wago_settings" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "default_mqtt_server_id" integer)`,
      `CREATE TABLE IF NOT EXISTS "plugin_wago_enrollments" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mqtt_server_id" integer NOT NULL, "hardware_id" varchar NOT NULL,
      "secret_hash" varchar NOT NULL, "identity" varchar NOT NULL, "created_at" varchar NOT NULL,
      "expires_at" varchar NOT NULL, "consumed_at" varchar, CONSTRAINT "UQ_plugin_wago_enrollments_secret_hash" UNIQUE ("secret_hash"))`,
      'CREATE INDEX IF NOT EXISTS "IDX_plugin_wago_enrollments_active" ON "plugin_wago_enrollments" ("consumed_at", "expires_at")',
    ],
  ],
  [
    'AddWagoEnrollmentRevocation1780000000001',
    ['ALTER TABLE "plugin_wago_enrollments" ADD COLUMN "revoked_at" varchar'],
  ],
  [
    'AddWagoConfigurationRevisions1780000000002',
    [
      'ALTER TABLE "plugin_wago_settings" ADD COLUMN "operational_prefix" varchar NOT NULL DEFAULT (\'attraccess/wago\')',
      `CREATE TABLE "plugin_wago_configuration_drafts" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "controller_id" integer NOT NULL,
      "snapshot" text NOT NULL, "reviewed_hash" varchar, "updated_at" varchar NOT NULL,
      CONSTRAINT "UQ_plugin_wago_configuration_drafts_controller_id" UNIQUE ("controller_id"))`,
      `CREATE TABLE "plugin_wago_configuration_revisions" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "controller_id" integer NOT NULL,
      "revision" integer NOT NULL, "snapshot" text NOT NULL, "content_hash" varchar NOT NULL,
      "state" varchar NOT NULL, "rejection_errors" text, "published_at" varchar NOT NULL, "reported_at" varchar,
      CONSTRAINT "UQ_plugin_wago_configuration_revisions_controller_revision" UNIQUE ("controller_id", "revision"))`,
      'CREATE INDEX "IDX_plugin_wago_configuration_revisions_controller" ON "plugin_wago_configuration_revisions" ("controller_id", "revision")',
    ],
  ],
  [
    'AddWagoPresetProvenance1780000000003',
    ['ALTER TABLE "plugin_wago_configuration_drafts" ADD COLUMN "preset_provenance" text'],
  ],
  [
    'AddWagoCommissioningSessions1780000000004',
    [
      `CREATE TABLE IF NOT EXISTS "plugin_wago_commissioning_sessions" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardware_id" varchar NOT NULL,
      "mqtt_server_id" integer NOT NULL, "target_host" varchar NOT NULL,
      "host_key_fingerprint" varchar NOT NULL, "firmware_baseline" varchar NOT NULL,
      "state" varchar NOT NULL, "enrollment_expires_at" varchar, "codesys_state" varchar,
      "audit_log" varchar NOT NULL, "failure_reason" varchar,
      "created_at" varchar NOT NULL, "updated_at" varchar NOT NULL
    )`,
    ],
  ],
  [
    'AddWagoCommissioningEnrollment1780000000005',
    [
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "enrollment_id" integer',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "pairing_code" varchar',
    ],
  ],
  [
    'AddWagoCommissioningClaimDetails1780000000006',
    ['ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "controller_name" varchar'],
  ],
  [
    'AddWagoCommissioningProgress1780000000007',
    [
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_percent" integer',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_step" varchar',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "progress_detail" varchar',
    ],
  ],
  [
    'AddWagoCommissioningDeliveryToken1780000000008',
    ['ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "delivery_token" varchar'],
  ],
  [
    'AddWagoCommissioningPrincipal1780000000009',
    [
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "initiating_principal" text',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "runtime_artifact_digest" varchar',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "management_controller_id" integer',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "docker_provision_token" varchar',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "docker_provision_state" varchar',
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "platform_report" text',
    ],
  ],
  [
    'WagoManagement1780000000010',
    [
      `CREATE TABLE "plugin_wago_management" (
      "controller_id" integer PRIMARY KEY NOT NULL,
      "metadata_json" text,
      "encrypted_private_key" text,
      "lease_owner" varchar,
      "lease_until" bigint NOT NULL DEFAULT 0
    )`,
    ],
  ],
  [
    'WagoCommissioningLease1780000000011',
    [
      `CREATE TABLE "plugin_wago_commissioning_lease" (
      "fingerprint_hash" varchar(64) PRIMARY KEY NOT NULL,
      "owner" varchar NOT NULL,
      "lease_until" bigint NOT NULL,
      "operation_until" bigint NOT NULL,
      "recovery_after" bigint NOT NULL
    )`,
    ],
  ],
  [
    'AddWagoRevisionEditorMetadata1780010580000',
    ['ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "preset_provenance" text'],
  ],
  [
    'AddWagoClaimIntent1780010600000',
    ['ALTER TABLE "plugin_wago_controllers" ADD COLUMN "credential_mqtt_server_id" integer'],
  ],
  [
    'WagoCredentialRotation1780010610000',
    [
      'ALTER TABLE "plugin_wago_controllers" ADD COLUMN "credential_epoch" varchar',
      `CREATE TABLE "plugin_wago_credential_rotations" (
      "controller_id" integer PRIMARY KEY NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "revision" integer NOT NULL,
      "credential_epoch" varchar NOT NULL,
      "phase" varchar NOT NULL,
      "mqtt_server_id" integer NOT NULL,
      "prefix" varchar NOT NULL,
      "token" varchar NOT NULL,
      "encrypted_credentials" text
    )`,
    ],
  ],
  [
    'AddWagoRejectionAcknowledgement1780010630000',
    [
      'ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "rejection_acknowledged_at" varchar',
      'ALTER TABLE "plugin_wago_configuration_revisions" ADD COLUMN "rejection_acknowledged_by" integer',
    ],
  ],
  ['DropWagoCommissioningLease1780010640000', ['DROP TABLE IF EXISTS "plugin_wago_commissioning_lease"']],
  [
    'WagoManagedUpdates1780010650000',
    [
      `CREATE TABLE "plugin_wago_managed_access" (
      "session_id" integer PRIMARY KEY NOT NULL, "controller_id" integer,
      "host" varchar NOT NULL, "fingerprint" varchar NOT NULL, "token" varchar NOT NULL,
      "state" varchar NOT NULL, "encrypted_credentials" text NOT NULL, "key_fingerprint" varchar NOT NULL
    )`,
      'CREATE INDEX "wago_managed_controller" ON "plugin_wago_managed_access" ("controller_id")',
      'CREATE TABLE "plugin_wago_runtime_updates" ("controller_id" integer PRIMARY KEY NOT NULL, "metadata" text)',
      'CREATE TABLE "plugin_wago_device_operations" ("fingerprint" varchar PRIMARY KEY NOT NULL, "owner" varchar, "lease_until" bigint NOT NULL DEFAULT 0)',
    ],
  ],
  [
    'WagoNetworkChanges1780010660000',
    [
      `CREATE TABLE "plugin_wago_network_changes" (
      "controller_id" integer PRIMARY KEY NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "session_id" integer NOT NULL, "fingerprint" varchar NOT NULL, "target_host" varchar NOT NULL,
      "mqtt_server_id" integer, "phase" varchar NOT NULL, "failure" varchar,
      "encrypted_payload" text, "updated_at" varchar NOT NULL
    )`,
      `CREATE TABLE "plugin_wago_mqtt_credential_retirements" (
      "controller_id" integer NOT NULL REFERENCES "plugin_wago_controllers"("id") ON DELETE CASCADE,
      "mqtt_server_id" integer NOT NULL, PRIMARY KEY ("controller_id", "mqtt_server_id")
    )`,
    ],
  ],
];
