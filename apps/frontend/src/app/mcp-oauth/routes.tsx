import type { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { McpOAuthErrorPage } from './error';
import { McpOAuthAuthorizePage } from './index';

export const mcpOAuthRoutes: RouteConfig[] = [
  {
    // Consent step of the MCP OAuth flow. `authRequired` shows the login in place for signed-out users and
    // renders this page at the same URL afterwards, so the request id survives login, 2FA and SSO.
    path: '/oauth/authorize',
    element: <McpOAuthAuthorizePage />,
    authRequired: true,
    noLayout: true,
  },
  {
    // An authorization request that cannot be sent back to the client; explaining it needs no sign-in.
    path: '/oauth/error',
    element: <McpOAuthErrorPage />,
    authRequired: false,
    noLayout: true,
  },
];
