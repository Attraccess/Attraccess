import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';

export const MATTER_AUDIT_DOMAIN: PluginAuditDomainDeclaration = {
  domain: 'matter',
  labels: { en: 'Matter', de: 'Matter' },
  actions: [
    {
      action: 'matter.connection_saved',
      subjectTypes: ['matter.connection'],
      // Flags and a scheme only: never the URL, the credential or the certificate.
      details: {
        credentialChanged: { type: 'boolean' },
        caChanged: { type: 'boolean' },
        scheme: { type: 'string', oneOf: ['http', 'https'] },
      },
    },
    { action: 'matter.connection_removed', subjectTypes: ['matter.connection'] },
  ],
};
