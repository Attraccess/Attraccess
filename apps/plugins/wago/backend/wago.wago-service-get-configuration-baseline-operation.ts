import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceGetDraftOperation } from './wago.wago-service-get-draft-operation';


export abstract class WagoServiceGetConfigurationBaselineOperation extends WagoServiceGetDraftOperation {
  async getConfigurationBaseline(controllerId: number): Promise<WagoConfigurationRevision | null> {
    await this.claimedController(controllerId);
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return revision ?? null;
  }
}
