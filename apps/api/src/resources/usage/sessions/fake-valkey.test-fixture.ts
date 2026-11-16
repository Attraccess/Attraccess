import { RELEASE_LOCK_SCRIPT, RENEW_LOCK_SCRIPT } from './session-change-coordination';

/** Just enough of Valkey for the session-change lock: SET NX PX, GET, MGET, DEL and the two lock scripts. */
export class FakeValkey {
  readonly data = new Map<string, { value: string; expiresAt: number }>();
  failing = false;
  /** Commands never answer (a half-open connection). */
  stalled = false;
  status: string | undefined = 'ready';

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.data.delete(key);
    return this.data.get(key);
  }

  private async check() {
    if (this.stalled) await new Promise(() => undefined);
    if (this.failing) throw new Error('valkey down');
  }

  async set(key: string, value: string, _px: 'PX', ttl: number, nx?: 'NX') {
    await this.check();
    if (nx && this.live(key)) return null;
    this.data.set(key, { value, expiresAt: Date.now() + ttl });
    return 'OK';
  }

  async eval(script: string, _keys: number, key: string, token: string, ttl?: number) {
    await this.check();
    const entry = this.live(key);
    if (script === RELEASE_LOCK_SCRIPT) return entry?.value === token && this.data.delete(key) ? 1 : 0;
    if (script !== RENEW_LOCK_SCRIPT) throw new Error('unknown script');
    if (entry && entry.value !== token) return 0;
    this.data.set(key, { value: token, expiresAt: Date.now() + Number(ttl) });
    return 1;
  }

  async get(key: string) {
    await this.check();
    return this.live(key)?.value ?? null;
  }

  async mget(...keys: string[]) {
    await this.check();
    return keys.map((key) => this.live(key)?.value ?? null);
  }

  async del(key: string) {
    await this.check();
    return this.data.delete(key) ? 1 : 0;
  }
}
