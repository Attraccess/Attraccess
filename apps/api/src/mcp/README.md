# MCP OAuth client registration

MCP OAuth uses static public client registration through the `MCP_OAUTH_CLIENTS`
environment variable. Dynamic client registration is intentionally disabled.
Deployments register each MCP client out of band with its public `client_id` and
exact callback URI list, for example:

```json
[
  {
    "client_id": "local-mcp-desktop",
    "client_name": "Local MCP Desktop",
    "redirect_uris": ["http://localhost:43123/oauth/callback"]
  }
]
```

Clients must use authorization code with PKCE (`S256`) and include the MCP
resource URI from protected-resource metadata in both authorization and token
requests. Attraccess displays a consent page to a user signed in through the
normal web session. Access tokens last 15 minutes; refresh tokens last at most
seven days and rotate on each refresh. Permission grants are rechecked against
the user's current RBAC permissions when a token is issued and on every MCP
request. OAuth access tokens are encrypted and resource-bound; calls delegate
to REST using a short lived Attraccess session with a signed, permission-limited
principal context. OAuth bearer values are never forwarded to REST.

Plugin endpoints remain excluded because the Swagger export disables plugins.
