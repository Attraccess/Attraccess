import { ConflictException } from '@nestjs/common';
import { CONFIGURATION_PROTOCOL_VERSION } from './protocol';
import { compatibilityError } from './protocol';
import { configurationDesiredTopic } from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceConfigurationReportRevisionOperation } from './wago.wago-service-configuration-report-revision-operation';


export abstract class WagoServicePublishRevisionOperation extends WagoServiceConfigurationReportRevisionOperation {
  protected async publishRevision(
    controller: WagoController,
    revision: WagoConfigurationRevision,
  ): Promise<WagoConfigurationRevision> {
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${controller.id} has no MQTT server`);
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
    const settings = await this.getSettings();
    const runtimePolicy = this.runtimePolicies.get(controller.id);
    await this.context.mqtt.publish(
      controller.mqttServerId,
      configurationDesiredTopic(settings.operationalPrefix ?? 'attraccess/wago', controller.hardwareId),
      JSON.stringify({
        protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
        ...(runtimePolicy
          ? {
              runtimeImageId: runtimePolicy.desired,
              runtimePolicyToken: runtimePolicy.runtimePolicyToken,
            }
          : {}),
        revision: revision.revision,
        contentHash: revision.contentHash,
        snapshot: JSON.parse(revision.snapshot),
      }),
      { qos: 1, retain: true },
    );
    revision.state = 'published';
    return this.revisions.save(revision);
  }
}
