import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';

const UUID_FIELD = { type: 'string', pattern: '[0-9a-f-]{36}' } as const;
const DECIMAL_ID_FIELD = { type: 'string', pattern: '[0-9]{1,20}' } as const;
const NODE_REF = { nodeRef: UUID_FIELD } as const;
const FABRIC_ID = { fabricId: DECIMAL_ID_FIELD } as const;
const NODE_ID = { nodeId: DECIMAL_ID_FIELD } as const;
const DETACHED_REASONS = ['absent_from_sidecar', 'fabric_mismatch', 'fabric_absent'] as const;
/**
 * Reconciliation entries: `system` when an automatic trigger ran it. The host has no system principal for plugins, so
 * those entries carry the administrator who last saved the connection settings as the actor.
 */
const INITIATOR = { initiator: { type: 'string', oneOf: ['system', 'administrator'] } } as const;
const KEY_ID_FIELD = { keyId: { type: 'string', pattern: '[0-9a-f-]{16}' } } as const;
const BACKUP_REF = { backupRef: UUID_FIELD } as const;
const GENERATION = { fabricGeneration: { type: 'number', integer: true, min: 0 } } as const;
const BACKUP_TRIGGERS = ['manual', 'fabric_created', 'restore', 'daily', 'fabric_changed', 'pre_restore'] as const;
// Closed sets of non-secret reason codes: never a message, never anything the sidecar or a file said.
const BACKUP_FAILURES = [
  'inconsistent',
  'sidecar_unavailable',
  'sidecar_busy',
  'insecure_transport',
  'no_recovery_key',
  'recovery_key_unreadable',
  'recovery_required',
  'no_fabric',
  'sidecar_error',
  'internal',
] as const;
const RESTORE_REFUSALS = [
  'key_required',
  'wrong_key',
  'corrupt',
  'truncated',
  'incompatible_format',
  'incompatible_schema',
  'incompatible_migration',
  'incompatible_version',
  'stage_failed',
  'insecure_transport',
  'sidecar_unavailable',
  'confirmation_required',
  'preflight_changed',
  'pre_restore_backup_failed',
  'validation_expired',
  'busy',
] as const;
const RESTORE_KINDS = ['plain', 'rollback', 'replacement'] as const;
const MISMATCHES = [
  'sidecar_uninitialized',
  'fabric_changed',
  'generation_behind',
  'generation_ahead',
  'storage_instance_changed',
  'sidecar_recovery_required',
] as const;
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
      details: { ...NODE_REF, ...FABRIC_ID, ...NODE_ID, ...INITIATOR },
    },
    {
      action: 'matter.node_detached',
      subjectTypes: ['matter.node'],
      details: {
        ...NODE_REF,
        ...FABRIC_ID,
        ...NODE_ID,
        reason: { type: 'string', oneOf: DETACHED_REASONS },
        ...INITIATOR,
      },
    },
    {
      action: 'matter.node_reattached',
      subjectTypes: ['matter.node'],
      details: {
        ...NODE_REF,
        ...FABRIC_ID,
        ...NODE_ID,
        resultingState: { type: 'string', oneOf: ['claimed', 'unclaimed'] },
        ...INITIATOR,
      },
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
        ...INITIATOR,
      },
    },
    // Fabric persistence and encrypted backups (ATT-998). Fabric ID and key ID are public identifiers; recovery keys,
    // backup contents and the sidecar's secrets never appear. A backup or restore by the plugin itself has no
    // administrator and is attributed like the other system actions.
    {
      action: 'matter.fabric_created',
      subjectTypes: ['matter.fabric'],
      details: { fabricRef: UUID_FIELD, ...FABRIC_ID, recoveryKeyCreated: { type: 'boolean' } },
    },
    {
      action: 'matter.recovery_key_generated',
      subjectTypes: ['matter.recovery_key'],
      // `source: 'restore'`: the key a disaster-recovery restore was made with, kept on an installation without one.
      details: { ...KEY_ID_FIELD, source: { type: 'string', oneOf: ['restore'] } },
    },
    { action: 'matter.recovery_key_acknowledged', subjectTypes: ['matter.recovery_key'], details: KEY_ID_FIELD },
    {
      action: 'matter.recovery_key_rotated',
      subjectTypes: ['matter.recovery_key'],
      details: { ...KEY_ID_FIELD, previousKeyId: KEY_ID_FIELD.keyId },
    },
    {
      action: 'matter.backup_succeeded',
      subjectTypes: ['matter.backup'],
      details: {
        ...BACKUP_REF,
        trigger: { type: 'string', oneOf: BACKUP_TRIGGERS },
        ...GENERATION,
        system: { type: 'boolean' },
      },
    },
    {
      action: 'matter.backup_failed',
      subjectTypes: ['matter.backup'],
      details: {
        ...BACKUP_REF,
        trigger: { type: 'string', oneOf: BACKUP_TRIGGERS },
        reason: { type: 'string', oneOf: BACKUP_FAILURES },
        system: { type: 'boolean' },
      },
    },
    {
      action: 'matter.restore_validated',
      subjectTypes: ['matter.backup'],
      details: { ...BACKUP_REF, ...GENERATION, kind: { type: 'string', oneOf: RESTORE_KINDS } },
    },
    {
      action: 'matter.restore_refused',
      subjectTypes: ['matter.backup'],
      details: { ...BACKUP_REF, reason: { type: 'string', oneOf: RESTORE_REFUSALS } },
    },
    {
      action: 'matter.restore_confirmed',
      subjectTypes: ['matter.backup'],
      details: {
        ...BACKUP_REF,
        kind: { type: 'string', oneOf: RESTORE_KINDS },
        typedConfirmation: { type: 'boolean' },
        preRestoreBackup: { type: 'boolean' },
      },
    },
    {
      action: 'matter.restore_succeeded',
      subjectTypes: ['matter.backup'],
      details: { ...BACKUP_REF, ...GENERATION },
    },
    { action: 'matter.restore_failed', subjectTypes: ['matter.backup'], details: BACKUP_REF },
    { action: 'matter.restore_rolled_back', subjectTypes: ['matter.backup'], details: BACKUP_REF },
    {
      action: 'matter.fabric_recovery_required',
      subjectTypes: ['matter.fabric'],
      details: { fabricRef: UUID_FIELD, mismatch: { type: 'string', oneOf: MISMATCHES } },
    },
    {
      action: 'matter.recovery_action_chosen',
      subjectTypes: ['matter.fabric'],
      details: { fabricRef: UUID_FIELD, choice: { type: 'string', oneOf: ['accept_sidecar', 'start_new', 'restore'] } },
    },
  ],
};
