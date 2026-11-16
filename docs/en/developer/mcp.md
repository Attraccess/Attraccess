# MCP Server (AI Clients)

<!-- llms-description: Explains how to connect MCP clients to Attraccess with API tokens or OAuth, which tools are exposed, how permissions apply and how the reviewed manifest is maintained. -->

Attraccess exposes its REST API as a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, so AI clients such as Claude Code, MCP Inspector or your own agents can read and change data with the same rules as everyone else.

- **Endpoint:** `https://<your-attraccess>/api/mcp` (Streamable HTTP, tools only).
- **Tools:** one tool per REST operation. The tool name is the operation ID from the OpenAPI document (for example `getAllResources`). The tools are generated from the running API, so they always match it.
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
4. **Allow** sends the client a one-time authorization code (valid for 2 minutes) that it exchanges for tokens at the token endpoint. **Deny** sends it `access_denied`. A consent request that nobody answers expires after 10 minutes.

If the app is unknown or asks to return to an address it did not register, Attraccess shows an error page and never sends the browser to that address. Errors in the request of a self-registered app with an `https` redirect URI are shown on that page too; operator-registered apps and apps on this device (`localhost`) get the error back as an OAuth error redirect.

Access tokens last 15 minutes. Refresh tokens rotate on every use and stop working after 7 days in total. If an already-used refresh token is presented again, the whole connection is revoked. Tokens are stored only as keyed hashes derived from `AUTH_SESSION_SECRET`, so changing that secret ends all OAuth connections, just like all sign-in sessions.

A client can name the permissions it needs as a space-separated `scope`. Without a scope it asks for all your permissions. The consent page marks permissions you do not have; if you allow anyway, the client receives `invalid_scope` and gets no access. At every request the client has the permissions that were granted **and** that you hold right now, so removing a role in Attraccess removes the access on the next call.

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

## What is not available

Some operations are never tools, each with a specific reason: streams and live updates, file and binary downloads or uploads, host reboot and shutdown, plugin installation and updates, stored secrets (for example registry tokens and key material), sign-up, sign-in and credential flows (login, sessions, passwords, two-factor, passkeys, SSO callbacks), API-token management and the OAuth consent endpoints themselves.

**Plugin endpoints are not exposed yet.** They are deferred; only the operations of Attraccess itself become tools.

## The reviewed manifest

`apps/api/src/mcp/reviewed-manifest.json` lists every operation of the API with a decision (`allow` or `deny`), a reason and a `shape` hash of the reviewed contract. A new or changed operation is not exposed until someone reviews it.

- A Jest test (`apps/api/src/mcp/mcp-manifest.drift.spec.ts`, part of `api:test`) builds the OpenAPI document the same way as `export-swagger` and fails for unreviewed operations, stale entries, missing or duplicate operation IDs, changed shapes and allowed operations that cannot be tools. The failure message names the entries to add or update.
- `MCP_MANIFEST_WRITE=1 pnpm nx test api --testFile=mcp-manifest.drift` proposes entries. Check every decision in the diff before committing; the file is owned by the maintainers in `CODEOWNERS`.
- A running server never fails because of drift. It skips operations that are unreviewed or changed and logs a warning.
