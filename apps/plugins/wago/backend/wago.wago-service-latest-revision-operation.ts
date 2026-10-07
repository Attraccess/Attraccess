import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceAuditRevisionOperation } from './wago.wago-service-audit-revision-operation';


export abstract class WagoServiceLatestRevisionOperation extends WagoServiceAuditRevisionOperation {
  protected async latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    return revision ?? null;
  }
}
