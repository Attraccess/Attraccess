import { randomBytes, createHash } from 'node:crypto';
import { Request } from 'express';
import { CacheProvider } from '@node-saml/node-saml';
import { SessionStore } from '../../session-store/session-store';

const TTL = 10 * 60 * 1000;

/** A protocol request can be consumed only by the browser that initiated it. */
export function browserBoundSamlCache(
  store: SessionStore,
  req: Request,
  providerId: number,
  secure: boolean,
): CacheProvider {
  const name = `${secure ? '__Host-' : ''}saml-request-${providerId}`;
  // The HTTPS host prefix prevents sibling sites from injecting a Domain cookie.
  const path = secure ? '/' : `/api/auth/sso/SAML/${providerId}`;
  const nonce = /\/callback\/?$/.test(req.path) ? req.cookies?.[name] : randomBytes(32).toString('base64url');
  const validNonce = typeof nonce === 'string' && /^[A-Za-z0-9_-]{43}$/.test(nonce);
  const key = (id: string) => `SAML-login:${providerId}:${createHash('sha256').update(`${nonce}:${id}`).digest('hex')}`;
  // node-saml reads the ID twice while validating one response. Claim it atomically
  // on the first read, then keep it only within this request for the second read.
  const claimed = new Map<string, string | null>();
  return {
    async saveAsync(id, value) {
      if (
        !validNonce ||
        !(await store.putLogoutState(
          key(id),
          JSON.stringify({ value, relay: req.query?.RelayState }),
          Date.now() + TTL,
        ))
      )
        throw new Error('Unable to create SAML request');
      req.res.cookie(name, nonce, { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path, maxAge: TTL });
      return { value, createdAt: Date.now() };
    },
    async getAsync(id) {
      if (!validNonce) return null;
      if (!claimed.has(id)) {
        req.res.clearCookie(name, { path, httpOnly: true, secure, sameSite: secure ? 'none' : 'lax' });
        const raw = await store.takeLogoutState(key(id));
        const saved = raw ? JSON.parse(raw) : null;
        claimed.set(id, saved && saved.relay === req.body?.RelayState ? saved.value : null);
      }
      return claimed.get(id) ?? null;
    },
    async removeAsync(id) {
      if (!validNonce || !id) return null;
      claimed.delete(id);
      return store.takeLogoutState(key(id));
    },
  };
}
