import { Resource } from '@attraccess/database-entities';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { compileFlowTemplate } from './flow-template';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { NodeExecutionContext, TemplateVariables } from '../node-executors';

export function getFlowRepository<T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  defaultRepository: Repository<T>,
  transactionManager?: EntityManager,
): Repository<T> {
  return transactionManager ? transactionManager.getRepository<T>(entity) : defaultRepository;
}

/** Resource enrichment and template variables shared by every node in a run. */
export class FlowExecutionContext {
  private readonly templateVariables = new WeakMap<object, TemplateVariables>();

  constructor(
    private readonly resourceRepository: Repository<Resource>,
    private readonly variablesService: ResourceFlowVariablesService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private async getResourceContext(
    resourceId: number,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<FlowResourceContext> {
    const cached = cache?.get(resourceId);
    if (cached) {
      return cached;
    }

    const repository = getFlowRepository(Resource, this.resourceRepository, transactionManager);
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

  async withResourceContext(
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

  buildExecutionContext(
    flowRunId: string,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): NodeExecutionContext {
    return {
      flowRunId,
      lifecycleAttemptId: options.lifecycleAttemptId,
      lifecycleCandidateCancellation: options.lifecycleCandidateCancellation,
      metering: options.metering,
      transactionManager,
      compileTemplate: (template, data) => this.compileTemplate(template, data),
      getTemplateVariables: (data) => this.templateVariables.get(data),
      setTemplateVariables: (data, variables) => this.templateVariables.set(data, variables),
    };
  }

  private compileTemplate(template: string, data: object): string {
    const variables = this.templateVariables.get(data);
    const dataWithVariables = variables ? { ...data, variables } : data;
    return compileFlowTemplate(template, dataWithVariables);
  }
}
