import { WagoController } from './wago-controller.entity';
import { WagoControllerSummary } from './wago.service.wago-controller-summary';
import { freshness } from './diagnostics-store';
import { STALE_AFTER_MS } from './wago.state';
import { WagoServicePublishRevisionOperation } from './wago.wago-service-publish-revision-operation';


export abstract class WagoServiceConnectivityOperation extends WagoServicePublishRevisionOperation {
  protected connectivity(controller: WagoController): WagoControllerSummary['connectivity'] {
    if (controller.trustState === 'untrusted') return 'untrusted';
    const heartbeatAt = this.diagnostics.read(controller.id).heartbeatAt ?? controller.lastHeartbeatAt;
    if (freshness(heartbeatAt, Date.now(), STALE_AFTER_MS) !== 'fresh') return 'stale';
    if (this.isRuntimeUpdateRequired(controller.id)) {
      const policy = this.runtimePolicies.get(controller.id);
      return policy?.observed && policy.desired !== policy.observed ? 'runtime_update' : 'runtime_check';
    }
    return 'online';
  }
}
