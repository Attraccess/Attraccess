import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { ResourceFlowNode } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoConfigurationDraft } from '../draft.record';
import type { WagoConfigurationRevision } from '../revision.record';

export type DraftWrite = Omit<WagoConfigurationDraft, 'id'> & { id?: number };
export type RevisionWrite = Omit<
  WagoConfigurationRevision,
  'id' | 'rejectionAcknowledgedAt' | 'rejectionAcknowledgedBy'
> & { id?: number; rejectionAcknowledgedAt?: string | null; rejectionAcknowledgedBy?: number | null };
export abstract class WagoConfigurationPersistence {
  abstract draft(controllerId: number): Promise<WagoConfigurationDraft | null>;
  abstract saveDraft(input: DraftWrite): Promise<WagoConfigurationDraft>;
  abstract removeDraft(controllerId: number): Promise<void>;
  abstract latestRevision(controllerId: number, appliedOnly?: boolean): Promise<WagoConfigurationRevision | null>;
  abstract revision(controllerId: number, revision: number): Promise<WagoConfigurationRevision | null>;
  abstract revisionPage(
    controllerId: number,
    offset: number,
    limit: number,
  ): Promise<Array<Omit<WagoConfigurationRevision, 'snapshot'>>>;
  abstract saveRevision(input: RevisionWrite): Promise<WagoConfigurationRevision>;
  abstract removeRevisions(controllerId: number): Promise<void>;
  abstract commandReferences(
    controllerId: number,
    channelId: string,
    resourceId: number,
  ): Promise<Array<Pick<ResourceFlowNode, 'id' | 'resourceId'>>>;
  abstract flowReferences(
    controllerId: number,
  ): Promise<Array<Pick<ResourceFlowNode, 'id' | 'resourceId' | 'type' | 'data'>>>;
}
export const WAGO_CONFIGURATION = pluginOperationToken<WagoConfigurationPersistence>('wago configuration history', [
  'draft',
  'saveDraft',
  'removeDraft',
  'latestRevision',
  'revision',
  'revisionPage',
  'saveRevision',
  'removeRevisions',
  'flowReferences',
  'commandReferences',
]);
