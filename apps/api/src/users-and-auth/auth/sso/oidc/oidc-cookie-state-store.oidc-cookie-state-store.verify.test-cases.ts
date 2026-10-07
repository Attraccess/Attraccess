import { OIDC_STATE_COOKIE_NAME, OidcCookieStateStore } from './oidc-cookie-state-store';
import { registerOidcCookieStateStoreFixture } from './oidc-cookie-state-store.oidc-cookie-state-store.test-fixture';
export function registerVerifyCases(fixture: ReturnType<typeof registerOidcCookieStateStoreFixture>) {
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
}
