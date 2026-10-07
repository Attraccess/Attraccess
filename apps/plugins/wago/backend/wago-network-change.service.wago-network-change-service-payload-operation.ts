import { WagoNetworkChange } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { RuntimeUpdateError } from './wago-runtime-update';
import { NetworkPayload } from "./wago-network-change.service.network-payload";
import { WagoNetworkChangeServiceBrokerConnectionOperation } from "./wago-network-change.service.wago-network-change-service-broker-connection-operation";
export abstract class WagoNetworkChangeServicePayloadOperation extends WagoNetworkChangeServiceBrokerConnectionOperation {

  protected payload(row: WagoNetworkChange, controller: WagoController): NetworkPayload {
    try {
      const payload = JSON.parse(this.context.secrets.decrypt(row.encryptedPayload ?? '')) as NetworkPayload;
      if (
        payload.controllerId !== row.controllerId ||
        payload.sessionId !== row.sessionId ||
        payload.fingerprint !== row.fingerprint ||
        payload.targetHost !== row.targetHost ||
        payload.mqttServerId !== row.mqttServerId ||
        payload.hardwareId !== controller.hardwareId ||
        (payload.supersededDigest !== undefined && !/^[a-f0-9]{64}$/.test(payload.supersededDigest)) ||
        ![payload.previousEpoch, payload.credentialEpoch].includes(controller.credentialEpoch ?? '') ||
        ![payload.previousServerId, payload.mqttServerId].includes(controller.mqttServerId)
      )
        throw new Error();
      return payload;
    } catch {
      throw new RuntimeUpdateError('management_required');
    }
  }
}
