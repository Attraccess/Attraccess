import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';

const UUID_FIELD = { type: 'string', pattern: '[0-9a-f-]{36}' } as const;
const DECIMAL_ID_FIELD = { type: 'string', pattern: '[0-9]{1,20}' } as const;
const NODE_REF = { nodeRef: UUID_FIELD } as const;
const FABRIC_ID = { fabricId: DECIMAL_ID_FIELD } as const;
const NODE_ID = { nodeId: DECIMAL_ID_FIELD } as const;
const DETACHED_REASONS = ['absent_from_sidecar', 'fabric_mismatch', 'fabric_absent'] as const;
const METADATA_FLAGS = {
  displayNameChanged: { type: 'boolean' },
  descriptionChanged: { type: 'boolean' },
  locationChanged: { type: 'boolean' },
} as const;

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
    // Device model (ATT-996). Subject IDs are numeric (a host rule), so the plugin UUID travels in `nodeRef` /
    // `endpointRef` / `fabricRef`. Details are bounded IDs, enums and flags: never device free text.
    {
      action: 'matter.node_quarantined',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, ...FABRIC_ID, ...NODE_ID },
    },
    {
      action: 'matter.node_detached',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, ...NODE_ID, reason: { type: 'string', oneOf: DETACHED_REASONS } },
    },
    {
      action: 'matter.node_reattached',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, ...NODE_ID, resultingState: { type: 'string', oneOf: ['claimed', 'unclaimed'] } },
    },
    {
      action: 'matter.node_claimed',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, nameSet: { type: 'boolean' } },
    },
    {
      action: 'matter.node_relinked',
      subjectTypes: ['matter.node'],
      details: {
        ...NODE_REF,
        sourceNodeRef: UUID_FIELD,
        identityMismatchConfirmed: { type: 'boolean' },
      },
    },
    {
      action: 'matter.node_repaired',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, reattached: { type: 'boolean' } },
    },
    {
      action: 'matter.node_archived',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, previousState: { type: 'string', oneOf: ['detached', 'unclaimed'] } },
    },
    { action: 'matter.node_restored', subjectTypes: ['matter.node'], details: { ...NODE_REF } },
    {
      action: 'matter.node_force_removed',
      subjectTypes: ['matter.node'],
      details: {
        ...NODE_REF,
        previousState: { type: 'string', oneOf: ['unclaimed', 'claimed', 'detached', 'archived'] },
      },
    },
    {
      action: 'matter.node_metadata_updated',
      subjectTypes: ['matter.node'],
      details: { ...NODE_REF, ...METADATA_FLAGS },
    },
    {
      action: 'matter.endpoint_metadata_updated',
      subjectTypes: ['matter.endpoint'],
      details: {
        endpointRef: UUID_FIELD,
        endpointId: { type: 'number', integer: true, min: 0, max: 65534 },
        ...METADATA_FLAGS,
      },
    },
    {
      action: 'matter.fabric_mismatch_detected',
      subjectTypes: ['matter.fabric'],
      details: {
        fabricRef: UUID_FIELD,
        previousFabricId: DECIMAL_ID_FIELD,
        detachedNodes: { type: 'number', integer: true, min: 0 },
        quarantinedNodes: { type: 'number', integer: true, min: 0 },
      },
    },
  ],
};
