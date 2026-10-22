import '@attraccess/database-entities';

declare module '@attraccess/database-entities' {
  interface SSOProviderSAMLConfiguration {
    provisioningSecret?: string | null;
  }
}

import '@attraccess/application-models';

declare module '@attraccess/application-models' {
  interface SSOProviderSAMLConfiguration {
    provisioningSecret?: string | null;
  }
}
