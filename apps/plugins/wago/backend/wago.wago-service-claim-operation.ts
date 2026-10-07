import { randomBytes } from 'node:crypto';
import { discoveryTopic } from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoServiceCompleteManualCredentialsOperation } from './wago.wago-service-complete-manual-credentials-operation';


export abstract class WagoServiceClaimOperation extends WagoServiceCompleteManualCredentialsOperation {
  async claim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned: () => Promise<void> = async () => undefined,
    manual?: {
      credentials: { username: string; password: string };
      acknowledged: () => void;
      expiresAt: string;
      dispatched: () => void;
    },
  ): Promise<WagoController> {
    return this.withClaimLock(id, async () => {
      const prepared = await this.withClaimConfigurationLock(() =>
        this.prepareClaim(id, name, verifier, mqttServerId, assertOwned, manual?.credentials),
      );
      try {
        const acknowledgementToken = randomBytes(24).toString('base64url');
        await assertOwned();
        await this.watchClaimAcknowledgement(
          prepared,
          acknowledgementToken,
          manual ? { acknowledged: manual.acknowledged, assertOwned } : undefined,
        );
        await assertOwned();
        manual?.dispatched();
        await this.context.mqtt.publish(
          prepared.mqttServerId,
          `${discoveryTopic(prepared.controller.hardwareId)}/claim`,
          JSON.stringify({
            username: prepared.credential.username,
            password: prepared.credential.password,
            configuration: prepared.configuration,
            acknowledgementToken,
            ...(manual ? { expiresAt: manual.expiresAt } : {}),
          }),
          { qos: 1 },
        );
        prepared.credentialDelivered = true;
        await assertOwned();
        await this.context.mqtt.publish(prepared.mqttServerId, discoveryTopic(prepared.controller.hardwareId), '', {
          qos: 1,
          retain: true,
        });
        return prepared.controller;
      } catch (error) {
        this.clearClaimAcknowledgement(prepared.enrollment.id);
        if (!prepared.credentialDelivered) await this.restoreUnclaimedController(prepared, assertOwned);
        throw error;
      } finally {
        const mayRefresh =
          !manual ||
          (await assertOwned().then(
            () => true,
            () => false,
          ));
        if (mayRefresh)
          await this.subscribeConfiguredServers().catch((error) => {
            this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after claim: ${String(error)}`);
            this.scheduleSubscriptionRetry();
          });
      }
    });
  }
}
