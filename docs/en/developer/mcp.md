# MCP Server (AI Clients)

<!-- llms-description: Explains how to connect MCP clients with API tokens or OAuth, how permissions choose the tools and how to revoke an app. -->

Attraccess exposes its REST API as a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, so AI clients such as Claude Code, MCP Inspector or your own agents can read and change data with the same rules as everyone else.

- **Endpoint:** `https://<your-attraccess>/api/mcp` (Streamable HTTP, tools only). Signed-in users find the exact URL, with a copy button and the sign-in options that work on it, under Account → Advanced → AI clients (MCP).
- **Tools:** one tool per REST operation. The tool name is the operation ID from the OpenAPI document (for example `getAllResources`). The tools are generated from the running API, so they always match it. A client only sees the tools its permissions allow: a tool it could not use does not appear in the list, and calling it fails like calling an unknown tool.
- **Every call is a REST call.** Validation, permission checks, audit log entries and error messages are exactly those of the REST endpoint. A REST error (400, 403, 404, ...) comes back as a tool error that contains the HTTP status and message.

## Connect with an API token

1. Create a token under **Account → Advanced → API tokens** (you need the `users.api-tokens.manage` permission) and give it only the permissions the client needs ([API Reference](developer/api-reference.md#authentication)).
2. Send it as `Authorization: Bearer <token>`.

```bash
claude mcp add --transport http attraccess https://your-attraccess/api/mcp \
  --header "Authorization: Bearer <token>"
```

API tokens (and so MCP access with them) need Valkey (`VALKEY_URL`) for their request rate limit.

A token can use exactly the permissions on its allow-list that its owner still holds. If the owner loses a permission, or `users.api-tokens.manage`, the next call is refused. Revoked, expired and deleted-owner tokens get `401`.

## Connect with OAuth

MCP clients that support the MCP authorization flow need no token. They find everything on their own:

1. The client calls `/api/mcp` without credentials and gets `401` with a `WWW-Authenticate` header that points at the protected-resource metadata (`/.well-known/oauth-protected-resource/api/mcp`).
2. It reads `/.well-known/oauth-authorization-server` and registers itself (Dynamic Client Registration, RFC 7591). Only public clients with PKCE (`S256`) are supported. Redirect URIs must use `https`, or `http` on `localhost`, `127.0.0.1` or `[::1]`, with 1 to 10 URIs and no fragment. The client then sends the MCP endpoint URL as `resource` (RFC 8707) with the authorization request and every token request, refreshes included; anything else is refused with `invalid_target`. `state` may be up to 1024 characters long.
3. The browser opens the Attraccess consent page. If you are not signed in you sign in first (including two-factor authentication or SSO) and return to the page. The page shows the app's name, where it returns to and the permissions it asks for. An app that registered itself gets a warning, because Attraccess cannot confirm its name. The page refuses to work inside a frame.

   You choose what the app gets, the same way as for an API token: the permission picker starts with what the app asked for (everything you can do, if it named nothing) and lists only permissions you hold now. You can allow less or more than the app asked for, but never more than you may do yourself. A section titled "N tools enabled" lists the tools the current selection gives the app and updates as you change it. **Allow** stays disabled while nothing is selected.

4. **Allow** sends the client a one-time authorization code (valid for 2 minutes) that it exchanges for tokens at the token endpoint. **Deny** sends it `access_denied`. A consent request that nobody answers expires after 10 minutes.

If the app is unknown or asks to return to an address it did not register, Attraccess shows an error page and never sends the browser to that address. Errors in the request of a self-registered app with an `https` redirect URI are shown on that page too; operator-registered apps and apps on this device (`localhost`) get the error back as an OAuth error redirect.

### Connected apps

Under **Account → Advanced → AI clients (MCP)**, the list **Connected AI apps** shows every app you allowed through OAuth with its permissions, when you approved it, when it last connected and when its access expires. Apps that registered themselves are marked as unverified. **Revoke** in the row menu (after a confirmation) ends the connection at once: its access and refresh tokens stop working and the app has to ask again. Only you can see and revoke your own connections, and only from a signed-in browser session; API tokens and MCP clients cannot.

Access tokens last 15 minutes. Refresh tokens rotate on every use and stop working after 7 days in total. If an already-used refresh token is presented again, the whole connection is revoked. Tokens are stored only as keyed hashes derived from `AUTH_SESSION_SECRET`, so changing that secret ends all OAuth connections, just like all sign-in sessions.

A client can name the permissions it needs as a space-separated `scope`. Without a scope it asks for all your permissions. The consent page marks permissions you do not have. The permissions you select are what the connection gets, and the token response reports them as `scope`. A client that does not send a selection (an API caller answering the request without a body) gets the requested scope, and if that exceeds your permissions it receives `invalid_scope` and no access. At every request the client has the permissions that were granted **and** that you hold right now, so removing a role in Attraccess removes the access on the next call.

An OAuth access token works only at `/api/mcp`. REST endpoints reject it.

Per IP address (per /64 network for IPv6), the endpoints allow 600 requests per minute at `/api/mcp` (each message of a JSON-RPC batch counts), 60 per minute at the discovery, authorization, token and consent endpoints and 20 registrations per hour. With an API token, each tool call counts once against the token's own REST request limit, and so does each MCP request without a tool call.

### Static clients

Clients that cannot register themselves can be configured with the optional `MCP_OAUTH_CLIENTS` environment variable, a JSON array:

```bash
MCP_OAUTH_CLIENTS='[{"client_id":"my-agent","client_name":"My agent","redirect_uris":["http://localhost:8123/callback"]}]'
```

An invalid `MCP_OAUTH_CLIENTS` value is ignored with an error in the log; Attraccess still starts.

### HTTPS requirement

OAuth is available only when the public URL (Settings, or `ATTRACCESS_URL`) uses `https` or points at localhost. On a plain-HTTP LAN address Attraccess still starts and `/api/mcp` works with API tokens, but the OAuth endpoints answer `404` (error `oauth_disabled`) and a warning is logged at startup.

When a reverse proxy sits in front of Attraccess it must forward `/.well-known/*` and `/api/mcp` to the API and must not buffer `/api/mcp`.

## Which operations are tools

Tools come from rules, not from a review list. An operation is a tool when all of these hold:

- It has a unique operation ID and requires a signed-in user (`@Auth` or `@AuthAny`). Public routes (sign-up, login, status and setup pages, public information) and routes with their own token check are not tools.
- It does not need a browser session. Session-only routes are never tools: API-token management, two-factor, passkeys, sign-in sessions, the account of the signed-in user, the OAuth consent and connected-app endpoints.
- It is not marked `@NotAnMcpTool`. Developers put this on endpoints that handle secrets or key material (for example VAPID, secure-boot, metrics and payment keys, registry tokens), set credentials, restart or shut down the host, change firmware or plugin code, or make the server fetch an arbitrary URL (identity provider discovery).
- It passes the technical checks: JSON in and JSON out, no stream or live update, no file or binary download or upload, no provider callback.

Plugin endpoints follow the same rules, so the endpoints of installed plugins appear as tools too (their names look like `ControllerName_method` unless the plugin sets an operation ID). The first-party plugins mark their credential, key and firmware operations as not tools. The list is built once when the server starts, so plugins installed later appear after a restart.

> **For plugin and API developers:** a new JSON endpoint with plain `@Auth` becomes a tool without anyone reviewing it, protected only by its permission check. Add `@NotAnMcpTool('reason')` from `@attraccess/plugins-backend-sdk` to every endpoint that should not be reachable by an AI client, and use `@SessionAuth` for actions that only a signed-in person in a browser may do. `apps/api/src/mcp/README.md` has the details.
