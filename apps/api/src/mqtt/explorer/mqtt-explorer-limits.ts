/**
 * Keys remembered for a fixed time, bounded in number. Insertion order is
 * expiry order (one TTL, re-adding moves a key to the end), so pruning only
 * ever looks at the front.
 */
export class ExpiringKeys {
  private readonly expiries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxKeys: number,
  ) {}

  get size(): number {
    return this.expiries.size;
  }

  has(key: string): boolean {
    const expiresAt = this.expiries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt > Date.now()) return true;
    this.expiries.delete(key);
    return false;
  }

  /** Forgets every key matching `predicate`. */
  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of [...this.expiries.keys()]) if (predicate(key)) this.expiries.delete(key);
  }

  add(key: string): void {
    this.expiries.delete(key);
    this.expiries.set(key, Date.now() + this.ttlMs);
    this.prune();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.expiries) {
      if (expiresAt > now && this.expiries.size <= this.maxKeys) return;
      this.expiries.delete(key);
    }
  }
}

export interface ViewSlot {
  /** Gives the slot back; repeated calls are harmless. */
  release(): void;
}

/** Counts each user's open explorer views across all of their live connections. */
export class UserViewLimiter {
  private readonly counts = new Map<number, number>();

  constructor(private readonly maxPerUser: number) {}

  active(userId: number): number {
    return this.counts.get(userId) ?? 0;
  }

  /** Takes a slot, or returns null when the user already has the maximum open. */
  reserve(userId: number): ViewSlot | null {
    const count = this.active(userId);
    if (count >= this.maxPerUser) return null;
    this.counts.set(userId, count + 1);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const remaining = this.active(userId) - 1;
        if (remaining > 0) this.counts.set(userId, remaining);
        else this.counts.delete(userId);
      },
    };
  }
}
