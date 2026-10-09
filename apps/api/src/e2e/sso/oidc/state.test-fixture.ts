import * as crypto from 'crypto';
export class TestOidcStateStore {
  private states = new Map<string, { ctx: unknown; appState: unknown }>();

  store(
    _req: unknown,
    ctx: unknown,
    appState: unknown,
    _meta: unknown,
    cb: (err: Error | null, handle: string) => void,
  ): void {
    const handle = crypto.randomBytes(16).toString('hex');
    this.states.set(handle, { ctx, appState });
    cb(null, handle);
  }

  verify(_req: unknown, handle: string, cb: (err: Error | null, ctx: unknown, appState?: unknown) => void): void {
    const saved = this.states.get(handle);
    if (!saved) {
      return cb(null, false as unknown as null, { message: 'OIDC state handle not found' });
    }
    this.states.delete(handle);
    cb(null, saved.ctx, saved.appState);
  }
}
