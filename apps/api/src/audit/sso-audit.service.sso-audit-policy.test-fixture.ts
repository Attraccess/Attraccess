export function registerSsoAuditPolicyFixture() {
  const provider = JSON.stringify({
    id: 4,
    name: 'Workforce',
    type: 'oidc',
    configuration: {
      issuer: 'https://idp.example.com',
      authorizationURL: 'https://idp.example.com/authorize',
      tokenURL: 'https://idp.example.com/token',
      userInfoURL: 'https://idp.example.com/userinfo',
      clientId: 'client-id',
      clientSecretConfigured: true,
      scopes: ['email'],
      usernameClaimPaths: null,
      emailClaimPaths: null,
      roleMappings: { 'user-manager': ['admins'] },
      omitted: {},
    },
  });

  const delta = JSON.stringify({ added: ['user-manager'], removed: [], updated: [] });

  const providerChanges = JSON.stringify({ changed: ['configuration.issuer'], rotated: [] });
  return {
    get provider() {
      return provider;
    },
    get delta() {
      return delta;
    },
    get providerChanges() {
      return providerChanges;
    },
  };
}
