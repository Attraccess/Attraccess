import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { Repository } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';

export type Dependencies = {
  context: PluginContext;
  controllers: () => Repository<WagoController>;
  claimedController: (id: number) => Promise<WagoController>;
  getSettings: () => Promise<{ operationalPrefix: string }>;
  appliedRevision: (controllerId: number) => Promise<WagoConfigurationRevision | null>;
  onCommand?: (controllerId: number, channelId: string, id: string) => void;
  onCommandFailure?: (id: string, status: 'dispatch-failed' | 'timeout') => void;
};
export type WagoCommandConfig = {
  controllerId?: unknown;
  channelId?: unknown;
  action?: unknown;
  value?: unknown;
  expectedConfigurationRevision?: unknown;
  completionBehavior?: unknown;
  acknowledgementTimeoutSeconds?: unknown;
  failureBehavior?: unknown;
};
