import { Resource } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { FlowNodeExecutorRegistryImplementation } from './flow-node-executor-registry';
import { FlowResourceContext } from './resource-flows-executor.service.feature-definitions';
export abstract class FlowResourceContextImplementation extends FlowNodeExecutorRegistryImplementation {
  protected isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  protected async getResourceContext(
    resourceId: number,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<FlowResourceContext> {
    const cached = cache?.get(resourceId);
    if (cached) {
      return cached;
    }

    const repository = this.getRepository(Resource, this.resourceRepository, transactionManager);
    const resource = await repository.findOne({ where: { id: resourceId } });

    const context: FlowResourceContext = {
      id: resourceId,
      name: resource?.name,
      type: resource?.type,
      metadata: resource?.metadata ?? null,
    };

    cache?.set(resourceId, context);

    return context;
  }

  protected async withResourceContext(
    resourceId: number,
    payload: unknown,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<unknown> {
    if (!this.isPlainObject(payload)) {
      return payload;
    }

    const context = await this.getResourceContext(resourceId, transactionManager, cache);
    const variables = await this.variablesService.getAll(resourceId);
    const payloadRecord = payload as Record<string, unknown>;
    const existingResource = payloadRecord.resource;

    let result: Record<string, unknown>;
    if (this.isPlainObject(existingResource)) {
      const existingMetadata = (existingResource as Record<string, unknown>).metadata;
      const metadata = existingMetadata ?? context.metadata ?? null;

      result = {
        ...payloadRecord,
        resource: {
          ...(existingResource as Record<string, unknown>),
          ...context,
          metadata,
        },
      };
    } else {
      result = {
        ...payloadRecord,
        resource: context,
      };
    }

    this.templateVariables.set(result, variables);
    return result;
  }
}
