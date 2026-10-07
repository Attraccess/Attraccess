import { OIDC_STATE_COOKIE_NAME } from './oidc-cookie-state-store';
import { registerOidcCookieStateStoreFixture } from './oidc-cookie-state-store.oidc-cookie-state-store.test-fixture';
export function registerStoreCases(fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>) {
  // ─── store() ──────────────────────────────────────────────────────────────

  describe('store()', () => {
    it('sets a cookie with the correct name', async () => {
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      expect(res.cookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, expect.any(String), expect.any(Object));
    });

    it('cookie is always SameSite=Lax regardless of nothing else', async () => {
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(opts.sameSite).toBe('lax');
    });

    it('cookie is always HttpOnly', async () => {
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(opts.httpOnly).toBe(true);
    });

    it('sets secure=false when URL is http', async () => {
      fixture.settingsService.getUrl.mockResolvedValue('http://localhost:3000');
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(opts.secure).toBe(false);
    });

    it('sets secure=true when URL is https', async () => {
      fixture.settingsService.getUrl.mockResolvedValue('https://prod.example.com');
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(opts.secure).toBe(true);
    });

    it('sets secure=false when URL is null', async () => {
      fixture.settingsService.getUrl.mockResolvedValue(null);
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(opts.secure).toBe(false);
    });

    it('sets a maxAge (cookie is not a session cookie)', async () => {
      const { req, res } = fixture.makeReqRes();
      await new Promise<void>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
      );
      const opts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(typeof opts.maxAge).toBe('number');
      expect(opts.maxAge).toBeGreaterThan(0);
    });

    it('returns a non-empty handle via callback', async () => {
      const { req } = fixture.makeReqRes();
      const handle = await new Promise<string>((resolve, reject) =>
        fixture.store.store(req, {}, null, {}, (err, h) => (err ? reject(err) : resolve(h))),
      );
      expect(typeof handle).toBe('string');
      expect(handle.length).toBeGreaterThan(0);
    });

    it('returns unique handles on each call', async () => {
      const { req: req1 } = fixture.makeReqRes();
      const { req: req2 } = fixture.makeReqRes();

      const h1 = await new Promise<string>((resolve, reject) =>
        fixture.store.store(req1, {}, null, {}, (err, h) => (err ? reject(err) : resolve(h))),
      );
      const h2 = await new Promise<string>((resolve, reject) =>
        fixture.store.store(req2, {}, null, {}, (err, h) => (err ? reject(err) : resolve(h))),
      );

      expect(h1).not.toBe(h2);
    });

    it('embeds nonce in the signed cookie payload', async () => {
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, {
        nonce: 'my-nonce-123',
      });

      // Decode the base64url payload (before the last dot)
      const dotIdx = cookieValue.lastIndexOf('.');
      const data = cookieValue.slice(0, dotIdx);
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));

      expect(parsed.handle).toBe(handle);
      expect(parsed.ctx.nonce).toBe('my-nonce-123');
    });

    it('embeds appState in the signed cookie payload', async () => {
      const appState = { redirect: '/dashboard', extra: 42 };
      const { cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, {}, appState);

      const dotIdx = cookieValue.lastIndexOf('.');
      const parsed = JSON.parse(Buffer.from(cookieValue.slice(0, dotIdx), 'base64url').toString('utf8'));

      expect(parsed.appState).toEqual(appState);
    });

    it('serialises Date issued to ISO string', async () => {
      const issued = new Date('2025-01-15T10:00:00.000Z');
      const { cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, { issued });

      const dotIdx = cookieValue.lastIndexOf('.');
      const parsed = JSON.parse(Buffer.from(cookieValue.slice(0, dotIdx), 'base64url').toString('utf8'));

      expect(parsed.ctx.issued).toBe(issued.toISOString());
    });

    it('cookie value contains two parts separated by a dot (data.sig)', async () => {
      const { cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store);
      const parts = cookieValue.split('.');
      // base64url data may contain dots when segments are encoded, but we always split on lastIndexOf
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });
  });
}
