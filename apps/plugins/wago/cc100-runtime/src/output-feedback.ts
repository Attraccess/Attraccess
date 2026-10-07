import { LogicalChannel } from './output-types';
import { OutputWriteQueue } from './output-write-queue';

export abstract class OutputFeedback extends OutputWriteQueue {
  protected scheduleFeedbackCheck(channel: LogicalChannel, value: boolean): void {
    if (!channel.feedback || this.options.feedbackEnabled?.() === false) return;
    const generation = ++this.feedbackGenerationSequence;
    this.feedbackGenerations.set(channel.id, generation);
    const existing = this.feedbackChecks.get(channel.id);
    if (existing) clearTimeout(existing.timer);
    const configurationGeneration = this.configurationGeneration;
    const timer = setTimeout(() => {
      this.feedbackChecks.delete(channel.id);
      void this.ignoreRejection(() => this.verifyFeedback(channel, value, generation, configurationGeneration));
    }, channel.feedback.timeoutMs);
    this.feedbackChecks.set(channel.id, { timer, generation });
  }

  protected async verifyFeedback(
    channel: LogicalChannel,
    value: boolean,
    generation: number,
    configurationGeneration: number,
  ): Promise<void> {
    if (
      this.options.feedbackEnabled?.() === false ||
      !this.isCurrentFeedback(channel.id, generation, configurationGeneration)
    )
      return;
    const feedbackChannel = this.options
      .getSnapshot()
      ?.logicalChannels.find((item) => item.id === channel.feedback?.channelId);
    const point = this.options
      .getSnapshot()
      ?.physicalPoints.find((item) => item.id === feedbackChannel?.physicalPointId);
    if (!channel.feedback || !point) return;
    try {
      const readValue = Boolean(await this.options.device.read(point));
      const actual = feedbackChannel?.invert ? !readValue : readValue;
      const expected = channel.feedback.expected === 'match' ? value : !value;
      if (actual !== expected && this.isCurrentFeedback(channel.id, generation, configurationGeneration))
        await this.options.publishFault(channel.id, {
          code: 'feedback_mismatch',
          message: 'configured feedback does not match the requested output state',
        });
    } catch (error) {
      if (this.isCurrentFeedback(channel.id, generation, configurationGeneration))
        await this.options.publishFault(channel.id, {
          code: 'feedback_read_failed',
          message: error instanceof Error ? error.message : String(error),
        });
    }
  }

  protected isCurrentFeedback(channelId: string, generation: number, configurationGeneration: number): boolean {
    return (
      this.feedbackGenerations.get(channelId) === generation && this.configurationGeneration === configurationGeneration
    );
  }

  async isGuardSatisfied(channel: LogicalChannel): Promise<boolean> {
    if (!channel.guard) return true;
    const snapshot = this.options.getSnapshot();
    const guardChannel = snapshot?.logicalChannels.find((item) => item.id === channel.guard?.channelId);
    const guardPoint = snapshot?.physicalPoints.find((item) => item.id === guardChannel?.physicalPointId);
    if (!guardPoint) return false;
    try {
      const value = Boolean(await this.options.device.read(guardPoint));
      return (guardChannel?.invert ? !value : value) === (channel.guard.when === 'on');
    } catch {
      return false;
    }
  }

  protected ignoreRejection(callback: () => Promise<unknown>): void {
    void callback().catch(() => undefined);
  }
}
