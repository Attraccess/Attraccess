import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceFlowResponseDto, ResourceFlowSaveDto } from './dto';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { ResourceFlowNodeSchemaImplementation } from './resource-flow-node-schema';
import { ResourceFlowResponse, ValidationError } from './resource-flows.service.route-context';
export abstract class ResourceFlowWritingImplementation extends ResourceFlowNodeSchemaImplementation {
  async saveResourceFlow(resourceId: number, flowData: ResourceFlowSaveDto): Promise<ResourceFlowResponseDto> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Collect validation errors from all nodes
    const allValidationErrors: ValidationError[] = [];
    const validationContext = new Map<string, unknown>([['meterResourceId', resourceId]]);
    for (const nodeData of flowData.nodes) {
      const nodeErrors = await this.validateNodeData(nodeData, validationContext);
      allValidationErrors.push(...nodeErrors);
    }

    // Start transaction to ensure data consistency
    const result = await this.flowNodeRepository.manager.transaction(async (transactionalEntityManager) => {
      const [oldMqttMessageReceivedNodes, oldMqttWaitForMessageNodes] = await Promise.all([
        transactionalEntityManager.find(ResourceFlowNode, {
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED },
        }),
        transactionalEntityManager.find(ResourceFlowNode, {
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE },
        }),
      ]);

      const newOrChangedMqttMessageReceivedNodes = [] as typeof flowData.nodes;
      const newOrChangedMqttWaitForMessageNodes = [] as typeof flowData.nodes;

      for (const nodeData of flowData.nodes) {
        if (nodeData.type === ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED) {
          const existingNode = oldMqttMessageReceivedNodes.find((oldNode) => oldNode.id === nodeData.id);
          if (!existingNode) {
            newOrChangedMqttMessageReceivedNodes.push(nodeData);
          } else if (
            existingNode.data.topic !== nodeData.data.topic ||
            existingNode.data.serverId !== nodeData.data.serverId
          ) {
            newOrChangedMqttMessageReceivedNodes.push(nodeData);
          }
        }

        if (nodeData.type === ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE) {
          const existingNode = oldMqttWaitForMessageNodes.find((oldNode) => oldNode.id === nodeData.id);
          if (!existingNode) {
            newOrChangedMqttWaitForMessageNodes.push(nodeData);
          } else if (
            existingNode.data.topic !== nodeData.data.topic ||
            existingNode.data.serverId !== nodeData.data.serverId
          ) {
            newOrChangedMqttWaitForMessageNodes.push(nodeData);
          }
        }
      }

      // Delete existing nodes and edges (cascading will handle relationships)
      await transactionalEntityManager.delete(ResourceFlowNode, { resource: { id: resourceId } });
      await transactionalEntityManager.delete(ResourceFlowEdge, { resource: { id: resourceId } });

      // Create new nodes
      const newNodes = flowData.nodes.map((nodeData) => {
        const node = new ResourceFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type as ResourceFlowNodeType;
        node.position = {
          x: nodeData.position.x,
          y: nodeData.position.y,
        };
        node.data = nodeData.data || {};
        node.resource = resource;
        return node;
      });

      // Create new edges
      const newEdges = flowData.edges.map((edgeData) => {
        const edge = new ResourceFlowEdge();
        edge.id = edgeData.id;
        edge.source = edgeData.source;
        edge.sourceHandle = edgeData.sourceHandle;
        edge.target = edgeData.target;
        edge.targetHandle = edgeData.targetHandle;
        edge.resource = resource;
        return edge;
      });

      // Save all nodes and edges
      const [savedNodes, savedEdges] = await Promise.all([
        transactionalEntityManager.save(ResourceFlowNode, newNodes),
        transactionalEntityManager.save(ResourceFlowEdge, newEdges),
      ]);

      for (const nodeData of newOrChangedMqttMessageReceivedNodes) {
        if (!nodeData.data.serverId || !nodeData.data.topic) {
          this.logger.warn(
            `Skipping subscription to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId} because it is missing`,
          );
          continue;
        }
        this.mqttClientService
          .subscribe(nodeData.data.serverId as number, nodeData.data.topic as string)
          .catch((error) => {
            this.logger.error(
              `Failed to subscribe to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId}`,
              error.stack,
            );
          });
      }

      for (const nodeData of newOrChangedMqttWaitForMessageNodes) {
        if (!nodeData.data.serverId || !nodeData.data.topic) {
          this.logger.warn(
            `Skipping subscription to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId} because it is missing`,
          );
          continue;
        }
        this.mqttClientService
          .subscribe(nodeData.data.serverId as number, nodeData.data.topic as string)
          .catch((error) => {
            this.logger.error(
              `Failed to subscribe to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId}`,
              error.stack,
            );
          });
      }

      return { nodes: savedNodes, edges: savedEdges };
    });

    // Include validation errors in the response if any exist
    const response: ResourceFlowResponse = {
      nodes: result.nodes,
      edges: result.edges,
    };

    if (allValidationErrors.length > 0) {
      response.validationErrors = allValidationErrors;
    }

    this.eventEmitter.emit(ResourceFlowChangedEvent.EVENT_NAME, resourceId);

    return response;
  }
}
