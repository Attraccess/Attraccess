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

- **Tools** are generated per process from the live OpenAPI document and `reviewed-manifest.json` (`McpToolRegistry`, `openapi-tools.ts`). Names are operation IDs.
- **Auth** (`McpBearerGuard`): only `Authorization: Bearer`. API tokens go through the normal `SessionStrategy`; OAuth access tokens (`mcp_at_…`) are looked up in `McpOAuthService` and must belong to this resource's audience.
- **Delegation**: an API-token call forwards the caller's own bearer. An OAuth call forwards nothing: the principal is attached to the in-process request object (`mcp-delegation.ts`, a WeakMap) and `SessionStrategy` turns it into `granted ∩ current permissions` with `authenticationMethod: 'mcp-oauth'`. The gateway sets the caller's IP and user agent on the request, so audit and rate limiting see the real client. No credential exists that is stronger than the MCP principal.
- **OAuth** (`mcp-oauth.controller.ts`, `mcp-oauth.service.ts`): metadata, DCR, authorize (redirects to the frontend consent page `/oauth/authorize?request=…`), token. State lives in `mcp_oauth_client`, `mcp_oauth_grant` and `mcp_oauth_token` (hashed values only). The consent page calls `getMcpOAuthRequest`, `approveMcpOAuthRequest` and `denyMcpOAuthRequest` with the browser session.

## Changing the API: the manifest

Every operation of the API must have an entry in `reviewed-manifest.json`; the drift test (`mcp-manifest.drift.spec.ts`) fails otherwise and prints the entries to add. Review before you allow:

- JSON in and JSON out? Not streaming, not a file, not a provider callback, not host lifecycle, not a credential flow?
- Is the REST permission check enough? (Tools run with whatever the caller's permissions allow.)
- Give every `deny` a specific reason.

`MCP_MANIFEST_WRITE=1 pnpm nx test api --testFile=mcp-manifest.drift` proposes entries with a first-pass classification (`reviewed-manifest.classifier.test-fixture.ts`); `MCP_MANIFEST_WRITE=reclassify` redoes all of them. The `shape` hash covers the operation and only the schemas it reaches. `knownNonToolOperations` and the id/path safeguard in `openapi-tools.ts` stop an operation that Swagger misdescribes from being allowed by a manifest edit alone.

Plugin operations are never in the manifest, so they are never tools (runtime only logs a warning).
