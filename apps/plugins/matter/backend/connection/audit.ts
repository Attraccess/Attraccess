import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';

const UUID_FIELD = { type: 'string', pattern: '[0-9a-f-]{36}' } as const;
const DECIMAL_ID_FIELD = { type: 'string', pattern: '[0-9]{1,20}' } as const;
const NODE_REF = { nodeRef: UUID_FIELD } as const;
const FABRIC_ID = { fabricId: DECIMAL_ID_FIELD } as const;
const NODE_ID = { nodeId: DECIMAL_ID_FIELD } as const;
const DETACHED_REASONS = ['absent_from_sidecar', 'fabric_mismatch', 'fabric_absent'] as const;
/**
 * Reconciliation entries: `system` when an automatic trigger ran it. Those entries carry the system principal as the
 * actor, never a user.
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
// Commissioning (ATT-1002). Closed sets and bounded IDs only: never a setup code, a sharing code, a certificate or any
// text the device or the sidecar sent. Finding types are the names of attestation findings (`PaaNotTrusted`, ...).
const SESSION_REF = { sessionRef: UUID_FIELD } as const;
const COMMISSIONING_STEPS = [
  'discovering',
  'pase',
  'reading_device',
  'attestation',
  'adding_fabric',
  'network_setup',
  'case',
  'interrogating',
  'completed',
] as const;
const COMMISSIONING_FAILURES = [
  'invalid_code',
  'device_not_found',
  'pase_failed',
  'attestation_failed',
  'already_commissioned',
  'fabric_full',
  'case_failed',
  'timeout',
  'cancelled',
  'interrupted',
  'internal',
  'needs_reconciliation',
  'registry_failed',
] as const;
const FINDINGS = { findings: { type: 'string', pattern: '[A-Za-z0-9_,]{0,512}', maxLength: 512 } } as const;
const INTERRUPT_REASONS = ['sidecar_restart', 'connection_lost', 'timeout', 'plugin_restart'] as const;
const REMOVAL_STATES = ['unclaimed', 'claimed', 'detached', 'archived'] as const;
const COMMISSIONING_ACTIONS = [
  {
    action: 'matter.commissioning_started',
    subjectTypes: ['matter.commissioning_session'],
    details: { ...SESSION_REF, attestationOverride: { type: 'boolean' } },
  },
  {
    action: 'matter.commissioning_failed',
    subjectTypes: ['matter.commissioning_session'],
    details: {
      ...SESSION_REF,
      failure: { type: 'string', oneOf: COMMISSIONING_FAILURES },
      step: { type: 'string', oneOf: COMMISSIONING_STEPS },
      ...FINDINGS,
      existingNodeId: DECIMAL_ID_FIELD,
    },
  },
  {
    action: 'matter.commissioning_interrupted',
    subjectTypes: ['matter.commissioning_session'],
    details: { ...SESSION_REF, reason: { type: 'string', oneOf: INTERRUPT_REASONS } },
  },
  { action: 'matter.commissioning_cancelled', subjectTypes: ['matter.commissioning_session'], details: SESSION_REF },
  {
    // The dangerous development override: the attempt went on although attestation failed.
    action: 'matter.commissioning_attestation_overridden',
    subjectTypes: ['matter.commissioning_session'],
    details: { ...SESSION_REF, ...FINDINGS },
  },
  {
    action: 'matter.node_commissioned',
    subjectTypes: ['matter.node'],
    details: {
      ...NODE_REF,
      ...FABRIC_ID,
      ...NODE_ID,
      ...SESSION_REF,
      attestation: { type: 'string', oneOf: ['verified', 'overridden'] },
    },
  },
  {
    action: 'matter.commissioning_finished',
    subjectTypes: ['matter.node'],
    details: {
      ...NODE_REF,
      ...SESSION_REF,
      nameSet: { type: 'boolean' },
      locationSet: { type: 'boolean' },
      endpointNames: { type: 'number', integer: true, min: 0, max: 256 },
    },
  },
  {
    action: 'matter.node_removed_from_fabric',
    subjectTypes: ['matter.node'],
    details: { ...NODE_REF, previousState: { type: 'string', oneOf: REMOVAL_STATES }, ...GENERATION },
  },
  {
    action: 'matter.node_force_removed_from_fabric',
    subjectTypes: ['matter.node'],
    details: { ...NODE_REF, previousState: { type: 'string', oneOf: REMOVAL_STATES }, ...GENERATION },
  },
  {
    action: 'matter.node_removal_failed',
    subjectTypes: ['matter.node'],
    details: {
      ...NODE_REF,
      mode: { type: 'string', oneOf: ['normal', 'force'] },
      reason: {
        type: 'string',
        oneOf: ['device_unreachable', 'timeout', 'busy', 'sidecar_unavailable', 'not_found', 'internal'],
      },
    },
  },
  {
    // The sharing code itself is never recorded: only that a window was opened, and for how long.
    action: 'matter.node_shared',
    subjectTypes: ['matter.node'],
    details: { ...NODE_REF, timeoutSec: { type: 'number', integer: true, min: 180, max: 900 } },
  },
  {
    action: 'matter.node_share_revoked',
    subjectTypes: ['matter.node'],
    details: { ...NODE_REF, closed: { type: 'boolean' } },
  },
  { action: 'matter.node_share_expired', subjectTypes: ['matter.node'], details: NODE_REF },
] as const satisfies PluginAuditDomainDeclaration['actions'];

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
    { action: 'matter.connection_reconnect_requested', subjectTypes: ['matter.connection'] },
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
    // backup contents and the sidecar's secrets never appear. A backup by the plugin itself is recorded with the
    // system principal. A restore's entries share its validation ID as their operation ID.
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
    // The encrypted file left the installation (ATT-1003). Never its content.
    { action: 'matter.backup_downloaded', subjectTypes: ['matter.backup'], details: { ...BACKUP_REF, ...GENERATION } },
    { action: 'matter.restore_cancelled', subjectTypes: ['matter.backup'], details: BACKUP_REF },
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
    ...COMMISSIONING_ACTIONS,
  ],
};
