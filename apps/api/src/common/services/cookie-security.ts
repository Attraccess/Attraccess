import { Logger } from '@nestjs/common';
import { CookieSameSitePolicy, DEFAULT_COOKIE_SAME_SITE } from '../../settings/constants';

const logger = new Logger('CookieSecurity');

export type CookieSecurityOptions = {
  secure: boolean;
  sameSite: CookieSameSitePolicy;
};

/**
 * Derives cookie security flags from the application URL and the configured SameSite policy.
 *
 * Rules:
 * - `secure` is true when the URL uses https.
 * - `sameSite` is taken from the stored setting (default: 'lax').
 * - `SameSite=None` **requires** `Secure=true` (browsers reject Non-Secure + None cookies).
 *   If the URL is http and the policy is 'none', we fall back to 'lax' and emit a warning.
 *
 * Policy guidance:
 * - `lax`  – safe default; works with SSO (OIDC/SAML IdP redirects are top-level GET navigations).
 * - `strict` – maximum isolation; NOTE: breaks SSO login because IdP redirects are cross-site
 *              navigations and the session cookie is not sent, causing OAuth state validation to fail.
 * - `none`  – required only if frontend and API are served from *different origins*; requires HTTPS.
 */
export function deriveCookieSecurity(
  url: string | null,
  sameSite: CookieSameSitePolicy = DEFAULT_COOKIE_SAME_SITE,
): CookieSecurityOptions {
  const secure = url?.startsWith('https://') ?? false;

  if (sameSite === 'none' && !secure) {
    logger.warn(
      'SameSite=None requires a Secure cookie (HTTPS). The application URL is not HTTPS. ' +
        'Falling back to SameSite=Lax to prevent browsers from rejecting the cookie.',
    );
    return { secure, sameSite: 'lax' };
  }

  return { secure, sameSite };
}
