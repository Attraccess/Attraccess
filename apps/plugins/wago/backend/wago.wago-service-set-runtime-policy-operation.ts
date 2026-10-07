import { CONFIGURATION_PROTOCOL_VERSION } from './protocol';
import { configurationDesiredTopic } from './protocol';
import { WagoServiceBlockRuntimeOperation } from './wago.wago-service-block-runtime-operation';


export abstract class WagoServiceSetRuntimePolicyOperation extends WagoServiceBlockRuntimeOperation {
  async setRuntimePolicy(
    controllerId: number,
    desired: string,
    observed: string,
    runtimePolicyToken?: string,
  ): Promise<void> {
    const previous = this.runtimePolicies.get(controllerId);
    if (
      !this.runtimeUpdateBlocks.has(controllerId) &&
      previous?.desired === desired &&
      previous.observed === observed &&
      previous.runtimePolicyToken === runtimePolicyToken
    )
      return;
    this.runtimeUpdateBlocks.add(controllerId);
    const controller = await this.claimedController(controllerId);
    if (!controller.mqttServerId) return;
    const settings = await this.getSettings();
    const topic = configurationDesiredTopic(settings.operationalPrefix, controller.hardwareId);
    await this.context.mqtt.publish(
      controller.mqttServerId,
      topic,
      JSON.stringify({ runtimeImageId: desired, runtimePolicyToken }),
      { qos: 1, retain: false },
    );
    // Replay configuration skipped by the boot-time runtime gate, without creating a revision.
    const [revision] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    if (revision && (revision.state === 'published' || revision.state === 'applied'))
      await this.context.mqtt.publish(
        controller.mqttServerId,
        topic,
        JSON.stringify({
          protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
          runtimeImageId: desired,
          runtimePolicyToken,
          revision: revision.revision,
          contentHash: revision.contentHash,
          snapshot: JSON.parse(revision.snapshot),
        }),
        { qos: 1, retain: true },
      );
    this.runtimePolicies.set(controllerId, { desired, observed, runtimePolicyToken });
    this.runtimeUpdateBlocks.delete(controllerId);
  }
}
