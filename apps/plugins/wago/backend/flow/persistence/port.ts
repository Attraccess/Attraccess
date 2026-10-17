import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoController } from '../../controllers/record';
import type { WagoSettings } from '../../controllers/settings.record';
import type { WagoConfigurationRevision } from '../../configuration/revision.record';

export abstract class WagoFlowPersistence {
  abstract claimedControllers(id?: number, orderByName?: boolean): Promise<WagoController[]>;
  abstract settings(): Promise<WagoSettings | null>;
  abstract latestAppliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;
  abstract latestAppliedRevisions(controllerIds: number[]): Promise<WagoConfigurationRevision[]>;
}
export const WAGO_FLOW_READS = pluginOperationToken<WagoFlowPersistence>('wago flow configuration', [
  'claimedControllers',
  'settings',
  'latestAppliedRevision',
  'latestAppliedRevisions',
]);

export interface WagoDiagnosticNode {
  id: string;
  resourceId: number;
  type: string;
  data: Record<string, unknown>;
}
export interface WagoControllerDiagnosticSnapshot {
  controller: WagoController | null;
  draft: import('../../configuration/draft.record').WagoConfigurationDraft | null;
  latest: WagoConfigurationRevision | null;
  applied: WagoConfigurationRevision | null;
  nodes: WagoDiagnosticNode[];
}
export abstract class WagoDiagnosticsPersistence {
  abstract targetExists(kind: 'controller' | 'session', id: number): Promise<boolean>;
  abstract controllerSnapshot(controllerId: number): Promise<WagoControllerDiagnosticSnapshot>;
  abstract resourceNodes(resourceId: number): Promise<WagoDiagnosticNode[]>;
  abstract resourceDependencies(
    controllerIds: number[],
    channelIds: string[],
  ): Promise<{
    controllers: Array<Pick<WagoController, 'id' | 'name' | 'hardwareId'>>;
    appliedRevisions: Array<Pick<WagoConfigurationRevision, 'controllerId' | 'revision' | 'snapshot'>>;
    conflictNodes: WagoDiagnosticNode[];
  }>;
  abstract resourceNames(ids: number[]): Promise<Array<{ id: number; name: string }>>;
}
export const WAGO_DIAGNOSTICS = pluginOperationToken<WagoDiagnosticsPersistence>('wago diagnostic dependencies', [
  'targetExists',
  'controllerSnapshot',
  'resourceNodes',
  'resourceDependencies',
  'resourceNames',
]);
