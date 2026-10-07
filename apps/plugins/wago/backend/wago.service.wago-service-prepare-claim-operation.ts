import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  CONFIGURATION_PROTOCOL_VERSION,
  commandTopic,
  configurationDesiredTopic,
  configurationReportedTopic,
  normalizeOperationalPrefix,
} from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoServiceClaimOperation } from './wago.wago-service-claim-operation';
export abstract class WagoServicePrepareClaimOperation extends WagoServiceClaimOperation {
  protected async prepareClaim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned: () => Promise<void> = async () => undefined,
    manualCredentials?: { username: string; password: string },
  ): Promise<{
    controller: WagoController;
    enrollment: WagoEnrollment;
    mqttServerId: number;
    credential: { username: string; password: string };
    configuration: { protocolVersion: number; namespace: string; desiredTopic: string; reportedTopic: string };
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    credentialDelivered: boolean;
  }> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);
    if (controller.trustState === 'claimed') throw new ConflictException('controller has already been claimed');
    if (!name.trim()) throw new ConflictException('a controller name is required');
    if (!this.matchesVerifier(controller, verifier))
      throw new ConflictException('physical pairing code or fingerprint does not match the controller');
    if (controller.compatibilityError) throw new ConflictException(controller.compatibilityError);
    const selectedServerId = mqttServerId ?? controller.mqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before claiming this controller');
    if (selectedServerId !== controller.mqttServerId)
      throw new ConflictException('claim the controller on the MQTT server used for its enrollment package');
    if (!(await this.context.getMqttServerConfig(selectedServerId)))
      throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const enrollment = await this.activeEnrollment(controller.enrollmentId);
    if (!enrollment)
      throw new ConflictException(
        'the controller enrollment package has expired or was already consumed; create a new one',
      );

    const identity = `wago-controller-${controller.hardwareId}`;
    const settings = await this.getSettings();
    const namespace = normalizeOperationalPrefix(settings.operationalPrefix);
    if (
      manualCredentials &&
      (await this.context.getMqttCredentialProvisioning().availableProviders(selectedServerId)).length
    )
      throw new ConflictException(
        'This broker uses automatic credential provisioning; use the standard claim operation',
      );
    if (
      controller.credentialMqttServerId &&
      (!manualCredentials || controller.credentialMqttServerId !== selectedServerId)
    )
      throw new ConflictException(
        'Remove the controller registration to revoke its unfinished permanent credential before claiming again.',
      );
    // Persist the exact broker before provisioning. Discovery may later update
    // mqttServerId; removal must still revoke this identity on its original broker.
    await assertOwned();
    controller.credentialMqttServerId = selectedServerId;
    controller.credentialEpoch = randomUUID();
    await this.controllers.save(controller);
    await assertOwned();
    const provisioned =
      manualCredentials ??
      (await this.context.getMqttCredentialProvisioning().provision({
        mqttServerId: selectedServerId,
        identity,
        username: identity,
        vhost: '/',
        topicPolicy: {
          publish: [`${namespace}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${controller.hardwareId}/#`],
          subscribe: [
            configurationDesiredTopic(namespace, controller.hardwareId),
            commandTopic(namespace, controller.hardwareId),
            `${namespace}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${controller.hardwareId}/credentials/rotate`,
          ],
        },
      }));
    await assertOwned();
    const credential = 'password' in provisioned ? provisioned : manualCredentials;
    if (!credential) throw new ConflictException('Manual credential provisioning is required');
    const previousController = {
      trustState: controller.trustState,
      name: controller.name,
      mqttServerId: controller.mqttServerId,
      updatedAt: controller.updatedAt,
    };
    try {
      // Persist the claimed state before delivery so post-delivery failures cannot revoke its credentials.
      await assertOwned();
      controller.trustState = 'claimed';
      controller.name = name.trim();
      controller.mqttServerId = selectedServerId;
      controller.updatedAt = new Date().toISOString();
      await this.controllers.save(controller);
      return {
        controller,
        enrollment,
        mqttServerId: selectedServerId,
        credential,
        configuration: {
          protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
          namespace,
          desiredTopic: configurationDesiredTopic(namespace, controller.hardwareId),
          reportedTopic: configurationReportedTopic(namespace, controller.hardwareId),
        },
        identity,
        previousController,
        credentialDelivered: false,
      };
    } catch (error) {
      await this.restoreUnclaimedControllerWhileLocked(
        {
          controller,
          mqttServerId: selectedServerId,
          identity,
          previousController,
        },
        assertOwned,
      );
      throw error;
    }
  }
}
