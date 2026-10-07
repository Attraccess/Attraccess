import { ResourceFlowEdge, ResourceFlowNode, Resource } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { getPluginFlowNode } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';

export interface ValidationError {
  nodeId: string;
  nodeType: string;
  field: string;
  message: string;
  value?: unknown;
}

export interface ResourceFlowResponse {
  nodes: ResourceFlowNode[];
  edges: ResourceFlowEdge[];
  validationErrors?: ValidationError[];
}

export abstract class ResourceFlowsServiceRouteContext {
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract pluginNodeSchema(
    definition: NonNullable<ReturnType<typeof getPluginFlowNode>>,
    configSchema: Record<string, unknown>,
  ): ResourceFlowNodeSchemaDto;
  protected abstract validateNodeData(
    nodeData: { id: string; type: string; data: unknown },
    validationContext?: Map<string, unknown>,
  ): Promise<ValidationError[]>;
  protected abstract readonly flowNodeRepository: Repository<ResourceFlowNode>;
  protected abstract readonly logger: Logger;
  protected abstract readonly mqttClientService: MqttClientService;
  protected abstract readonly eventEmitter: EventEmitter2;
}
