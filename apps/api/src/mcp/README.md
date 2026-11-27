# MCP server (developer note)

The user documentation is `docs/en/developer/mcp.md` (and `docs/de/...`). This note is for people changing the code.

## How a call flows

```
MCP client ──POST /api/mcp──▶ McpController  (rate limit, McpBearerGuard)
                                  │  SDK Server + Streamable HTTP transport (stateless, JSON responses)
                                  ▼
                           tools/call ──▶ McpRestGateway ──▶ private local socket ──▶ the same Express app
                                                            (guards, pipes, interceptors, filters of the REST endpoint)
```

- **Tools** are generated per process (lazily, once) from the live OpenAPI document by rule (`McpToolRegistry`, `openapi-tools.ts`). Names are operation IDs. `tools/list` and `tools/call` only offer the tools the caller's effective permissions allow (see below).
- **Auth** (`McpBearerGuard`): only `Authorization: Bearer`. API tokens go through the normal `SessionStrategy`; OAuth access tokens (`mcp_at_…`) are looked up in `McpOAuthService` and must belong to this resource's audience.
- **Delegation**: an API-token call forwards the caller's own bearer. An OAuth call forwards nothing: the principal is attached to the in-process request object (`users-and-auth/strategies/mcp-delegation.ts`, a WeakMap) and `SessionStrategy` turns it into `granted ∩ current permissions` with `authenticationMethod: 'mcp-oauth'`. The gateway sets the caller's IP and user agent on the request, so audit and rate limiting see the real client. No credential exists that is stronger than the MCP principal.
- **OAuth** (`mcp-oauth.controller.ts`, `mcp-oauth.service.ts`): metadata, DCR, authorize (redirects to the frontend consent page `/oauth/authorize?request=…`), token. State lives in `mcp_oauth_client`, `mcp_oauth_grant` and `mcp_oauth_token` (hashed values only). The consent page calls `getMcpOAuthRequest`, `approveMcpOAuthRequest` and `denyMcpOAuthRequest` with the browser session; `listMcpOAuthGrants` and `revokeMcpOAuthGrant` (`mcp-oauth-grants.controller.ts`) back the grant list on the account MCP page.

## Which operations are tools

There is no review list. `generateMcpTools(document)` (in `openapi-tools.ts`, owned by the maintainers in `CODEOWNERS`) returns `{ tools, skipped }` and never throws; `skipped` names every operation that is not a tool, with the reason (the registry only logs the count, plus duplicate IDs at info level). An operation is a tool only if it passes these checks, in this order:

1. It has a valid, unique `operationId` (letters, digits, underscores, at most 64). Every operation that shares a duplicated ID is skipped. Plugin operations without an explicit ID are named `Controller_method` by Nest.
2. It has an `x-attraccess-auth` extension. `@Auth`, `@AuthAny` and `@SessionAuth` emit it (`{ all, any, sessionOnly }`), and so do the two introducer decorators (with an empty requirement, the guard decides per resource). Routes without it are public or use a custom guard (metrics, form photo tokens) and are never tools.
3. `sessionOnly` is not true (API tokens, 2FA, passkeys, sessions, the consent and grant endpoints are `@SessionAuth`).
4. It has no `x-mcp-exclude` extension: `@NotAnMcpTool(reason)` on a method or class.
5. It passes the technical exclusions: the id/path pattern for streams, uploads, downloads, callbacks, reboot and SSO discovery, `knownNonToolOperations`, `callbacks`, `x-mcp-streaming`, binary or byte schemas, `not`, cyclic or unsupported refs, header or cookie parameters, non-JSON request bodies, non-JSON 2xx responses and input name collisions.

Plugin operations follow the same rules. **A new JSON endpoint that uses plain `@Auth` becomes a tool without review**, protected only by its REST guard. Put `@NotAnMcpTool('reason')` on every endpoint that handles secrets or key material, takes or sets credentials, changes host, firmware or plugin code, or makes the server fetch an arbitrary URL, and use `@SessionAuth` for what only a signed-in browser may do.

`@Auth('x')` on a method overrides `@Auth()` on its class, exactly like `EffectivePermissionsGuard` (`getAllAndOverride`); `@nestjs/swagger` keeps the method-level `x-attraccess-auth` when the class decorator is applied (covered in `auth-decorator.spec.ts`). `mcp-host-tools.spec.ts` builds the real host document and checks that every operation the retired manifest denied stays out.

## Per-caller filtering

`McpController` passes the principal's `effectivePermissions` (API token: token ∩ owner; OAuth: grant ∩ current, both from `SessionStrategy`) to `createMcpServer`. A tool is visible when every key in `auth.all` is held and, if `auth.any` is not empty, at least one of it is (`mcpToolAllowed` in `libs/shared`, also used by the consent page). `tools/call` of a hidden tool fails exactly like an unknown tool (`InvalidParams`, `Unknown tool: <name>`). The REST guard still decides every visible call.

## Consent: permission choice and grants

- `describeRequest` returns, next to the requested `permissions`, the user's `availablePermissions`, the `requestedPermissionKeys` and `tools` (name, summary, `requiredAll`, `requiredAny`) that the full available set could unlock. The page narrows that list locally with `mcpToolAllowed`; there is no preview endpoint.
- `approveMcpOAuthRequest` takes an optional body `{ permissionKeys }`. A body is validated before the request is consumed (400, the request stays usable): not empty, every key in the catalog, every key held by the user now. It may exceed what the client requested. Without a body the requested scope applies (all current permissions when none was requested), and a superset still redirects with `invalid_scope`. The token response `scope` is the granted keys.
- `GET mcp/oauth/grants` (`listMcpOAuthGrants`) lists the user's active grants, `DELETE mcp/oauth/grants/:grantId` (`revokeMcpOAuthGrant`) revokes one with its tokens through the atomic `revokeGrant`; another user's grant is a 404. Both are session-only and so never tools.
