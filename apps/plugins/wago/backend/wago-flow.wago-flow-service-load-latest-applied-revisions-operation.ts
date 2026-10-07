import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoFlowServiceChannelsOperation } from './wago-flow.wago-flow-service-channels-operation';


export abstract class WagoFlowServiceLoadLatestAppliedRevisionsOperation extends WagoFlowServiceChannelsOperation {
  protected async loadLatestAppliedRevisions(controllerIds: number[]): Promise<WagoConfigurationRevision[]> {
    if (!controllerIds.length) return [];
    return this.revisions
      .createQueryBuilder('revision')
      .innerJoin(
        (query) =>
          query
            .subQuery()
            .select('latest.controllerId', 'controllerId')
            .addSelect('MAX(latest.revision)', 'revision')
            .from(WagoConfigurationRevision, 'latest')
            .where('latest.controllerId IN (:...controllerIds)', { controllerIds })
            .andWhere('latest.state = :state', { state: 'applied' })
            .groupBy('latest.controllerId'),
        'latest',
        'latest.controllerId = revision.controllerId AND latest.revision = revision.revision',
      )
      .where('revision.state = :state', { state: 'applied' })
      .getMany();
  }
}
