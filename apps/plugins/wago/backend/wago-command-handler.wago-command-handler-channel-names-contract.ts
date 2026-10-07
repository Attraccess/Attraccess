import type { randomUUID } from 'node:crypto';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoCommandConfig } from './wago-command-handler.contracts';

export abstract class WagoCommandHandlerChannelNamesContract {
  protected abstract channelNames(
    controllerId: number | undefined,
    revision: WagoConfigurationRevision | null,
    appliedOnly?: boolean,
  ): Promise<Record<string, unknown>>;
  abstract schema(
    config: Record<string, unknown>,
    resourceId: number,
    previewOnly?: boolean,
  ): Promise<Record<string, unknown>>;
  abstract validate(
    config: Record<string, unknown>,
    validationContext?: Map<string, unknown>,
    manual?: boolean,
  ): Promise<{ field: string; message: string; value?: unknown }[]>;
  abstract execute(
    config: Record<string, unknown>,
    commandId?: ReturnType<typeof randomUUID>,
    source?: 'manual',
  ): Promise<void>;
  abstract acknowledge(controllerId: number, payload: Buffer): void;
  abstract destroy(): void;
  protected abstract references(controllerId: number, channelId: string, resourceId: number): Promise<string[]>;
  protected abstract parse(
    config: WagoCommandConfig,
    manual?: boolean,
  ):
    | {
        value: {
          controllerId: number;
          channelId: string;
          action: 'set' | 'pulse' | 'release';
          value?: boolean;
          expectedConfigurationRevision: number;
          completionBehavior: 'dispatch' | 'acknowledged';
          acknowledgementTimeoutSeconds: number;
        };
      }
    | { errors: Array<{ field: string; message: string; value?: unknown }> };
  protected abstract waitForAcknowledgement(id: string, controllerId: number, timeoutSeconds: number): Promise<void>;
  protected abstract resolve(id: string): void;
  protected abstract reject(id: string, error: Error): void;
  protected abstract cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T>;
}
