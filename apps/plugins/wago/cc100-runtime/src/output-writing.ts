import { OutputPulses } from './output-pulses';
import { routeKey } from './output-routing';
import { LogicalChannel, PhysicalPoint } from './output-types';
import { WriteAdmissionError } from './runtime-types';

export abstract class OutputWriting extends OutputPulses {
  async write(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
  ): Promise<boolean> {
    return this.runForChannel(channel.id, () => this.writeWhileQueued(channel, value, onWritten, onCommitted));
  }

  async writeWhileQueued(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
    admit?: () => void,
    pulseDuration?: number,
    ownership?: 'manual' | 'flow',
  ): Promise<boolean> {
    const configurationGeneration = this.configurationGeneration;
    const point = this.options.getSnapshot()?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return false;
    return this.writePointWhileQueued(
      channel,
      point,
      value,
      onWritten,
      onCommitted,
      configurationGeneration,
      admit,
      pulseDuration,
      ownership,
    );
  }

  protected async writePointWhileQueued(
    channel: LogicalChannel,
    point: PhysicalPoint,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
    configurationGeneration = this.configurationGeneration,
    admit?: () => void,
    pulseDuration?: number,
    ownership?: 'manual' | 'flow',
  ): Promise<boolean> {
    this.uncertainWrites.delete(channel.id);
    const state = this.options.getState();
    const wasUncertain = state.uncertainOutputChannelIds?.includes(channel.id);
    const snapshot = this.options.getSnapshot();
    const route = snapshot && { channel, point, snapshot };
    const key = route && routeKey(route);
    const pendingRoutes = state.pendingPulseRoutes;
    const hadPulse = state.pendingPulseChannelIds?.includes(channel.id);
    if (pulseDuration && route)
      state.pendingPulseRoutes = [...(pendingRoutes ?? []).filter((item) => routeKey(item) !== key), route];
    if (pulseDuration)
      state.pendingPulseChannelIds = [...new Set([...(state.pendingPulseChannelIds ?? []), channel.id])];
    if (this.options.device.prepareConfiguration) {
      this.options.getState().uncertainOutputChannelIds = [
        ...new Set([...(this.options.getState().uncertainOutputChannelIds ?? []), channel.id]),
      ];
    }
    if (value && (this.options.device.prepareConfiguration || pulseDuration)) await this.options.saveState();
    try {
      admit?.();
      await this.options.device.write(point, value, admit);
    } catch (error) {
      if (error instanceof WriteAdmissionError) {
        if (!wasUncertain)
          state.uncertainOutputChannelIds = (state.uncertainOutputChannelIds ?? []).filter((id) => id !== channel.id);
        this.restorePulseRoute(key, pendingRoutes);
        if (!hadPulse)
          state.pendingPulseChannelIds = (state.pendingPulseChannelIds ?? []).filter((id) => id !== channel.id);
        await this.options.saveState();
        throw error;
      }
      if (this.options.device.writeMayHaveBeenTransmitted?.(error)) {
        this.uncertainWrites.add(channel.id);
        // An ambiguous ON may still have energized the relay: arrange pulse shutdown.
        onWritten?.();
      }
      // Neither a fault ack nor an offline broker may delay retrying a failed shutoff.
      void this.options.publishFault(channel.id, error).catch(() => undefined);
      return false;
    }
    onWritten?.();
    this.options.getState().outputs = { ...this.options.getState().outputs, [channel.id]: value };
    // Output value and its command owner must share the same durable commit.
    // Safety shutoffs omit ownership so they do not pretend a flow took over.
    if (ownership !== undefined)
      state.manualOutputChannelIds = [
        ...(state.manualOutputChannelIds ?? []).filter((id) => id !== channel.id),
        ...(ownership === 'manual' ? [channel.id] : []),
      ];
    // Feedback follows confirmed hardware state. Disk persistence may stall while a
    // pulse shuts off; the old ON check must not survive that physical transition.
    if (configurationGeneration === this.configurationGeneration) this.scheduleFeedbackCheck(channel, value);
    if (this.options.device.prepareConfiguration)
      this.options.getState().uncertainOutputChannelIds = (
        this.options.getState().uncertainOutputChannelIds ?? []
      ).filter((id) => id !== channel.id);
    const pendingPulses = state.pendingPulseChannelIds;
    if (!pulseDuration) {
      state.pendingPulseRoutes = state.pendingPulseRoutes?.filter((item) => routeKey(item) !== key);
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes?.map((route) => route.channel.id) ?? [])];
    }
    try {
      await this.options.saveState();
    } catch {
      if (!pulseDuration) this.restorePulseRoute(key, pendingRoutes);
      if (pendingPulses?.includes(channel.id))
        state.pendingPulseChannelIds = [...new Set([...(state.pendingPulseChannelIds ?? []), channel.id])];
      if (this.options.device.prepareConfiguration)
        this.options.getState().uncertainOutputChannelIds = [
          ...new Set([...(this.options.getState().uncertainOutputChannelIds ?? []), channel.id]),
        ];
      // Do not acknowledge an operation whose durable output state is stale.
      throw new Error('failed to persist channel state');
    }
    onCommitted?.();
    // Telemetry must not hold the physical channel queue: a pending MQTT ack
    // could otherwise prevent the pulse timer or disconnect policy from writing off.
    this.options.publishState();
    return true;
  }
}
