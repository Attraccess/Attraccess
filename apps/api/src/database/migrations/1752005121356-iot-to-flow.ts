import { MigrationInterface, QueryRunner } from 'typeorm';
import { nanoid } from 'nanoid';

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
export class IotToFlow1752005121356 implements MigrationInterface {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async convertMqttConfigToFlow(queryRunner: QueryRunner, config: any): Promise<void> {
    const resourceId = config.resourceId;
    const basePosition = { x: 100, y: 100 };
    const nodeSpacing = 200;

    // Create event nodes
    const startEventNodeId = this.generateNodeId();
    const stopEventNodeId = this.generateNodeId();
    const takeoverEventNodeId = this.generateNodeId();

    // Create MQTT action nodes
    const inUseActionNodeId = this.generateNodeId();
    const notInUseActionNodeId = this.generateNodeId();
    const takeoverActionNodeId = this.generateNodeId();

    // Insert event nodes
    await queryRunner.query(
      `
      INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
      VALUES 
        ($1, 'event.resource.usage.started', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($6, 'event.resource.usage.stopped', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($11, 'event.resource.usage.takeover', $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      [
        startEventNodeId,
        basePosition.x,
        basePosition.y,
        JSON.stringify({}),
        resourceId,
        stopEventNodeId,
        basePosition.x,
        basePosition.y + nodeSpacing,
        JSON.stringify({}),
        resourceId,
        takeoverEventNodeId,
        basePosition.x,
        basePosition.y + nodeSpacing * 2,
        JSON.stringify({}),
        resourceId,
      ]
    );

    // Insert MQTT action nodes
    await queryRunner.query(
      `
      INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
      VALUES 
        ($1, 'action.mqtt.sendMessage', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($6, 'action.mqtt.sendMessage', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      [
        inUseActionNodeId,
        basePosition.x + nodeSpacing * 2,
        basePosition.y,
        JSON.stringify({
          serverId: config.serverId,
          topic: this.transformTemplate(config.inUseTopic),
          payload: this.transformTemplate(config.inUseMessage),
        }),
        resourceId,
        notInUseActionNodeId,
        basePosition.x + nodeSpacing * 2,
        basePosition.y + nodeSpacing,
        JSON.stringify({
          serverId: config.serverId,
          topic: this.transformTemplate(config.notInUseTopic),
          payload: this.transformTemplate(config.notInUseMessage),
        }),
        resourceId,
      ]
    );

    // Insert takeover action node if takeover messages are configured
    if (config.onTakeoverSendTakeover && config.takeoverTopic && config.takeoverMessage) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
        VALUES ($1, 'action.mqtt.sendMessage', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [
          takeoverActionNodeId,
          basePosition.x + nodeSpacing * 2,
          basePosition.y + nodeSpacing * 2,
          JSON.stringify({
            serverId: config.serverId,
            topic: this.transformTemplate(config.takeoverTopic),
            payload: this.transformTemplate(config.takeoverMessage),
          }),
          resourceId,
        ]
      );
    }

    // Create edges to connect events to actions
    await queryRunner.query(
      `
      INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
      VALUES 
        ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      [
        this.generateEdgeId(),
        startEventNodeId,
        inUseActionNodeId,
        resourceId,
        this.generateEdgeId(),
        stopEventNodeId,
        notInUseActionNodeId,
        resourceId,
      ]
    );

    // Handle takeover event connections
    if (config.onTakeoverSendTakeover && config.takeoverTopic && config.takeoverMessage) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, takeoverActionNodeId, resourceId]
      );
    }

    // Handle takeover send start/stop logic
    if (config.onTakeoverSendStart) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, inUseActionNodeId, resourceId]
      );
    }

    if (config.onTakeoverSendStop) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, notInUseActionNodeId, resourceId]
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async convertWebhookConfigToFlow(queryRunner: QueryRunner, config: any): Promise<void> {
    const resourceId = config.resourceId;
    const basePosition = { x: 600, y: 100 }; // Position webhooks to the right of MQTT
    const nodeSpacing = 200;

    // Create event nodes (reuse existing ones if they exist for this resource)
    const existingNodes = await queryRunner.query(
      `
      SELECT id, type FROM resource_flow_node 
      WHERE resourceId = $1 AND type IN ('event.resource.usage.started', 'event.resource.usage.stopped', 'event.resource.usage.takeover')
    `,
      [resourceId]
    );

    let startEventNodeId: string;
    let stopEventNodeId: string;
    let takeoverEventNodeId: string;

    // Find or create event nodes
    const startNode = existingNodes.find((n) => n.type === 'event.resource.usage.started');
    const stopNode = existingNodes.find((n) => n.type === 'event.resource.usage.stopped');
    const takeoverNode = existingNodes.find((n) => n.type === 'event.resource.usage.takeover');

    if (startNode) {
      startEventNodeId = startNode.id;
    } else {
      startEventNodeId = this.generateNodeId();
      await queryRunner.query(
        `
        INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
        VALUES ($1, 'event.resource.usage.started', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [startEventNodeId, basePosition.x, basePosition.y, JSON.stringify({}), resourceId]
      );
    }

    if (stopNode) {
      stopEventNodeId = stopNode.id;
    } else {
      stopEventNodeId = this.generateNodeId();
      await queryRunner.query(
        `
        INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
        VALUES ($1, 'event.resource.usage.stopped', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [stopEventNodeId, basePosition.x, basePosition.y + nodeSpacing, JSON.stringify({}), resourceId]
      );
    }

    if (takeoverNode) {
      takeoverEventNodeId = takeoverNode.id;
    } else {
      takeoverEventNodeId = this.generateNodeId();
      await queryRunner.query(
        `
        INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
        VALUES ($1, 'event.resource.usage.takeover', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [takeoverEventNodeId, basePosition.x, basePosition.y + nodeSpacing * 2, JSON.stringify({}), resourceId]
      );
    }

    // Create HTTP action nodes
    const inUseActionNodeId = this.generateNodeId();
    const notInUseActionNodeId = this.generateNodeId();
    const takeoverActionNodeId = this.generateNodeId();

    // Parse headers JSON
    let headers = {};
    if (config.headers) {
      try {
        headers = JSON.parse(config.headers);
      } catch {
        console.warn(`Invalid headers JSON for webhook config ${config.id}: ${config.headers}`);
      }
    }

    // Insert HTTP action nodes
    await queryRunner.query(
      `
      INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
      VALUES 
        ($1, 'action.http.sendRequest', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($6, 'action.http.sendRequest', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      [
        inUseActionNodeId,
        basePosition.x + nodeSpacing * 2,
        basePosition.y,
        JSON.stringify({
          url: this.transformTemplate(config.url),
          method: config.method,
          headers: this.transformWebhookHeaders(headers),
          body: this.transformTemplate(config.inUseTemplate),
        }),
        resourceId,
        notInUseActionNodeId,
        basePosition.x + nodeSpacing * 2,
        basePosition.y + nodeSpacing,
        JSON.stringify({
          url: this.transformTemplate(config.url),
          method: config.method,
          headers: this.transformWebhookHeaders(headers),
          body: this.transformTemplate(config.notInUseTemplate),
        }),
        resourceId,
      ]
    );

    // Insert takeover action node if takeover template is configured
    if (config.onTakeoverSendTakeover && config.takeoverTemplate) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_node (id, type, positionX, positionY, data, resourceId, createdAt, updatedAt)
        VALUES ($1, 'action.http.sendRequest', $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [
          takeoverActionNodeId,
          basePosition.x + nodeSpacing * 2,
          basePosition.y + nodeSpacing * 2,
          JSON.stringify({
            url: this.transformTemplate(config.url),
            method: config.method,
            headers: this.transformWebhookHeaders(headers),
            body: this.transformTemplate(config.takeoverTemplate),
          }),
          resourceId,
        ]
      );
    }

    // Create edges to connect events to actions
    await queryRunner.query(
      `
      INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
      VALUES 
        ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      [
        this.generateEdgeId(),
        startEventNodeId,
        inUseActionNodeId,
        resourceId,
        this.generateEdgeId(),
        stopEventNodeId,
        notInUseActionNodeId,
        resourceId,
      ]
    );

    // Handle takeover event connections
    if (config.onTakeoverSendTakeover && config.takeoverTemplate) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, takeoverActionNodeId, resourceId]
      );
    }

    // Handle takeover send start/stop logic
    if (config.onTakeoverSendStart) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, inUseActionNodeId, resourceId]
      );
    }

    if (config.onTakeoverSendStop) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, notInUseActionNodeId, resourceId]
      );
    }
  }

  private generateNodeId(): string {
    return nanoid(21); // Same format as used in the flow system
  }

  private generateEdgeId(): string {
    return nanoid(21);
  }

  /**
   * Transform IoT templates to flow templates.
   * IoT templates use direct variables like {{name}}, {{user.username}}
   * Flow templates wrap everything under {{input.*}}
   */
  private transformTemplate(template: string): string {
    if (!template) return template;

    // Template variable mapping from IoT to Flow format
    const templateMappings = [
      // Resource properties
      { from: /\{\{id\}\}/g, to: '{{input.resource.id}}' },
      { from: /\{\{name\}\}/g, to: '{{input.resource.name}}' },

      // Event properties
      { from: /\{\{timestamp\}\}/g, to: '{{input.event.timestamp}}' },

      // User properties
      { from: /\{\{user\.id\}\}/g, to: '{{input.user.id}}' },
      { from: /\{\{user\.username\}\}/g, to: '{{input.user.username}}' },
      { from: /\{\{user\.externalIdentifier\}\}/g, to: '{{input.user.externalIdentifier}}' },

      // Previous user properties (for takeover events)
      { from: /\{\{previousUser\.id\}\}/g, to: '{{input.previousUser.id}}' },
      { from: /\{\{previousUser\.username\}\}/g, to: '{{input.previousUser.username}}' },
      { from: /\{\{previousUser\.externalIdentifier\}\}/g, to: '{{input.previousUser.externalIdentifier}}' },

      // Legacy user property variations (some templates might use different formats)
      { from: /\{\{user\.name\}\}/g, to: '{{input.user.username}}' },
      { from: /\{\{previousUser\.name\}\}/g, to: '{{input.previousUser.username}}' },
    ];

    let transformedTemplate = template;

    // Apply all transformations
    for (const mapping of templateMappings) {
      transformedTemplate = transformedTemplate.replace(mapping.from, mapping.to);
    }

    return transformedTemplate;
  }

  /**
   * Transform template variables in webhook headers object
   */
  private transformWebhookHeaders(headers: Record<string, string>): Record<string, string> {
    const transformedHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      transformedHeaders[key] = this.transformTemplate(value);
    }

    return transformedHeaders;
  }
}
