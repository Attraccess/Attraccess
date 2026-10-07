import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceConnectivityOperation } from './wago.wago-service-connectivity-operation';


export abstract class WagoServiceAppliedRevisionOperation extends WagoServiceConnectivityOperation {
  protected async appliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return revision ?? null;
  }
}
