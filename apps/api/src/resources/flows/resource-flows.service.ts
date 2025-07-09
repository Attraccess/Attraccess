import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  getNodeDataSchema,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceFlowSaveDto, ResourceFlowResponseDto } from './dto';
import { PaginatedResponse } from '../../types/response';

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

@Injectable()
export class ResourceFlowsService {
  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceFlowLog)
    private readonly flowLogRepository: Repository<ResourceFlowLog>
  ) {}

  async getResourceFlow(resourceId: number): Promise<ResourceFlowResponse> {
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

    return { nodes, edges };
  }

  private validateNodeData(nodeData: {
    id: string;
    type: ResourceFlowNodeType | string;
    data: unknown;
  }): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const schema = getNodeDataSchema(nodeData.type);
      schema.parse(nodeData.data);
    } catch (error) {
      // Handle Zod validation errors
      if (error.errors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error.errors.forEach((zodError: any) => {
          errors.push({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            field: zodError.path?.join('.') || 'data',
            message: zodError.message,
            value: zodError.received,
          });
        });
      } else {
        // Fallback for other types of errors
        errors.push({
          nodeId: nodeData.id,
          nodeType: nodeData.type,
          field: 'data',
          message: error.message || 'Invalid node data',
          value: nodeData.data,
        });
      }
    }

    return errors;
  }

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
    for (const nodeData of flowData.nodes) {
      const nodeErrors = this.validateNodeData(nodeData);
      allValidationErrors.push(...nodeErrors);
    }

    // Start transaction to ensure data consistency
    const result = await this.flowNodeRepository.manager.transaction(async (transactionalEntityManager) => {
      // Delete existing nodes and edges (cascading will handle relationships)
      await transactionalEntityManager.delete(ResourceFlowNode, { resource: { id: resourceId } });
      await transactionalEntityManager.delete(ResourceFlowEdge, { resource: { id: resourceId } });

      // Create new nodes
      const newNodes = flowData.nodes.map((nodeData) => {
        const node = new ResourceFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type;
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
        edge.target = edgeData.target;
        edge.resource = resource;
        return edge;
      });

      // Save all nodes and edges
      const [savedNodes, savedEdges] = await Promise.all([
        transactionalEntityManager.save(ResourceFlowNode, newNodes),
        transactionalEntityManager.save(ResourceFlowEdge, newEdges),
      ]);

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

    return response;
  }

  async getResourceFlowLogs(resourceId: number, page = 1, limit = 50): Promise<PaginatedResponse<ResourceFlowLog>> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination, ordered by creation time (newest first)
    const [logs, total] = await this.flowLogRepository.findAndCount({
      where: { resourceId },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: logs,
      total,
      page,
      limit,
    };
  }
}
