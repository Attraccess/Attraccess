import { MigrationInterface, QueryRunner } from 'typeorm';
import { LegacyFlowTemplateConversionImplementation } from './legacy-flow-template-conversion';

/**
 * Migration to convert IoT configurations (MQTT and Webhook) to Flow system.
 *
 * This migration:
 * 1. Reads existing MQTT and webhook configurations
 * 2. Creates flow nodes and edges to replicate the same functionality
 * 3. Transforms template variables from IoT format to Flow format
 *
 * Template transformation examples:
 * - {{id}} → {{input.resource.id}}
 * - {{user.username}} → {{input.user.username}}
 * - {{timestamp}} → {{input.event.timestamp}}
 *
 * Note: {{name}} (resource name) is not available in flow templates,
 * so it gets replaced with {{input.resource.id}} as a fallback.
 */
export class IotToFlow1752005121356 extends LegacyFlowTemplateConversionImplementation implements MigrationInterface {
  name = 'IotToFlow1752005121356';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, let's get all existing MQTT resource configurations
    const mqttConfigs = await queryRunner.query(`
      SELECT * FROM mqtt_resource_config
    `);

    // Get all existing webhook configurations
    const webhookConfigs = await queryRunner.query(`
      SELECT * FROM webhook_config WHERE active = true
    `);

    // Process MQTT configurations
    for (const config of mqttConfigs) {
      await this.convertMqttConfigToFlow(queryRunner, config);
    }

    // Process webhook configurations
    for (const config of webhookConfigs) {
      await this.convertWebhookConfigToFlow(queryRunner, config);
    }

    // Optional: Drop the old tables after conversion
    // Uncomment if you want to remove the old tables
    // await queryRunner.query(`DROP TABLE IF EXISTS mqtt_resource_config`);
    // await queryRunner.query(`DROP TABLE IF EXISTS webhook_config`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove all flow nodes and edges created by this migration
    // This is a basic rollback - in a real scenario you might want to be more selective
    await queryRunner.query(`DELETE FROM resource_flow_edge`);
    await queryRunner.query(`DELETE FROM resource_flow_node`);

    // Note: We don't recreate the old tables as they should still exist
    // if you didn't drop them in the up() method
  }
}
