import { OutputContext } from './output-context';
import { MAX_PENDING_CHANNEL_WRITES } from './output-routing';

export abstract class OutputWriteQueue extends OutputContext {
  async replaceConfiguration<T>(commit: () => Promise<T>): Promise<T> {
    let releaseReplacement!: () => void;
    this.replacement = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });

    try {
      await Promise.all(this.commandOperations);
      await Promise.all([...this.channelWrites.values()]);
      this.configurationGeneration += 1;
      this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
      this.feedbackChecks.clear();
      return await commit();
    } finally {
      this.replacement = undefined;
      releaseReplacement();
    }
  }

  async runForCommand<T>(channelId: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.pendingCommands.get(channelId) ?? 0;
    if (pending >= MAX_PENDING_CHANNEL_WRITES) throw new Error('channel write queue is full');
    this.pendingCommands.set(channelId, pending + 1);
    while (this.replacement) await this.replacement;
    let release!: () => void;
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.commandOperations.add(completion);
    try {
      return await this.runForChannel(channelId, operation);
    } finally {
      this.pendingCommands.set(channelId, (this.pendingCommands.get(channelId) ?? 1) - 1);
      this.commandOperations.delete(completion);
      release();
    }
  }

  async runForChannel<T>(channelId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.channelWrites.get(channelId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.channelWrites.set(channelId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.channelWrites.get(channelId) === current) this.channelWrites.delete(channelId);
    }
  }
}
