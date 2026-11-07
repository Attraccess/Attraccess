/** In-process per-key mutex: callers with the same key run one after another, others in parallel. */
export class KeyedMutex {
  private readonly tails = new Map<number, Promise<unknown>>();

  async run<T>(key: number, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.tails.set(key, current);
    try {
      return await current;
    } finally {
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}
