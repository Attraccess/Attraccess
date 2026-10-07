import { OutputRoutingBusyError } from './output-errors';
import { routeKey } from './output-routing';
import { OutputWriting } from './output-writing';
import { WriteAdmissionError, type Snapshot } from './runtime-types';

export abstract class OutputPolicies extends OutputWriting {
  isWriteUncertain(channelId: string): boolean {
    return this.uncertainWrites.has(channelId);
  }

  assertConfigurationSafe(next: Snapshot): void {
    const snapshot = this.options.getSnapshot();
    const state = this.options.getState();
    for (const channel of snapshot?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (!state.outputs[channel.id] && !state.uncertainOutputChannelIds?.includes(channel.id)) continue;
      const point = snapshot?.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (!snapshot || !point) throw new OutputRoutingBusyError('switch outputs off before changing their routing');
      const key = routeKey({ channel, point, snapshot });
      if (state.pendingPulseRoutes?.some((route) => routeKey(route) === key)) continue;
      const replacement = next.logicalChannels.find(
        (item) => item.id === channel.id && item.capabilities.includes('output'),
      );
      const replacementPoint = next.physicalPoints.find((item) => item.id === replacement?.physicalPointId);
      if (
        !replacement ||
        !replacementPoint ||
        routeKey({ channel: replacement, point: replacementPoint, snapshot: next }) !== key
      )
        throw new OutputRoutingBusyError('switch outputs off before changing their routing');
    }
  }

  async applyDisconnectPolicies(connected: boolean): Promise<void> {
    if (connected) {
      this.disconnected = false;
      this.outageGeneration++;
      this.watchdogs.forEach(clearTimeout);
      this.watchdogs.clear();
      return;
    }
    if (this.disconnected) return;
    this.disconnected = true;
    const outage = ++this.outageGeneration;
    const admit = () => {
      if (!this.disconnected || outage !== this.outageGeneration) throw new WriteAdmissionError('outage_ended');
    };
    let stateSaveFailed = false;
    for (const channel of this.options.getSnapshot()?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (channel.disconnectPolicy.mode === 'immediate') {
        try {
          await this.write(channel, false);
        } catch {
          // Continue the safety shutdown even when durable state cannot be updated for one output.
          stateSaveFailed = true;
        }
      }
      if (channel.disconnectPolicy.mode === 'watchdog')
        this.watchdogs.set(
          channel.id,
          setTimeout(() => {
            this.watchdogs.delete(channel.id);
            void this.ignoreRejection(() =>
              this.runForChannel(channel.id, async () => {
                admit();
                return this.writeWhileQueued(channel, false, undefined, undefined, admit);
              }),
            );
          }, channel.disconnectPolicy.timeoutMs),
        );
    }
    if (stateSaveFailed) await this.options.saveState();
  }

  /** Runtime updates override hold/watchdog policies and manual ownership. */
  async applyRuntimeUpdateFailsafe(): Promise<void> {
    this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
    this.feedbackChecks.clear();
    this.feedbackGenerations.clear();
    this.watchdogs.forEach(clearTimeout);
    this.watchdogs.clear();
    this.options.getState().manualOutputChannelIds = [];
    let failed = false;
    for (const channel of this.options.getSnapshot()?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      try {
        if (await this.write(channel, false)) this.clearPulse(channel.id);
        else failed = true;
      } catch {
        failed = true;
      }
    }
    for (const [key, pulse] of this.pulses) {
      await this.runForChannel(pulse.channel.id, async () => {
        if (this.pulses.get(key) !== pulse) return;
        if (await this.writePulseShutdown(pulse)) {
          clearTimeout(pulse.timer);
          this.pulses.delete(key);
        } else failed = true;
      });
    }
    if (failed) throw new Error('Runtime update could not switch every output off');
  }
}
