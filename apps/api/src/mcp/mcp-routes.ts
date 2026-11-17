/** Routes served at the origin root, outside the global API prefix (RFC 8414 / RFC 9728 discovery). */
export const MCP_UNPREFIXED_ROUTES = [
  '.well-known/oauth-protected-resource',
  '.well-known/oauth-protected-resource/{*resourcePath}',
  '.well-known/oauth-authorization-server',
  '.well-known/openid-configuration',
] as const;
