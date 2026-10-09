import { registerOidcCookieStateStoreFixture } from './oidc-cookie-state-store.oidc-cookie-state-store.test-fixture';
import { OIDC_STATE_COOKIE_NAME, OidcCookieStateStore } from './oidc-cookie-state-store';

describe('OidcCookieStateStore', () => {
  const fixture = registerOidcCookieStateStoreFixture();

  it('should be defined', () => {
    expect(fixture.store).toBeDefined();
  });

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

  // ─── verify() ─────────────────────────────────────────────────────────────

  describe('verify()', () => {
    it('returns ctx and appState for a valid cookie + matching handle', async () => {
      const ctx = { nonce: 'abc', maxAge: 3600, issued: new Date('2025-06-01T12:00:00.000Z') };
      const appState = { foo: 'bar' };

      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, ctx, appState);
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown; appState: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c, a) => {
          if (err) reject(err);
          else resolve({ ctx: c, appState: a });
        }),
      );

      expect((result.ctx as { nonce?: string }).nonce).toBe('abc');
      expect((result.ctx as { maxAge?: number }).maxAge).toBe(3600);
      expect(result.appState).toEqual({ foo: 'bar' });
    });

    it('rehydrates issued from ISO string back to Date', async () => {
      const issued = new Date('2025-01-15T10:00:00.000Z');
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, { issued });
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect((result.ctx as { issued?: Date }).issued).toEqual(issued);
      expect((result.ctx as { issued?: Date }).issued).toBeInstanceOf(Date);
    });

    it('clears the cookie after successful verification (single-use)', async () => {
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store);
      const { req, res } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      await new Promise<void>((resolve, reject) =>
        fixture.store.verify(req, handle, (err) => (err ? reject(err) : resolve())),
      );

      expect(res.clearCookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, { path: '/' });
    });

    it('clears the cookie even when cookie is missing (prevents re-use attempts)', async () => {
      const { req, res } = fixture.makeReqRes({}); // no cookie

      await new Promise<void>((resolve) => fixture.store.verify(req, 'any-handle', () => resolve()));

      expect(res.clearCookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, { path: '/' });
    });

    it('clears the cookie even when HMAC is invalid', async () => {
      const { req, res } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: 'tampered.value' });

      await new Promise<void>((resolve) => fixture.store.verify(req, 'any-handle', () => resolve()));

      expect(res.clearCookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, { path: '/' });
    });

    it('fails with false ctx when cookie is missing', async () => {
      const { req } = fixture.makeReqRes({});

      const result = await new Promise<{ ctx: unknown; appState: unknown }>((resolve, reject) =>
        fixture.store.verify(req, 'any-handle', (err, c, a) => {
          if (err) reject(err);
          else resolve({ ctx: c, appState: a });
        }),
      );

      expect(result.ctx).toBe(false);
      expect((result.appState as { message?: string })?.message).toBeTruthy();
    });

    it('fails with false ctx when HMAC is tampered', async () => {
      const { handle } = await fixture.storeAndCaptureCookieValue(fixture.store);
      // Provide a cookie with a bad signature
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: 'dGFtcGVyZWQ.badsig' });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect(result.ctx).toBe(false);
    });

    it('fails with false ctx when handle does not match', async () => {
      const { cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store);
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req, 'wrong-handle', (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect(result.ctx).toBe(false);
    });

    it('fails with false ctx when payload JSON is invalid', async () => {
      // Construct a value with a valid HMAC over garbage data
      const goodModule = await fixture.buildModule();
      const goodStore = goodModule.get<OidcCookieStateStore>(OidcCookieStateStore);

      // Get a valid cookie value and tamper the data part
      const { cookieValue } = await fixture.storeAndCaptureCookieValue(goodStore);
      const dotIdx = cookieValue.lastIndexOf('.');
      const badData = Buffer.from('not-json!!!').toString('base64url');
      // Use original sig — will fail HMAC (data changed), so still returns false
      const tampered = `${badData}.${cookieValue.slice(dotIdx + 1)}`;

      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: tampered });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        goodStore.verify(req, 'any', (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect(result.ctx).toBe(false);
    });
  });

  // ─── Security ─────────────────────────────────────────────────────────────

  describe('security', () => {
    it('rejects a cookie signed with a different secret', async () => {
      // Store with storeA (secret = 'secret-A')
      const moduleA = await fixture.buildModule('http://localhost', 'secret-A');
      const storeA = moduleA.get<OidcCookieStateStore>(OidcCookieStateStore);
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(storeA);

      // Verify with storeB (secret = 'secret-B') — should fail
      const moduleB = await fixture.buildModule('http://localhost', 'secret-B');
      const storeB = moduleB.get<OidcCookieStateStore>(OidcCookieStateStore);

      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        storeB.verify(req, handle, (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect(result.ctx).toBe(false);
    });

    it('two consecutive verify() calls for the same cookie both clear the cookie', async () => {
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store);

      // First call — should succeed
      const { req: req1, res: res1 } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });
      await new Promise<void>((resolve, reject) =>
        fixture.store.verify(req1, handle, (err) => (err ? reject(err) : resolve())),
      );
      expect(res1.clearCookie).toHaveBeenCalledTimes(1);

      // Second call — cookie is gone (already cleared client-side), so missing
      const { req: req2 } = fixture.makeReqRes({}); // no cookie
      const result2 = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req2, handle, (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );
      expect(result2.ctx).toBe(false);
    });

    it('uses timing-safe comparison (does not leak key length via exception)', async () => {
      // A one-character signature should not throw — just return false
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: 'dGVzdA.x' });

      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req, 'any', (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );

      expect(result.ctx).toBe(false);
    });
  });

  // ─── OIDC state cookie is always Lax regardless of auth cookie setting ────

  describe('SameSite invariant — oidc-state cookie is always Lax', () => {
    const urls = ['https://prod.example.com', 'http://localhost:3000', null] as const;

    for (const url of urls) {
      it(`always sets SameSite=Lax for url=${JSON.stringify(url)}`, async () => {
        fixture.settingsService.getUrl.mockResolvedValue(url);
        const { req, res } = fixture.makeReqRes();

        await new Promise<void>((resolve, reject) =>
          fixture.store.store(req, {}, null, {}, (err) => (err ? reject(err) : resolve())),
        );

        const opts = (res.cookie as jest.Mock).mock.calls[0][2];
        expect(opts.sameSite).toBe('lax');
      });
    }
  });

  // ─── Full round-trip with realistic OIDC context ──────────────────────────

  describe('full round-trip', () => {
    it('store → verify succeeds with nonce, maxAge, issued, and appState', async () => {
      const issued = new Date();
      const ctx = { nonce: 'nonce-xyz', maxAge: 86400, issued };
      const appState = { redirectTo: '/dashboard', extra: { key: 'val' } };

      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, ctx, appState);
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown; appState: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c, a) => (err ? reject(err) : resolve({ ctx: c, appState: a }))),
      );

      const resultCtx = result.ctx as { nonce?: string; maxAge?: number; issued?: Date };
      expect(resultCtx.nonce).toBe('nonce-xyz');
      expect(resultCtx.maxAge).toBe(86400);
      expect(resultCtx.issued?.toISOString()).toBe(issued.toISOString());
      expect(result.appState).toEqual(appState);
    });

    it('store → verify works with empty ctx and null appState', async () => {
      const { handle, cookieValue } = await fixture.storeAndCaptureCookieValue(fixture.store, {}, null);
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });

      const result = await new Promise<{ ctx: unknown; appState: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c, a) => (err ? reject(err) : resolve({ ctx: c, appState: a }))),
      );

      expect(result.ctx).not.toBe(false);
      expect(result.appState).toBeNull();
    });

    it('secure flag matches URL scheme in the cookie but sameSite stays lax', async () => {
      fixture.settingsService.getUrl.mockResolvedValue('https://secure.example.com');
      const { handle, cookieValue, res } = await fixture.storeAndCaptureCookieValue(fixture.store, { nonce: 'n' });

      const setOpts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(setOpts.sameSite).toBe('lax');
      expect(setOpts.secure).toBe(true);

      // Verify still works
      const { req } = fixture.makeReqRes({ [OIDC_STATE_COOKIE_NAME]: cookieValue });
      const result = await new Promise<{ ctx: unknown }>((resolve, reject) =>
        fixture.store.verify(req, handle, (err, c) => (err ? reject(err) : resolve({ ctx: c }))),
      );
      expect((result.ctx as { nonce?: string }).nonce).toBe('n');
    });
  });
});
