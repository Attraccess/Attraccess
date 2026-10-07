import session from 'express-session';

/** SAML state may carry authentication context. HTTPS is required even when
 * the configured application URL is missing, HTTP, or later changed. Express
 * uses the configured trust-proxy policy when TLS terminates at a proxy. */
export function samlSession(secret: string) {
  return session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, httpOnly: true, sameSite: 'lax' },
  });
}
