import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceApplyPresetOperation } from './wago.service.wago-service-apply-preset-operation';


export abstract class WagoServiceRevisionsForOperation extends WagoServiceApplyPresetOperation {
  async revisionsFor(
    controllerId: number,
    offset = 0,
    limit = 20,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }> {
    await this.claimedController(controllerId);
    const pageOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const pageLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const revisions = await this.revisions.find({
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
      skip: pageOffset,
      take: pageLimit,
    });
    return { revisions, offset: pageOffset, limit: pageLimit };
  }
}
