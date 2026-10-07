import type { WagoConfigurationSnapshot } from './configuration';
import { wagoFlowPreview } from './wago-flow-preview';
import { MAX_TIMEOUT_MS } from './wago-flow.state';
import { NodeKind } from './wago-flow.contracts';
import { WagoFlowServiceRefreshOperation } from './wago-flow.wago-flow-service-refresh-operation';
export abstract class WagoFlowServiceResolveConfigSchemaOperation extends WagoFlowServiceRefreshOperation {
  async resolveConfigSchema(
    config: Record<string, unknown>,
    kind: NodeKind,
    validationContext = new Map<string, unknown>(),
    previewOnly = false,
  ): Promise<Record<string, unknown>> {
    const controllerCacheKey = previewOnly
      ? `wago-flow-controllers:preview:${config.controllerId}`
      : 'wago-flow-controllers';
    const controllers = await this.cached(validationContext, controllerCacheKey, () =>
      previewOnly && typeof config.controllerId !== 'number'
        ? Promise.resolve([])
        : this.controllers.find({
            where: { trustState: 'claimed', ...(previewOnly ? { id: config.controllerId as number } : {}) },
            order: { name: 'ASC' },
          }),
    );
    const selected =
      typeof config.controllerId === 'number'
        ? controllers.find((controller) => controller.id === config.controllerId)
        : undefined;
    const revision = selected
      ? await this.cached(validationContext, `wago-applied-revision:${selected.id}`, async () => {
          const [latest] = await this.revisions.find({
            where: { controllerId: selected.id, state: 'applied' },
            order: { revision: 'DESC' },
            take: 1,
          });
          return latest ?? null;
        })
      : null;
    const snapshot: WagoConfigurationSnapshot | null = revision ? JSON.parse(revision.snapshot) : null;
    const channels = snapshot?.logicalChannels ?? [];
    let names: Record<string, unknown> = {};
    try {
      names = JSON.parse(revision?.presetProvenance ?? 'null')?.editor?.names ?? {};
    } catch {
      // Older configurations may not have visual editor labels.
    }
    if (previewOnly)
      return {
        dynamic: true,
        type: 'object',
        properties: {},
        preview: wagoFlowPreview(config, kind, selected, snapshot, names),
      };
    const channel = channels.find((item) => item.id === config.channelId);
    const properties: Record<string, unknown> = {
      controllerId: {
        type: 'number',
        title: 'Controller',
        refreshesSchema: true,
        oneOf: controllers.map((controller) => ({
          const: controller.id,
          title: controller.name ?? controller.hardwareId,
        })),
        description:
          selected && !revision ? 'Publish a configuration and wait for the controller to apply it first.' : undefined,
      },
      channelId: {
        type: 'string',
        title: 'Logical Channel',
        refreshesSchema: true,
        oneOf: channels.map((channel) => ({
          const: channel.id,
          title: typeof names[channel.id] === 'string' ? names[channel.id] : channel.id,
        })),
      },
    };
    if (kind === 'event') {
      properties.category = {
        type: 'string',
        title: 'Event category',
        oneOf: this.categories(channel).map((category) => ({ const: category, title: category })),
      };
      properties.minimumIntervalMs = { type: 'number', title: 'Minimum interval (ms)', minimum: 0, default: 0 };
      if (channel?.capabilities.includes('measurement'))
        properties.minimumChange = { type: 'number', title: 'Minimum change (wire units)', minimum: 0 };
    }
    if (kind !== 'event')
      properties.category = {
        type: 'string',
        title: 'State category',
        refreshesSchema: true,
        oneOf: this.readCategories(channel).map((category) => ({ const: category, title: category })),
      };
    if (kind === 'wait') {
      properties.equals = {
        type: config.category === 'measurement' ? 'number' : 'boolean',
        title: config.category === 'measurement' ? 'Equals (wire value)' : 'Equals',
      };
      properties.timeoutMs = {
        type: 'number',
        title: 'Timeout (ms)',
        minimum: 1,
        maximum: MAX_TIMEOUT_MS,
        default: 30_000,
      };
    }
    return {
      dynamic: true,
      type: 'object',
      preview: wagoFlowPreview(config, kind, selected, snapshot, names),
      properties,
      required: ['controllerId', 'channelId', 'category', ...(kind === 'wait' ? ['equals', 'timeoutMs'] : [])],
    };
  }
}
