import type { TransactionContext } from '../../../database/transaction-context';
import type { FlowTriggerStore } from '../flow-trigger-store.port';
import { ResourceFlowVariablesService } from '../variables/resource-flow-variables.service';
import { compileFlowTemplate } from './flow-template';
import type { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { NodeExecutionContext, TemplateVariables } from '../node-executors';

/** Resource enrichment and template variables shared by every node in a run. */
export class FlowExecutionContext {
  private readonly templateVariables = new WeakMap<object, TemplateVariables>();

  constructor(
    private readonly store: Pick<FlowTriggerStore, 'findResource'>,
    private readonly variablesService: ResourceFlowVariablesService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private async getResourceContext(
    resourceId: number,
    transactionManager?: TransactionContext,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<FlowResourceContext> {
    const cached = cache?.get(resourceId);
    if (cached) {
      return cached;
    }

    const resource = await this.store.findResource(resourceId, transactionManager);

    const context: FlowResourceContext = {
      id: resourceId,
      name: resource?.name,
      type: resource?.type,
      metadata: resource?.metadata ?? null,
    };

    cache?.set(resourceId, context);

    return context;
  }

  /** The resource of a run: the node's own, else the triggering resource. Null when there is none. */
  resolveRunResourceId(
    node: { resourceId: number | null },
    options: Pick<FlowExecutionOptions, 'triggeringResourceId'> = {},
  ): number | null {
    return node.resourceId ?? options.triggeringResourceId ?? null;
  }

  /**
   * Adds the run's resource (when it has one) to the payload and loads the template variables. Runs without a
   * resource keep their payload as it is: there is no `resource` object.
   */
  async withResourceContext(
    resourceId: number | null,
    payload: unknown,
    transactionManager?: TransactionContext,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<unknown> {
    if (!this.isPlainObject(payload)) {
      return payload;
    }

    const payloadRecord = payload as Record<string, unknown>;
    if (resourceId === null) {
      const result = { ...payloadRecord };
      this.templateVariables.set(result, await this.variablesService.getAll(null));
      return result;
    }

    const context = await this.getResourceContext(resourceId, transactionManager, cache);
    const variables = await this.variablesService.getAll(resourceId);
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
    transactionManager?: TransactionContext,
    options: FlowExecutionOptions = {},
    resourceId: number | null = options.triggeringResourceId ?? null,
  ): NodeExecutionContext {
    return {
      flowRunId,
      resourceId,
      getResourceType: async () =>
        resourceId === null ? undefined : (await this.getResourceContext(resourceId, transactionManager)).type,
      actorUserId: options.actorUserId,
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
