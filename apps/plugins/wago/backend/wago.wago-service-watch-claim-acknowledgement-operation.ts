import { WagoEnrollment } from './wago-enrollment.entity';
import { discoveryTopic } from './protocol';
import { WagoController } from './wago-controller.entity';
import { isClaimAcknowledgement } from './wago.helpers';
import { WagoServiceOnHeartbeatOperation } from './wago.service.wago-service-on-heartbeat-operation';


export abstract class WagoServiceWatchClaimAcknowledgementOperation extends WagoServiceOnHeartbeatOperation {
  protected async watchClaimAcknowledgement(
    prepared: {
      controller: WagoController;
      enrollment: WagoEnrollment;
      mqttServerId: number;
      credentialDelivered?: boolean;
    },
    acknowledgementToken: string,
    manual?: { acknowledged: () => void; assertOwned: () => Promise<void> },
  ): Promise<void> {
    const topic = `${discoveryTopic(prepared.controller.hardwareId)}/claim/ack`;
    const subscription = await this.subscribeMqtt(prepared.mqttServerId, topic, async (message) => {
      if (!isClaimAcknowledgement(message.payload, acknowledgementToken)) return;
      if (
        manual &&
        !(await manual.assertOwned().then(
          () => true,
          () => false,
        ))
      )
        return;
      prepared.credentialDelivered = true;
      this.clearClaimAcknowledgement(prepared.enrollment.id);
      try {
        await this.revokeEnrollment(prepared.enrollment, manual?.assertOwned);
      } catch (error) {
        this.context.logger.warn(
          `Could not revoke acknowledged WAGO enrollment ${prepared.enrollment.id}: ${String(error)}`,
        );
      }
      if (
        manual &&
        (await manual.assertOwned().then(
          () => true,
          () => false,
        ))
      )
        manual.acknowledged();
    });
    if (
      manual &&
      !(await manual.assertOwned().then(
        () => true,
        () => false,
      ))
    ) {
      subscription.unsubscribe();
      return;
    }
    this.claimAcknowledgementSubscriptions.set(prepared.enrollment.id, subscription);
  }
}
