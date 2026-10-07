import { configurationHash } from './configuration';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoServiceRevisionIdentityOperation } from './wago.wago-service-revision-identity-operation';


export abstract class WagoServiceImpactIdentityOperation extends WagoServiceRevisionIdentityOperation {
  protected impactIdentity(impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>): unknown {
    return impacts
      .map((impact) => ({
        ...impact,
        references: [...impact.references].sort((a, b) => configurationHash(a).localeCompare(configurationHash(b))),
      }))
      .sort((a, b) => a.channelId.localeCompare(b.channelId));
  }
}
