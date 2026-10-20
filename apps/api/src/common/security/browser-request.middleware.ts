import { NextFunction, Request, Response } from 'express';
import { BrowserOriginPolicy } from './browser-origin-policy';

// These protocol endpoints verify signed messages and/or state in their own guards.
// They must accept requests from an identity provider outside the browser allowlist.
const SSO_PROTOCOL = /^\/api\/auth\/sso\/(?:SAML\/[^/]+\/(?:callback|slo)|OIDC\/[^/]+\/backchannel-logout)\/?$/;

export function browserRequestProtection(policy: BrowserOriginPolicy) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const path = request.path;
      if (SSO_PROTOCOL.test(path)) return next();
      const origin = request.headers.origin;
      if (origin !== undefined && !(await policy.allows(origin))) {
        response.status(403).json({ message: 'Browser origin is not approved' });
        return;
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
      const browserCredentials =
        Boolean(request.cookies?.['auth-session']) ||
        request.body?.tokenLocation === 'cookie' ||
        Boolean(request.headers['sec-fetch-mode']);
      if (!origin && browserCredentials) {
        let refererOrigin: string | undefined;
        try {
          refererOrigin = new URL(request.headers.referer ?? '').origin;
        } catch {
          /* deny below */
        }
        if (!refererOrigin || !(await policy.allows(refererOrigin))) {
          response.status(403).json({ message: 'An approved browser origin is required' });
          return;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
