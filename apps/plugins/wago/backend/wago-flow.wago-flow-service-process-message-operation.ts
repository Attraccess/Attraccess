import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../shared/clock';
import { parseOperationalMessage } from './protocol';
import { WagoFlowServiceOnMessageOperation } from './wago-flow.wago-flow-service-on-message-operation';


export abstract class WagoFlowServiceProcessMessageOperation extends WagoFlowServiceOnMessageOperation {
  protected async processMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    let parsed: ReturnType<typeof parseOperationalMessage>;
    try {
      parsed = parseOperationalMessage(prefix, topic, payload);
    } catch (error) {
      this.context.logger.warn(`Ignoring invalid WAGO event: ${String(error)}`);
      return;
    }
    if (!parsed) return;
    const { hardwareId, message: event } = parsed;
    const entry = this.controllerByHardwareId.get(hardwareId);
    if (!entry || entry.serverId !== serverId) return;
    const { controller } = entry;
    const eventTime = Date.parse(event.timestamp);
    if (eventTime > Date.now() + CONTROLLER_CLOCK_TOLERANCE_MS) {
      this.context.logger.warn(`Ignoring WAGO event beyond the clock-skew tolerance for ${controller.hardwareId}`);
      return;
    }
    // Resolve configuration before mutating stream/cache state, then process the entire snapshot atomically.
    const channels = await this.channels(controller.id);
    const stream = this.admitEvent(controller, event, eventTime);
    if (!stream) return;
    if (event.category === 'state') {
      this.applyState(controller, event, eventTime, stream, channels);
    } else if ('channelId' in event) {
      const channel = channels.find((channel) => channel.id === event.channelId);
      if (!channel || (event.category === 'measurement' && !channel.capabilities.includes('measurement'))) return;
      this.store(controller, event.channelId, event, event.category === 'measurement' ? event.value : event);
    }
  }
}
