import { QueryRunner } from 'typeorm';
import { IotToFlow1752005121356RouteContext } from './1752005121356-iot-to-flow.route-context';
export abstract class LegacyMqttFlowConversionImplementation extends IotToFlow1752005121356RouteContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async convertMqttConfigToFlow(queryRunner: QueryRunner, config: any): Promise<void> {
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
      ],
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
      ],
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
    if (config.onTakeoverSendTakeover && config.takeoverTopic && config.takeoverMessage) {
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
