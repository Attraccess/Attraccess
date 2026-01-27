import '@attraccess/database-entities';

declare module '@attraccess/database-entities' {
  interface SSOProviderSAMLConfiguration {
    provisioningSecret?: string | null;
  }
}
