// Marks resources unhealthy when an MQTT server used by any node of their flows is disconnected
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  MqttServer,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceHealthSource,
  ResourceHealthState,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { MqttServerConnectionChangedEvent } from '../../mqtt/mqtt-connection.event';
import { MqttServerDeletedEvent } from '../../mqtt/mqtt-server-deleted.event';
import { MqttClientService, MqttServerConnectionStatus } from '../../mqtt/mqtt-client.service';
import { ResourceFlowChangedEvent } from '../flows/events/resource-flow-changed.event';
import { ResourceHealthService } from './resource-health.service';

export const MQTT_SERVER_HEALTH_IDENTIFIER_PREFIX = 'mqtt-server-';

const MQTT_FLOW_NODE_TYPES = [
  ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
  ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
  ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
];

@Injectable()
export class MqttServerConnectionHealthListener {
  private readonly logger = new Logger(MqttServerConnectionHealthListener.name);

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceHealthState)
    private readonly healthRepository: Repository<ResourceHealthState>,
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly mqttClientService: MqttClientService,
  ) {}

  private identifierForServer(serverId: number): string {
    return `${MQTT_SERVER_HEALTH_IDENTIFIER_PREFIX}${serverId}`;
  }

  private serverIdOfNode(node: ResourceFlowNode): number | null {
    const serverId = (node.data as { serverId?: unknown } | null)?.serverId;
    return typeof serverId === 'number' ? serverId : null;
  }

  private async findResourceIdsUsingServer(serverId: number): Promise<number[]> {
    const nodes = await this.flowNodeRepository.find({
      where: { type: In(MQTT_FLOW_NODE_TYPES) },
    });
    const resourceIds = new Set<number>();
    for (const node of nodes) {
      if (this.serverIdOfNode(node) === serverId) {
        resourceIds.add(node.resourceId);
      }
    }
    return Array.from(resourceIds);
  }

  private async buildDisconnectedReason(serverId: number, error?: string | null): Promise<string> {
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });
    const serverName = server?.name ?? `#${serverId}`;
    return `MQTT server "${serverName}" is disconnected${error ? `: ${error}` : ''}`;
  }

  @OnEvent(MqttServerConnectionChangedEvent.EVENT_NAME)
  async onConnectionChanged(event: MqttServerConnectionChangedEvent): Promise<void> {
    try {
      if (event.connected) {
        await this.markServerResourcesHealthy(event.serverId);
      } else {
        await this.markServerResourcesUnhealthy(event.serverId, event.error);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update resource health for MQTT server ${event.serverId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(MqttServerDeletedEvent.EVENT_NAME)
  async onServerDeleted(event: MqttServerDeletedEvent): Promise<void> {
    // Remove the health entries tied to the deleted server so resources do not stay unhealthy forever
    try {
      const entries = await this.healthRepository.find({
        where: { identifier: this.identifierForServer(event.serverId) },
      });
      for (const entry of entries) {
        await this.resourceHealthService.clearEntry(entry.resourceId, entry.id);
      }
    } catch (error) {
      this.logger.error(
        `Failed to clear resource health entries for deleted MQTT server ${event.serverId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(ResourceFlowChangedEvent.EVENT_NAME)
  async onResourceFlowChanged(payload: ResourceFlowChangedEvent | number): Promise<void> {
    // The flow save emits the raw resourceId; accept both shapes defensively
    const resourceId = typeof payload === 'number' ? payload : payload?.resourceId;
    if (!resourceId) {
      return;
    }
    try {
      await this.reconcileResource(resourceId);
    } catch (error) {
      this.logger.error(
        `Failed to reconcile MQTT health entries for resource ${resourceId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async markServerResourcesUnhealthy(serverId: number, error?: string): Promise<void> {
    const [resourceIds, reason] = await Promise.all([
      this.findResourceIdsUsingServer(serverId),
      this.buildDisconnectedReason(serverId, error),
    ]);

    for (const resourceId of resourceIds) {
      await this.resourceHealthService.reportHealth({
        resourceId,
        identifier: this.identifierForServer(serverId),
        status: ResourceHealthStatus.UNHEALTHY,
        reason,
        source: ResourceHealthSource.SYSTEM,
      });
    }

    if (resourceIds.length > 0) {
      this.logger.log(
        `Marked ${resourceIds.length} resource(s) unhealthy because MQTT server ${serverId} is disconnected`,
      );
    }
  }

  private async markServerResourcesHealthy(serverId: number): Promise<void> {
    // Only flip back existing unhealthy entries; do not create healthy rows for every resource
    const entries = await this.healthRepository.find({
      where: { identifier: this.identifierForServer(serverId), status: ResourceHealthStatus.UNHEALTHY },
    });

    for (const entry of entries) {
      await this.resourceHealthService.reportHealth({
        resourceId: entry.resourceId,
        identifier: entry.identifier,
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.SYSTEM,
      });
    }

    if (entries.length > 0) {
      this.logger.log(`Marked ${entries.length} resource(s) healthy because MQTT server ${serverId} reconnected`);
    }
  }

  /**
   * Re-evaluates the mqtt-server health entries of a resource against the servers its flow currently references:
   * clears entries of servers that are no longer used and reports the live connection state of those that are.
   */
  async reconcileResource(resourceId: number): Promise<void> {
    const nodes = await this.flowNodeRepository.find({
      where: { resourceId, type: In(MQTT_FLOW_NODE_TYPES) },
    });

    const referencedServerIds = new Set<number>();
    for (const node of nodes) {
      const serverId = this.serverIdOfNode(node);
      if (serverId !== null) {
        referencedServerIds.add(serverId);
      }
    }

    const existingEntries = await this.healthRepository.find({ where: { resourceId } });
    const mqttEntries = existingEntries.filter((entry) =>
      entry.identifier.startsWith(MQTT_SERVER_HEALTH_IDENTIFIER_PREFIX),
    );

    // Drop entries for servers the flow no longer references
    for (const entry of mqttEntries) {
      const serverId = Number(entry.identifier.slice(MQTT_SERVER_HEALTH_IDENTIFIER_PREFIX.length));
      if (!referencedServerIds.has(serverId)) {
        await this.resourceHealthService.clearEntry(resourceId, entry.id);
      }
    }

    // Report the live state of the servers that are referenced
    for (const serverId of referencedServerIds) {
      const state = this.mqttClientService.getConnectionState(serverId);

      if (state.status === MqttServerConnectionStatus.DISCONNECTED) {
        await this.resourceHealthService.reportHealth({
          resourceId,
          identifier: this.identifierForServer(serverId),
          status: ResourceHealthStatus.UNHEALTHY,
          reason: await this.buildDisconnectedReason(serverId, state.lastError),
          source: ResourceHealthSource.SYSTEM,
        });
      } else if (state.status === MqttServerConnectionStatus.CONNECTED) {
        const hasEntry = mqttEntries.some((entry) => entry.identifier === this.identifierForServer(serverId));
        if (hasEntry) {
          await this.resourceHealthService.reportHealth({
            resourceId,
            identifier: this.identifierForServer(serverId),
            status: ResourceHealthStatus.HEALTHY,
            source: ResourceHealthSource.SYSTEM,
          });
        }
      }
      // CONNECTING/UNKNOWN: no judgement yet, leave existing entries untouched
    }
  }
}
