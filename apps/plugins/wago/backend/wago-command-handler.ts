import { randomUUID } from 'node:crypto';
import { ResourceFlowNode } from '@attraccess/plugins-backend-sdk';
import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { commandTopic } from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 30;
const MAX_COMMAND_TIMEOUT_SECONDS = 300;

type WagoCommandConfig = {
  controllerId?: unknown;
  channelId?: unknown;
  action?: unknown;
  value?: unknown;
  expectedConfigurationRevision?: unknown;
  completionBehavior?: unknown;
  acknowledgementTimeoutSeconds?: unknown;
  failureBehavior?: unknown;
};

export class WagoCommandError extends Error {
  constructor(
    message: string,
    readonly kind: 'transport-dispatch' | 'acknowledgement-timeout' | 'controller-rejection',
  ) {
    super(message);
    this.name = 'WagoCommandError';
  }
}

type Dependencies = {
  context: PluginContext;
  controllers: () => Repository<WagoController>;
  claimedController: (id: number) => Promise<WagoController>;
  getSettings: () => Promise<{ operationalPrefix: string }>;
  appliedRevision: (controllerId: number) => Promise<WagoConfigurationRevision | null>;
  onCommand?: (controllerId: number, channelId: string, id: string) => void;
  onCommandFailure?: (id: string, status: 'dispatch-failed' | 'timeout') => void;
};

export class WagoCommandHandler {
  private readonly pending = new Map<
    string,
    { controllerId: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly dependencies: Dependencies) {}

  async schema(config: Record<string, unknown>, resourceId: number): Promise<Record<string, unknown>> {
    const controllers = await this.dependencies
      .controllers()
      .find({ where: { trustState: 'claimed' }, order: { name: 'ASC' } });
    const controllerId = positiveInteger(config.controllerId);
    const revision = controllerId ? await this.dependencies.appliedRevision(controllerId) : null;
    const snapshot = revision
      ? (JSON.parse(revision.snapshot) as {
          logicalChannels: Array<{ id: string; profile: string; capabilities: string[] }>;
        })
      : null;
    const channelId = typeof config.channelId === 'string' ? config.channelId : undefined;
    const outputChannels = snapshot?.logicalChannels.filter((item) => item.capabilities.includes('output')) ?? [];
    let names: Record<string, unknown> = {};
    if (controllerId) {
      const draft = await this.dependencies.context.getRepository(WagoConfigurationDraft).findOneBy({ controllerId });
      try {
        const storedNames = JSON.parse(revision?.presetProvenance ?? draft?.presetProvenance ?? 'null')?.editor?.names;
        if (storedNames && typeof storedNames === 'object' && !Array.isArray(storedNames)) names = storedNames;
      } catch {
        /* Drafts created before the visual editor have no channel labels. */
      }
    }
    const channel = outputChannels.find((item) => item.id === channelId);
    const references = channelId && controllerId ? await this.references(controllerId, channelId, resourceId) : [];
    const properties: Record<string, unknown> = {
      controllerId: {
        type: 'number',
        title: 'Controller',
        enum: controllers.map((controller) => controller.id),
        oneOf: controllers.map((controller) => ({
          const: controller.id,
          title: controller.name ?? controller.hardwareId,
        })),
        refreshesSchema: true,
        description:
          controllerId && !revision
            ? 'Publish a configuration and wait for the controller to apply it before authoring commands.'
            : undefined,
      },
    };
    if (controllerId && revision && snapshot) {
      properties.channelId = {
        type: 'string',
        title: 'Logical Channel',
        oneOf: outputChannels.map((item) => ({
          const: item.id,
          title: typeof names[item.id] === 'string' ? names[item.id] : `${item.id} (${item.profile})`,
        })),
        refreshesSchema: true,
        description: references.length
          ? `Also controlled by resource flow node${references.length === 1 ? '' : 's'}: ${references.join(', ')}. Reuse is allowed.`
          : outputChannels.length
            ? undefined
            : 'This applied configuration has no output channels. Add an output and publish it first.',
      };
    }
    if (channel) {
      const actions = channel.capabilities.includes('output')
        ? [
            { const: 'set', title: 'Set state' },
            ...(channel.capabilities.includes('pulse') ? [{ const: 'pulse', title: 'Pulse' }] : []),
          ]
        : [];
      properties.action = { type: 'string', title: 'Operation', oneOf: actions, refreshesSchema: true };
      if (config.action === 'set') properties.value = { type: 'boolean', title: 'State', default: false };
      properties.expectedConfigurationRevision = {
        type: 'number',
        title: 'Configuration revision',
        default: revision.revision,
        readOnly: true,
      };
      properties.completionBehavior = {
        type: 'string',
        title: 'Completion',
        oneOf: [
          { const: 'acknowledged', title: 'Wait for controller acknowledgement' },
          { const: 'dispatch', title: 'Publish only' },
        ],
        default: 'acknowledged',
        refreshesSchema: true,
      };
      if (config.completionBehavior !== 'dispatch')
        properties.acknowledgementTimeoutSeconds = {
          type: 'number',
          title: 'Acknowledgement timeout',
          minimum: 1,
          maximum: MAX_COMMAND_TIMEOUT_SECONDS,
          default: DEFAULT_COMMAND_TIMEOUT_SECONDS,
          unit: 'seconds',
        };
      properties.failureBehavior = {
        type: 'string',
        title: 'On failure',
        oneOf: [
          { const: 'fail-flow', title: 'Fail flow' },
          { const: 'failure-output', title: 'Use failure output' },
          { const: 'log-and-continue', title: 'Log and continue' },
        ],
        default: 'fail-flow',
      };
    }
    return {
      dynamic: true,
      type: 'object',
      properties,
      required: [
        ...new Set([
          'controllerId',
          'channelId',
          'action',
          'expectedConfigurationRevision',
          ...Object.keys(properties),
        ]),
      ],
    };
  }

  async validate(config: Record<string, unknown>, validationContext = new Map<string, unknown>()) {
    const parsed = this.parse(config);
    if ('errors' in parsed) return parsed.errors;
    const { controllerId, channelId, action, expectedConfigurationRevision } = parsed.value;
    const controller = await this.cached(validationContext, `wago-controller:${controllerId}`, () =>
      this.dependencies.controllers().findOneBy({ id: controllerId }),
    );
    if (!controller || controller.trustState !== 'claimed')
      return [{ field: 'controllerId', message: 'Select a claimed WAGO controller.' }];
    const revision = await this.cached(validationContext, `wago-applied-revision:${controllerId}`, () =>
      this.dependencies.appliedRevision(controllerId),
    );
    if (!revision) return [{ field: 'controllerId', message: 'The controller has no applied configuration revision.' }];
    if (revision.revision !== expectedConfigurationRevision)
      return [
        {
          field: 'expectedConfigurationRevision',
          message: 'The controller configuration changed. Reopen the node and save the current revision.',
        },
      ];
    const snapshot = JSON.parse(revision.snapshot) as {
      logicalChannels: Array<{ id: string; capabilities: string[] }>;
    };
    const channel = snapshot.logicalChannels.find((item) => item.id === channelId);
    if (!channel) return [{ field: 'channelId', message: 'The selected Logical Channel no longer exists.' }];
    if (!channel.capabilities.includes('output'))
      return [{ field: 'channelId', message: 'The selected Logical Channel no longer supports output commands.' }];
    if (action === 'pulse' && !channel.capabilities.includes('pulse'))
      return [{ field: 'action', message: 'The selected Logical Channel no longer supports pulses.' }];
    return [];
  }

  async execute(config: Record<string, unknown>): Promise<void> {
    const errors = await this.validate(config);
    if (errors.length)
      throw new WagoCommandError(errors.map((error) => error.message).join(' '), 'controller-rejection');
    const parsed = this.parse(config);
    if ('errors' in parsed)
      throw new WagoCommandError(parsed.errors.map((error) => error.message).join(' '), 'controller-rejection');
    const {
      controllerId,
      channelId,
      action,
      value,
      expectedConfigurationRevision,
      completionBehavior,
      acknowledgementTimeoutSeconds,
    } = parsed.value;
    const controller = await this.dependencies.claimedController(controllerId);
    if (!controller.mqttServerId)
      throw new WagoCommandError(`WAGO controller ${controllerId} has no MQTT server`, 'transport-dispatch');
    const settings = await this.dependencies.getSettings();
    const id = randomUUID();
    this.dependencies.onCommand?.(controllerId, channelId, id);
    const command = JSON.stringify({
      id,
      expiresAt: new Date(Date.now() + acknowledgementTimeoutSeconds * 1000).toISOString(),
      channelId,
      action,
      ...(action === 'set' ? { value } : {}),
      expectedConfigurationRevision,
    });
    const acknowledgement =
      completionBehavior === 'acknowledged'
        ? this.waitForAcknowledgement(id, controllerId, acknowledgementTimeoutSeconds)
        : undefined;
    try {
      await this.dependencies.context.mqtt.publish(
        controller.mqttServerId,
        commandTopic(settings.operationalPrefix, controller.hardwareId),
        command,
        { qos: 1, retain: false },
      );
    } catch (error) {
      this.dependencies.onCommandFailure?.(id, 'dispatch-failed');
      const dispatchError = new WagoCommandError(
        `Failed to publish WAGO command: ${String(error)}`,
        'transport-dispatch',
      );
      this.reject(id, dispatchError);
      if (acknowledgement) await acknowledgement.catch(() => undefined);
      throw dispatchError;
    }
    await acknowledgement;
  }

  acknowledge(controllerId: number, payload: Buffer): void {
    let acknowledgement: { id?: unknown; status?: unknown; error?: unknown; message?: unknown };
    try {
      acknowledgement = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (
      typeof acknowledgement.id !== 'string' ||
      !['accepted', 'duplicate', 'rejected'].includes(acknowledgement.status as string)
    )
      return;
    const pending = this.pending.get(acknowledgement.id);
    if (!pending || pending.controllerId !== controllerId) return;
    if (acknowledgement.status === 'accepted' || acknowledgement.status === 'duplicate')
      return this.resolve(acknowledgement.id);
    this.reject(
      acknowledgement.id,
      new WagoCommandError(
        typeof acknowledgement.message === 'string'
          ? acknowledgement.message
          : typeof acknowledgement.error === 'string'
            ? acknowledgement.error
            : 'controller rejected command',
        'controller-rejection',
      ),
    );
  }

  destroy(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new WagoCommandError('WAGO command cancelled during shutdown', 'transport-dispatch'));
      this.pending.delete(id);
    }
  }

  private async references(controllerId: number, channelId: string, resourceId: number): Promise<string[]> {
    const nodes = await this.dependencies.context.dataSource
      .getRepository(ResourceFlowNode)
      .createQueryBuilder('node')
      .select(['node.id', 'node.resourceId'])
      .where('node.type = :type', { type: 'plugin.wago.command' })
      .andWhere('node.resourceId <> :resourceId', { resourceId })
      .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
      .andWhere("node.data ->> 'channelId' = :channelId", { channelId })
      .getMany();
    return nodes.map((node) => `resource ${node.resourceId} / node ${node.id}`);
  }

  private parse(config: WagoCommandConfig):
    | {
        value: {
          controllerId: number;
          channelId: string;
          action: 'set' | 'pulse';
          value?: boolean;
          expectedConfigurationRevision: number;
          completionBehavior: 'dispatch' | 'acknowledged';
          acknowledgementTimeoutSeconds: number;
        };
      }
    | { errors: Array<{ field: string; message: string; value?: unknown }> } {
    const errors: Array<{ field: string; message: string; value?: unknown }> = [];
    const controllerId = positiveInteger(config.controllerId);
    const expectedConfigurationRevision = positiveInteger(config.expectedConfigurationRevision);
    const channelId = typeof config.channelId === 'string' && config.channelId.trim() ? config.channelId : undefined;
    const action = config.action === 'set' || config.action === 'pulse' ? config.action : undefined;
    const completionBehavior = config.completionBehavior === 'dispatch' ? 'dispatch' : 'acknowledged';
    const parsedTimeout = positiveInteger(config.acknowledgementTimeoutSeconds);
    const acknowledgementTimeoutSeconds = parsedTimeout ?? DEFAULT_COMMAND_TIMEOUT_SECONDS;
    if (!controllerId)
      errors.push({ field: 'controllerId', message: 'A WAGO controller is required.', value: config.controllerId });
    if (!channelId)
      errors.push({ field: 'channelId', message: 'A Logical Channel is required.', value: config.channelId });
    if (!action) errors.push({ field: 'action', message: 'A supported operation is required.', value: config.action });
    if (action === 'set' && typeof config.value !== 'boolean')
      errors.push({ field: 'value', message: 'Set state requires a boolean value.', value: config.value });
    if (!expectedConfigurationRevision)
      errors.push({
        field: 'expectedConfigurationRevision',
        message: 'A configuration revision is required.',
        value: config.expectedConfigurationRevision,
      });
    if (
      config.completionBehavior !== undefined &&
      config.completionBehavior !== 'dispatch' &&
      config.completionBehavior !== 'acknowledged'
    )
      errors.push({
        field: 'completionBehavior',
        message: 'Completion must be publish only or wait for acknowledgement.',
        value: config.completionBehavior,
      });
    if (!positiveInteger(config.acknowledgementTimeoutSeconds) && config.acknowledgementTimeoutSeconds !== undefined)
      errors.push({
        field: 'acknowledgementTimeoutSeconds',
        message: 'Acknowledgement timeout must be a positive number of seconds.',
        value: config.acknowledgementTimeoutSeconds,
      });
    if (parsedTimeout !== undefined && parsedTimeout > MAX_COMMAND_TIMEOUT_SECONDS)
      errors.push({
        field: 'acknowledgementTimeoutSeconds',
        message: `Acknowledgement timeout must not exceed ${MAX_COMMAND_TIMEOUT_SECONDS} seconds.`,
        value: config.acknowledgementTimeoutSeconds,
      });
    if (
      config.failureBehavior !== undefined &&
      !['fail-flow', 'failure-output', 'log-and-continue'].includes(config.failureBehavior as string)
    )
      errors.push({
        field: 'failureBehavior',
        message: 'Select a supported failure policy.',
        value: config.failureBehavior,
      });
    if (errors.length) return { errors };
    return {
      value: {
        controllerId: controllerId as number,
        channelId: channelId as string,
        action: action as 'set' | 'pulse',
        ...(action === 'set' ? { value: config.value as boolean } : {}),
        expectedConfigurationRevision: expectedConfigurationRevision as number,
        completionBehavior,
        acknowledgementTimeoutSeconds,
      },
    };
  }

  private waitForAcknowledgement(id: string, controllerId: number, timeoutSeconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.reject(
            id,
            new WagoCommandError('Timed out waiting for WAGO controller acknowledgement', 'acknowledgement-timeout'),
          ),
        timeoutSeconds * 1000,
      );
      this.pending.set(id, { controllerId, resolve, reject, timer });
    });
  }
  private resolve(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve();
  }
  private reject(id: string, error: Error): void {
    if (error instanceof WagoCommandError && error.kind === 'acknowledgement-timeout')
      this.dependencies.onCommandFailure?.(id, 'timeout');
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  private cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
    const cached = context.get(key) as Promise<T> | undefined;
    if (cached) return cached;
    const value = load();
    context.set(key, value);
    return value;
  }
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}
