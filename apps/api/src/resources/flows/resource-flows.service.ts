import { Resource, ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceFlowWritingImplementation } from './resource-flow-writing';
import { ResourceFlowResponse, ValidationError } from './resource-flows.service.route-context';

@Injectable()
export class ResourceFlowsService extends ResourceFlowWritingImplementation {
  protected readonly logger = new Logger(ResourceFlowsService.name);

  constructor(
    @InjectRepository(ResourceFlowNode)
    protected readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    protected readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    protected readonly mqttClientService: MqttClientService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  public async getResourceFlow(resourceId: number): Promise<ResourceFlowResponse> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Get all nodes and edges for the resource
    const [nodes, edges] = await Promise.all([
      this.flowNodeRepository.find({
        where: { resource: { id: resourceId } },
      }),
      this.flowEdgeRepository.find({
        where: { resource: { id: resourceId } },
      }),
    ]);

    const validationContext = new Map<string, unknown>([['meterResourceId', resourceId]]);
    const validationErrors: ValidationError[] = [];
    // Plugin validators may query external state, so bound the fanout without serializing the whole flow.
    const validationConcurrency = 4;
    for (let index = 0; index < nodes.length; index += validationConcurrency) {
      const batch = nodes.slice(index, index + validationConcurrency);
      validationErrors.push(
        ...(await Promise.all(batch.map((node) => this.validateNodeData(node, validationContext)))).flat(),
      );
    }
    return { nodes, edges, ...(validationErrors.length ? { validationErrors } : {}) };
  }

  public async getNodes(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return await this.flowNodeRepository.find({
      where: { resourceId, type },
    });
  }

  public async getNodesForResources(
    resourceIds: number[],
    type: ResourceFlowNodeType,
  ): Promise<Map<number, ResourceFlowNode[]>> {
    const map = new Map<number, ResourceFlowNode[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const nodes = await this.flowNodeRepository.find({
      where: { resourceId: In(resourceIds), type },
    });
    for (const node of nodes) {
      const bucket = map.get(node.resourceId);
      if (bucket) bucket.push(node);
    }
    return map;
  }
}

export { ResourceFlowResponse, ValidationError } from './resource-flows.service.route-context';
