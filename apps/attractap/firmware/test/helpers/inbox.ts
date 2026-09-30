export class Inbox<T> {
  private records: { index: number; value: T }[] = [];
  private index = 0;
  private listeners = new Set<() => void>();
  private failure?: Error;

  mark() {
    return this.index;
  }
  push(value: T) {
    this.records.push({ index: ++this.index, value });
    if (this.records.length > 4096) this.records.shift();
    this.listeners.forEach((listener) => listener());
  }
  fail(error: Error) {
    this.failure = error;
    this.listeners.forEach((listener) => listener());
  }
  wait(predicate: (value: T) => boolean, after = 0, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      const check = () => {
        if (this.failure) {
          cleanup();
          reject(this.failure);
          return;
        }
        const record = this.records.find((r) => r.index > after && predicate(r.value));
        if (record) {
          cleanup();
          resolve(record.value);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out after ${timeout}ms waiting for a fresh message (after ${after})`));
      }, timeout);
      this.listeners.add(check);
      check();
    });
  }
}
