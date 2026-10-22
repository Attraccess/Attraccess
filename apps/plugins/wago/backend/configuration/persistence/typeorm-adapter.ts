import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import type { ResourceFlowNode } from '@attraccess/plugins-backend-sdk/v2';
import { WagoConfigurationDraft } from '../draft.entity';
import { WagoConfigurationRevision } from '../revision.entity';
import { DraftWrite, RevisionWrite, WagoConfigurationPersistence } from './port';

export class TypeormWagoConfigurationPersistence extends WagoConfigurationPersistence {
  constructor(
    private readonly draftSource: () => Repository<WagoConfigurationDraft>,
    private readonly revisionSource: () => Repository<WagoConfigurationRevision>,
    private readonly flowSource: () => Repository<ResourceFlowNode>,
  ) {
    super();
  }
  private get drafts() {
    return this.draftSource();
  }
  private get revisions() {
    return this.revisionSource();
  }
  async commandReferences(controllerId: number, channelId: string, resourceId: number) {
    const nodes = await this.flowSource()
      .createQueryBuilder('node')
      .select(['node.id', 'node.resourceId'])
      .where('node.type = :type', { type: 'plugin.wago.command' })
      .andWhere('node.resourceId <> :resourceId', { resourceId })
      .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
      .andWhere("node.data ->> 'channelId' = :channelId", { channelId })
      .getMany();
    return nodes.map(({ id, resourceId }) => ({ id, resourceId }));
  }
  async draft(controllerId: number) {
    const row = await this.drafts.findOneBy({ controllerId });
    return row ? { ...row } : null;
  }
  async saveDraft(input: DraftWrite) {
    return { ...(await this.drafts.save(this.drafts.create(input))) };
  }
  async removeDraft(controllerId: number): Promise<void> {
    await this.drafts.delete({ controllerId });
  }
  async latestRevision(controllerId: number, appliedOnly = false) {
    const [row] = await this.revisions.find({
      where: { controllerId, ...(appliedOnly ? { state: 'applied' as const } : {}) },
      order: { revision: 'DESC' },
      take: 1,
    });
    return row ? { ...row } : null;
  }
  async revision(controllerId: number, revision: number) {
    const row = await this.revisions.findOneBy({ controllerId, revision });
    return row ? { ...row } : null;
  }
  async revisionPage(controllerId: number, offset: number, limit: number) {
    return (
      await this.revisions.find({
        where: { controllerId },
        order: { revision: 'DESC' },
        select: [
          'id',
          'controllerId',
          'revision',
          'contentHash',
          'state',
          'rejectionErrors',
          'rejectionAcknowledgedAt',
          'rejectionAcknowledgedBy',
          'publishedAt',
          'reportedAt',
          'presetProvenance',
        ],
        skip: offset,
        take: limit,
      })
    ).map(({ snapshot: _snapshot, ...row }) => row);
  }
  async saveRevision(input: RevisionWrite) {
    return { ...(await this.revisions.save(this.revisions.create(input))) };
  }
  async removeRevisions(controllerId: number): Promise<void> {
    await this.revisions.delete({ controllerId });
  }
  async flowReferences(controllerId: number) {
    const rows = await this.flowSource()
      .createQueryBuilder('node')
      .select(['node.id', 'node.resourceId', 'node.type', 'node.data'])
      .where('node.type LIKE :type', { type: 'plugin.wago.%' })
      .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
      .getMany();
    return rows.map(({ id, resourceId, type, data }) => ({ id, resourceId, type, data }));
  }
}
