import { OutputFeedback } from './output-feedback';
import { INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS, MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS, routeKey } from './output-routing';
import { LogicalChannel, Pulse } from './output-types';
import { type PulseRoute } from './runtime-types';

export abstract class OutputPulses extends OutputFeedback {
  schedulePulse(channel: LogicalChannel, duration: number, captured?: PulseRoute): void {
    const snapshot = captured?.snapshot ?? this.options.getSnapshot();
    const point = captured?.point ?? snapshot?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point || !snapshot) return;
    const route = captured ?? { channel, point, snapshot };
    const key = routeKey(route);
    const existingPulse = this.pulses.get(key);
    if (existingPulse) clearTimeout(existingPulse.timer);
    const pulse: Pulse = {
      ...route,
      write:
        this.options.device.captureWrite?.(point, snapshot) ?? ((value) => this.options.device.write(point, value)),
      timer: setTimeout(() => this.completePulse(key, pulse, 1), duration),
    };
    this.pulses.set(key, pulse);
  }

  recoverPulses(): void {
    const state = this.options.getState();
    const routes = [...(state.pendingPulseRoutes ?? [])];
    for (const id of state.pendingPulseChannelIds ?? []) {
      if (routes.some((route) => route.channel.id === id)) continue;
      const snapshot = this.options.getSnapshot();
      const channel = snapshot?.logicalChannels.find((item) => item.id === id);
      const point = snapshot?.physicalPoints.find((item) => item.id === channel?.physicalPointId);
      if (!snapshot || !channel?.capabilities.includes('output') || !point)
        throw new Error('persisted pulse has no output route');
      routes.push({ channel, point, snapshot });
    }
    state.pendingPulseRoutes = routes;
    for (const route of routes) this.schedulePulse(route.channel, 0, route);
  }

  clearPulse(channelId: string): void {
    const snapshot = this.options.getSnapshot();
    const channel = snapshot?.logicalChannels.find((item) => item.id === channelId);
    const point = snapshot?.physicalPoints.find((item) => item.id === channel?.physicalPointId);
    if (!snapshot || !channel || !point) return;
    const key = routeKey({ channel, point, snapshot });
    const pulse = this.pulses.get(key);
    if (!pulse) return;
    clearTimeout(pulse.timer);
    this.pulses.delete(key);
  }

  protected completePulse(key: string, pulse: Pulse, attempt: number): void {
    this.ignoreRejection(() =>
      this.runForChannel(pulse.channel.id, async () => {
        if (this.pulses.get(key) !== pulse) return;
        if (await this.writePulseShutdown(pulse)) this.pulses.delete(key);
        else {
          const delayMs = Math.min(
            INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS * 2 ** (attempt - 1),
            MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS,
          );
          pulse.timer = setTimeout(() => this.completePulse(key, pulse, attempt + 1), delayMs);
        }
      }),
    );
  }

  protected async writePulseShutdown(pulse: Pulse): Promise<boolean> {
    const key = routeKey(pulse);
    const state = this.options.getState();
    const route = state.pendingPulseRoutes?.find((route) => routeKey(route) === key) ?? {
      channel: pulse.channel,
      point: pulse.point,
      snapshot: pulse.snapshot,
    };
    try {
      await pulse.write(false);
      const snapshot = this.options.getSnapshot();
      const channel = snapshot?.logicalChannels.find((item) => {
        const point = snapshot.physicalPoints.find((point) => point.id === item.physicalPointId);
        return point && item.capabilities.includes('output') && routeKey({ channel: item, point, snapshot }) === key;
      });
      if (channel) {
        state.outputs = { ...state.outputs, [channel.id]: false };
        state.uncertainOutputChannelIds = state.uncertainOutputChannelIds?.filter((id) => id !== channel.id);
        this.scheduleFeedbackCheck(channel, false);
      }
      state.pendingPulseRoutes = state.pendingPulseRoutes?.filter((route) => routeKey(route) !== key);
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes?.map((route) => route.channel.id) ?? [])];
      await this.options.saveState();
      this.options.publishState();
      return true;
    } catch (error) {
      if (!state.pendingPulseRoutes?.some((route) => routeKey(route) === key))
        state.pendingPulseRoutes = [...(state.pendingPulseRoutes ?? []), route];
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes.map((route) => route.channel.id))];
      void this.options.publishFault(pulse.channel.id, error).catch(() => undefined);
      return false;
    }
  }

  protected restorePulseRoute(key: string | undefined, previous: PulseRoute[] | undefined): void {
    if (!key) return;
    const state = this.options.getState();
    const route = previous?.find((route) => routeKey(route) === key);
    state.pendingPulseRoutes = [
      ...(state.pendingPulseRoutes ?? []).filter((route) => routeKey(route) !== key),
      ...(route ? [route] : []),
    ];
    state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes.map((route) => route.channel.id))];
  }
}
