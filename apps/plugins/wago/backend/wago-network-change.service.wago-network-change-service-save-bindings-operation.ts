import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { NetworkPayload } from "./wago-network-change.service.network-payload";
import { WagoNetworkChangeServicePayloadOperation } from "./wago-network-change.service.wago-network-change-service-payload-operation";
export abstract class WagoNetworkChangeServiceSaveBindingsOperation extends WagoNetworkChangeServicePayloadOperation {

  protected async saveBindings(
    row: WagoNetworkChange,
    encryptedCredentials: string,
    payload: NetworkPayload | null,
    assertOwned: () => Promise<void>,
  ) {
    await this.repository.manager.transaction(async (manager) => {
      await assertOwned();
      await manager
        .getRepository(WagoManagedAccess)
        .update(row.sessionId, { host: row.targetHost, encryptedCredentials });
      await manager.getRepository(WagoCommissioningSession).update(row.sessionId, {
        targetHost: row.targetHost,
        ...(payload ? { mqttServerId: payload.mqttServerId } : {}),
      });
      if (payload) {
        if (payload.previousServerId !== payload.mqttServerId)
          await manager
            .getRepository(WagoMqttCredentialRetirement)
            .save({ controllerId: row.controllerId, mqttServerId: payload.previousServerId });
        // A return to a previous broker makes that identity current again.
        await manager
          .getRepository(WagoMqttCredentialRetirement)
          .delete({ controllerId: row.controllerId, mqttServerId: payload.mqttServerId });
        await manager.getRepository(WagoController).update(row.controllerId, {
          mqttServerId: payload.mqttServerId,
          credentialMqttServerId: payload.mqttServerId,
          credentialEpoch: payload.credentialEpoch,
          lastHeartbeatAt: null,
          updatedAt: new Date().toISOString(),
        });
        await manager.getRepository(WagoCredentialRotationEntity).save({
          controllerId: row.controllerId,
          revision: 1,
          token: payload.token,
          phase: 'completed',
          credentialEpoch: payload.credentialEpoch,
          mqttServerId: payload.mqttServerId,
          prefix: payload.prefix,
          encryptedCredentials: null,
        });
      }
      await assertOwned();
    });
  }
}
