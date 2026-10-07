import { QueryRunner } from 'typeorm';
import { LegacyMqttFlowConversionImplementation } from './legacy-mqtt-flow-conversion';
export abstract class LegacyWebhookFlowConversionImplementation extends LegacyMqttFlowConversionImplementation {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async convertWebhookConfigToFlow(queryRunner: QueryRunner, config: any): Promise<void> {
    const resourceId = config.resourceId;
    const basePosition = { x: 600, y: 100 }; // Position webhooks to the right of MQTT
    const nodeSpacing = 200;

    // Create event nodes (reuse existing ones if they exist for this resource)
    const existingNodes = await queryRunner.query(
      `
      SELECT id, type FROM resource_flow_node
      WHERE resourceId = $1 AND type IN ('event.resource.usage.started', 'event.resource.usage.stopped', 'event.resource.usage.takeover')
    `,
      [resourceId],
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
        [startEventNodeId, basePosition.x, basePosition.y, JSON.stringify({}), resourceId],
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
        [stopEventNodeId, basePosition.x, basePosition.y + nodeSpacing, JSON.stringify({}), resourceId],
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
        [takeoverEventNodeId, basePosition.x, basePosition.y + nodeSpacing * 2, JSON.stringify({}), resourceId],
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
        // eslint-disable-next-line no-console
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
      ],
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
        ],
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
      ],
    );

    // Handle takeover event connections
    if (config.onTakeoverSendTakeover && config.takeoverTemplate) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, takeoverActionNodeId, resourceId],
      );
    }

    // Handle takeover send start/stop logic
    if (config.onTakeoverSendStart) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, inUseActionNodeId, resourceId],
      );
    }

    if (config.onTakeoverSendStop) {
      await queryRunner.query(
        `
        INSERT INTO resource_flow_edge (id, source, target, resourceId, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        [this.generateEdgeId(), takeoverEventNodeId, notInUseActionNodeId, resourceId],
      );
    }
  }
}
