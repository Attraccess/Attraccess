import { getNodeDataSchema, ResourceFlowNodeType, ResourceMeter } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { getPluginFlowNode, getRegisteredPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { getCoreNodeSchemas } from './core-node-schemas';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { ValidationError } from './resource-flows.service.route-context';
import { ResourceFlowsServiceRouteContext } from './resource-flows.service.route-context';
export abstract class ResourceFlowNodeSchemaImplementation extends ResourceFlowsServiceRouteContext {
  async resolveNodeSchema(
    resourceId: number,
    nodeType: string,
    config: Record<string, unknown>,
    purpose: 'editor' | 'preview' = 'editor',
  ): Promise<ResourceFlowNodeSchemaDto> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const definition = getPluginFlowNode(nodeType);
    if (!definition) {
      throw new NotFoundException(`Plugin flow node type "${nodeType}" was not found.`);
    }

    const configSchema = definition.resolveConfigSchema
      ? await definition.resolveConfigSchema(config, purpose === 'preview' ? { resourceId, purpose } : { resourceId })
      : definition.configSchema;
    if (!configSchema) {
      throw new Error(`Plugin flow node type "${nodeType}" does not provide a configuration schema.`);
    }

    return this.pluginNodeSchema(
      definition,
      purpose === 'preview'
        ? { dynamic: true, type: 'object', properties: {}, preview: configSchema.preview ?? [] }
        : configSchema,
    );
  }

  protected async validateNodeData(
    nodeData: { id: string; type: string; data: unknown },
    validationContext = new Map<string, unknown>(),
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Non-core types must belong to a registered plugin; reject unknown types at save time.
    if (!Object.values(ResourceFlowNodeType).includes(nodeData.type as ResourceFlowNodeType)) {
      if (!getPluginFlowNode(nodeData.type)) {
        errors.push({
          nodeId: nodeData.id,
          nodeType: nodeData.type,
          field: 'type',
          message: `Unknown node type: ${nodeData.type}`,
        });
      }
      const plugin = getPluginFlowNode(nodeData.type);
      if (plugin?.validateConfig) {
        const validationErrors = await plugin.validateConfig(
          nodeData.data as Record<string, unknown>,
          validationContext,
        );
        errors.push(
          ...validationErrors.map((error) => ({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            ...error,
          })),
        );
      }
      return errors;
    }

    try {
      const schema = getNodeDataSchema(nodeData.type as ResourceFlowNodeType);
      const data = schema.parse(nodeData.data);
      if (nodeData.type.includes('.resource.metering.') && data && typeof data === 'object' && 'meterId' in data) {
        const resourceId = validationContext.get('meterResourceId');
        if (
          typeof resourceId === 'number' &&
          !(await this.resourceMeterIds(resourceId, validationContext)).has(Number(data.meterId))
        ) {
          errors.push({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            field: 'meterId',
            message: 'Choose a meter belonging to this resource',
          });
        }
      }
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

  private resourceMeterIds(resourceId: number, validationContext: Map<string, unknown>): Promise<Set<number>> {
    const cacheKey = `resource-flow:meter-ids:${resourceId}`;
    let meterIds = validationContext.get(cacheKey) as Promise<Set<number>> | undefined;
    if (!meterIds) {
      meterIds = this.resourceRepository.manager
        .find(ResourceMeter, { where: { resourceId }, select: { id: true } })
        .then((meters) => new Set(meters.map((meter) => meter.id)));
      // Share the pending lookup with concurrent validators; each flow request has a fresh context.
      validationContext.set(cacheKey, meterIds);
    }
    return meterIds;
  }

  public async getNodeSchemas(resourceId: number): Promise<ResourceFlowNodeSchemaDto[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const coreSchemas = getCoreNodeSchemas(resource.type);

    // Append plugin-contributed node schemas.
    const pluginSchemas = getRegisteredPluginFlowNodes().map((definition) => {
      const configSchema =
        definition.configSchema ?? (definition.resolveConfigSchema ? { dynamic: true, properties: {} } : undefined);
      if (!configSchema) {
        throw new Error(`Plugin flow node type "${definition.type}" does not provide a configuration schema.`);
      }
      return this.pluginNodeSchema(definition, configSchema);
    });

    return [...coreSchemas, ...pluginSchemas];
  }

  protected pluginNodeSchema(
    definition: NonNullable<ReturnType<typeof getPluginFlowNode>>,
    configSchema: Record<string, unknown>,
  ): ResourceFlowNodeSchemaDto {
    return {
      type: definition.type,
      label: definition.label,
      description: definition.description,
      configSchema,
      inputs: [...definition.inputs],
      outputs: [...definition.outputs],
      supportedByResource: definition.supportedByAllResources !== false,
      isOutput: definition.isOutput ?? false,
      isInput: definition.isInput ?? false,
    };
  }
}
