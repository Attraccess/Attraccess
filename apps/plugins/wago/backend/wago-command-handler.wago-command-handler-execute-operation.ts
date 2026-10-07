import { randomUUID } from 'node:crypto';
import { commandTopic } from './protocol';
import { isAcknowledgementFailure } from './wago-command-handler.helpers';
import { WagoCommandHandlerValidateOperation } from './wago-command-handler.wago-command-handler-validate-operation';
import { WagoCommandError } from './wago-command-handler.wago-command-error';


export abstract class WagoCommandHandlerExecuteOperation extends WagoCommandHandlerValidateOperation {
  async execute(config: Record<string, unknown>, commandId = randomUUID(), source?: 'manual'): Promise<void> {
    const errors = await this.validate(config, new Map(), source === 'manual');
    if (errors.length)
      throw new WagoCommandError(errors.map((error) => error.message).join(' '), 'controller-rejection');
    const parsed = this.parse(config, source === 'manual');
    if ('errors' in parsed)
      throw new WagoCommandError(parsed.errors.map((error) => error.message).join(' '), 'controller-rejection');
    const {
      controllerId,
      channelId,
      action,
      value,
      expectedConfigurationRevision,
      completionBehavior,
      acknowledgementTimeoutSeconds,
    } = parsed.value;
    const controller = await this.dependencies.claimedController(controllerId);
    if (!controller.mqttServerId)
      throw new WagoCommandError(`WAGO controller ${controllerId} has no MQTT server`, 'transport-dispatch');
    const settings = await this.dependencies.getSettings();
    const id = commandId;
    this.dependencies.onCommand?.(controllerId, channelId, id);
    const command = JSON.stringify({
      id,
      expiresAt: new Date(Date.now() + acknowledgementTimeoutSeconds * 1000).toISOString(),
      channelId,
      action,
      ...(action === 'set' ? { value } : {}),
      ...(source ? { source } : {}),
      expectedConfigurationRevision,
    });
    const acknowledgement =
      completionBehavior === 'acknowledged'
        ? this.waitForAcknowledgement(id, controllerId, acknowledgementTimeoutSeconds)
        : undefined;
    // Observe rejection immediately: publication can stall after the controller rejects or times out.
    const acknowledgementFailure = acknowledgement
      ? new Promise<never>((_resolve, reject) =>
          acknowledgement.then(
            () => undefined,
            (error) => reject({ acknowledgementError: error }),
          ),
        )
      : undefined;
    let dispatchTimer: ReturnType<typeof setTimeout> | undefined;
    const dispatchDeadline = new Promise<never>((_resolve, reject) => {
      dispatchTimer = setTimeout(
        () => reject(new WagoCommandError('WAGO command dispatch timed out', 'acknowledgement-timeout')),
        acknowledgementTimeoutSeconds * 1000,
      );
    });
    try {
      const publication = this.dependencies.context.mqtt.publish(
        controller.mqttServerId,
        commandTopic(settings.operationalPrefix, controller.hardwareId),
        command,
        { qos: 1, retain: false },
      );
      await Promise.race([publication, dispatchDeadline, ...(acknowledgementFailure ? [acknowledgementFailure] : [])]);
    } catch (error) {
      if (isAcknowledgementFailure(error)) throw error.acknowledgementError;
      this.dependencies.onCommandFailure?.(id, 'dispatch-failed');
      const dispatchError =
        error instanceof WagoCommandError
          ? error
          : new WagoCommandError(`Failed to publish WAGO command: ${String(error)}`, 'transport-dispatch');
      this.reject(id, dispatchError);
      if (acknowledgement) await acknowledgement.catch(() => undefined);
      throw dispatchError;
    } finally {
      clearTimeout(dispatchTimer);
    }
    await acknowledgement;
  }
}
