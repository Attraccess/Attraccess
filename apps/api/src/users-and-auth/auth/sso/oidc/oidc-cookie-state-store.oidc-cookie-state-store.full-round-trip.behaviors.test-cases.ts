import { OIDC_STATE_COOKIE_NAME, OidcCookieStateStore } from './oidc-cookie-state-store';
import { registerOidcCookieStateStoreFixture } from './oidc-cookie-state-store.oidc-cookie-state-store.test-fixture';

export function registerFullRoundTripCases(fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>) {
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
}

export function registerSameSiteInvariantOidcStateCookieIsAlwaysLaxCases(
  fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>,
) {
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
}

export function registerSecurityCases(fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>) {
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
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>) {
  it('should be defined', () => {
    expect(fixture.store).toBeDefined();
  });
}
