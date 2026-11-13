import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Creates the Matter device model: fabrics, nodes, endpoints, clusters, capabilities, current state, the bounded
 * command log and the reconciliation status. Additive: it leaves `plugin_matter_connection` and its data alone.
 *
 * Self-contained: no foreign key to host tables (plugin up-migrations may run before the host's own) and none
 * between the plugin tables either, because history is kept and nothing is ever deleted by cascade. Uniqueness of
 * live identities is enforced by partial unique indexes, so a removed row stays as history while the same identity
 * can appear again as a new row.
 */
export class CreateMatterDeviceModel1793900001000 implements MigrationInterface {
  name = 'CreateMatterDeviceModel1793900001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "plugin_matter_fabrics" (
        "id" varchar PRIMARY KEY NOT NULL,
        "fabric_id" varchar NOT NULL,
        "label" varchar,
        "first_seen_at" varchar NOT NULL,
        "last_seen_at" varchar NOT NULL,
        "status" varchar NOT NULL,
        "retired_at" varchar,
        CONSTRAINT "CHK_plugin_matter_fabrics_status" CHECK ("status" IN ('active', 'absent'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_fabrics_live" ON "plugin_matter_fabrics" ("fabric_id") WHERE "retired_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_nodes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "fabric_ref" varchar NOT NULL,
        "node_id" varchar NOT NULL,
        "vendor_id" integer,
        "product_id" integer,
        "vendor_name" varchar,
        "product_name" varchar,
        "serial_number" varchar,
        "unique_id" varchar,
        "hardware_version" integer,
        "software_version" integer,
        "software_version_string" varchar,
        "attestation_status" varchar,
        "attestation_checked_at" varchar,
        "display_name" varchar(100),
        "description" varchar(500),
        "location" varchar(100),
        "lifecycle_state" varchar NOT NULL,
        "detached_reason" varchar,
        "reachable" boolean,
        "first_seen_at" varchar NOT NULL,
        "last_seen_at" varchar NOT NULL,
        "claimed_at" varchar,
        "claimed_by" integer,
        "detached_at" varchar,
        "archived_at" varchar,
        "archived_by" integer,
        "removed_at" varchar,
        "removed_by" integer,
        "removal_reason" varchar,
        "merged_into" varchar,
        "created_at" varchar NOT NULL,
        "updated_at" varchar NOT NULL,
        CONSTRAINT "CHK_plugin_matter_nodes_lifecycle" CHECK ("lifecycle_state" IN ('unclaimed', 'claimed', 'detached', 'archived', 'removed')),
        CONSTRAINT "CHK_plugin_matter_nodes_detached_reason" CHECK ("detached_reason" IS NULL OR "detached_reason" IN ('absent_from_sidecar', 'fabric_mismatch', 'fabric_absent')),
        CONSTRAINT "CHK_plugin_matter_nodes_removal_reason" CHECK ("removal_reason" IS NULL OR "removal_reason" IN ('force_removed', 'merged', 'replaced')),
        CONSTRAINT "CHK_plugin_matter_nodes_attestation" CHECK ("attestation_status" IS NULL OR "attestation_status" IN ('verified', 'unverified', 'failed', 'unknown'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_nodes_live_identity" ON "plugin_matter_nodes" ("fabric_ref", "node_id") WHERE "removed_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugin_matter_nodes_lifecycle" ON "plugin_matter_nodes" ("lifecycle_state")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_endpoints" (
        "id" varchar PRIMARY KEY NOT NULL,
        "node_ref" varchar NOT NULL,
        "endpoint_id" integer NOT NULL,
        "parent_endpoint_id" integer,
        "device_types" text NOT NULL,
        "profile" varchar NOT NULL,
        "display_name" varchar(100),
        "description" varchar(500),
        "location" varchar(100),
        "bridged" boolean,
        "bridged_unique_id" varchar,
        "bridged_node_label" varchar,
        "bridged_vendor_name" varchar,
        "bridged_product_name" varchar,
        "bridged_serial_number" varchar,
        "bridged_reachable" boolean,
        "first_seen_at" varchar NOT NULL,
        "last_seen_at" varchar NOT NULL,
        "removed_at" varchar,
        "removal_reason" varchar,
        CONSTRAINT "CHK_plugin_matter_endpoints_range" CHECK ("endpoint_id" BETWEEN 0 AND 65534),
        CONSTRAINT "CHK_plugin_matter_endpoints_removal_reason" CHECK ("removal_reason" IS NULL OR "removal_reason" IN ('absent_from_sidecar', 'replaced', 'force_removed', 'merged'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_endpoints_live" ON "plugin_matter_endpoints" ("node_ref", "endpoint_id") WHERE "removed_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_endpoint_clusters" (
        "id" varchar PRIMARY KEY NOT NULL,
        "endpoint_ref" varchar NOT NULL,
        "cluster_id" integer NOT NULL,
        "role" varchar NOT NULL,
        "revision" integer,
        "feature_map" integer,
        "attribute_ids" text NOT NULL,
        "accepted_command_ids" text NOT NULL,
        "removed_at" varchar,
        CONSTRAINT "CHK_plugin_matter_endpoint_clusters_role" CHECK ("role" IN ('server', 'client'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_endpoint_clusters_live" ON "plugin_matter_endpoint_clusters" ("endpoint_ref", "cluster_id", "role") WHERE "removed_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_endpoint_capabilities" (
        "id" varchar PRIMARY KEY NOT NULL,
        "endpoint_ref" varchar NOT NULL,
        "capability" varchar NOT NULL,
        "source_cluster_id" integer NOT NULL,
        "details" text NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_endpoint_capabilities" ON "plugin_matter_endpoint_capabilities" ("endpoint_ref", "capability")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_endpoint_state" (
        "id" varchar PRIMARY KEY NOT NULL,
        "endpoint_ref" varchar NOT NULL,
        "state_key" varchar NOT NULL,
        "reported_value" text,
        "reported_at" varchar,
        "received_at" varchar,
        "source" varchar,
        "quality" varchar,
        "stale_after_ms" integer NOT NULL DEFAULT 600000,
        "requested_value" text,
        "requested_at" varchar,
        "requested_by" integer,
        "request_id" varchar,
        "correlation_id" varchar,
        "command_state" varchar NOT NULL DEFAULT 'none',
        "accepted_at" varchar,
        "command_reported_at" varchar,
        "external_change_at" varchar,
        "external_change_value" text,
        "fault_code" varchar,
        "fault_message" varchar,
        "fault_at" varchar,
        "updated_at" varchar NOT NULL,
        CONSTRAINT "CHK_plugin_matter_endpoint_state_command" CHECK ("command_state" IN ('none', 'requested', 'accepted', 'reported', 'uncertain', 'failed')),
        CONSTRAINT "CHK_plugin_matter_endpoint_state_quality" CHECK ("quality" IS NULL OR "quality" IN ('good', 'uncertain', 'fault', 'unavailable')),
        CONSTRAINT "CHK_plugin_matter_endpoint_state_source" CHECK ("source" IS NULL OR "source" IN ('subscription_report', 'read', 'command_response'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_endpoint_state_key" ON "plugin_matter_endpoint_state" ("endpoint_ref", "state_key")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_commands" (
        "request_id" varchar PRIMARY KEY NOT NULL,
        "endpoint_ref" varchar NOT NULL,
        "cluster_id" integer NOT NULL,
        "command_id" integer NOT NULL,
        "state_key" varchar,
        "requested_at" varchar NOT NULL,
        "requested_by" integer,
        "correlation_id" varchar,
        "outcome" varchar NOT NULL,
        "accepted_at" varchar,
        "reported_at" varchar,
        "failure_code" varchar,
        CONSTRAINT "CHK_plugin_matter_commands_outcome" CHECK ("outcome" IN ('requested', 'accepted', 'reported', 'uncertain', 'failed'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugin_matter_commands_requested_at" ON "plugin_matter_commands" ("requested_at", "request_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_reconciliation_status" (
        "id" integer PRIMARY KEY NOT NULL,
        "last_started_at" varchar,
        "last_finished_at" varchar,
        "last_result" varchar,
        "last_summary" text,
        "sidecar_fabric_id" varchar,
        CONSTRAINT "CHK_plugin_matter_reconciliation_status_singleton" CHECK ("id" = 1),
        CONSTRAINT "CHK_plugin_matter_reconciliation_status_result" CHECK ("last_result" IS NULL OR "last_result" IN ('applied', 'skipped_unavailable', 'skipped_non_authoritative', 'failed'))
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order of creation. Dropping a table drops its indexes.
    await queryRunner.query(`DROP TABLE "plugin_matter_reconciliation_status"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_commands"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_endpoint_state"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_endpoint_capabilities"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_endpoint_clusters"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_endpoints"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_nodes"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_fabrics"`);
  }
}
