import type { PluginAuditActionPolicy, PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { WAGO_PRESETS } from './configuration';

/**
 * The WAGO plugin's own audit policy, registered with the host at plugin load
 * through `PluginBackendModule.auditDomains`. The host enforces this declaration
 * on every event recorded through the plugin audit context: only the actions,
 * subject types and detail fields declared here can ever reach the audit log.
 *
 * Details carry validated domain identifiers only — no names, values, snapshots
 * or error text (see wago-audit.ts for the emitting side).
 */

const summaryFields = {
  'before.physicalPointCount': { type: 'number', integer: true, min: 0 },
  'before.logicalChannelCount': { type: 'number', integer: true, min: 0 },
  'after.physicalPointCount': { type: 'number', integer: true, min: 0 },
  'after.logicalChannelCount': { type: 'number', integer: true, min: 0 },
} as const;

const revision = { type: 'number', integer: true, min: 1 } as const;
const channelId = { type: 'string', pattern: '[a-zA-Z0-9_-]{1,64}' } as const;
const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const controllerActions: PluginAuditActionPolicy[] = [
  { action: 'wago.claim', subjectTypes: ['wago.controller'] },
  { action: 'wago.unclaim', subjectTypes: ['wago.controller'] },
  { action: 'wago.credential_rotation', subjectTypes: ['wago.controller'] },
  { action: 'wago.manual_credential_fallback', subjectTypes: ['wago.controller'] },
  { action: 'wago.publication', subjectTypes: ['wago.controller'], details: { revision } },
  { action: 'wago.forced_publication', subjectTypes: ['wago.controller'], details: { revision } },
  {
    action: 'wago.rollback',
    subjectTypes: ['wago.controller'],
    details: { sourceRevision: revision, revision },
  },
  { action: 'wago.rejection_acknowledgement', subjectTypes: ['wago.controller'], details: { revision } },
  {
    action: 'wago.preset_application',
    subjectTypes: ['wago.controller'],
    details: {
      presetId: { type: 'string', oneOf: WAGO_PRESETS.map((preset) => preset.id) },
      channelId,
      ...summaryFields,
    },
  },
  {
    action: 'wago.preset_reapplication',
    subjectTypes: ['wago.controller'],
    details: {
      presetId: { type: 'string', oneOf: WAGO_PRESETS.map((preset) => preset.id) },
      channelId,
      ...summaryFields,
    },
  },
  {
    action: 'wago.profile_creation',
    subjectTypes: ['wago.controller'],
    details: {
      profileId: { type: 'string', maxLength: 160, pattern: '(?=[\\s\\S]*\\S)[\\s\\S]*' },
      profileVersion: { type: 'number', integer: true, min: 1, max: 1_000_000 },
      ...summaryFields,
    },
  },
  {
    action: 'wago.profile_change',
    subjectTypes: ['wago.controller'],
    details: {
      profileId: { type: 'string', maxLength: 160, pattern: '(?=[\\s\\S]*\\S)[\\s\\S]*' },
      profileVersion: { type: 'number', integer: true, min: 1, max: 1_000_000 },
      ...summaryFields,
    },
  },
  {
    action: 'wago.manual_command',
    subjectTypes: ['wago.controller'],
    details: {
      channelId,
      commandId: { type: 'string', pattern: uuidPattern },
      operation: { type: 'string', oneOf: ['set', 'pulse'] },
      result: { type: 'string', oneOf: ['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'] },
    },
  },
];

const commissioningActions: PluginAuditActionPolicy[] = [
  'install',
  'recover',
  'security_inspect',
  'security_review',
  'security_apply',
  'security_recover',
  'platform_inspect',
  'platform_activate',
  'platform_recover',
  'lease_recover',
].map((action) => ({ action: `wago.commissioning.${action}`, subjectTypes: ['wago.commissioning'] }));

export const WAGO_AUDIT_DOMAIN: PluginAuditDomainDeclaration = {
  domain: 'wago',
  labels: { en: 'WAGO controllers', de: 'WAGO-Controller' },
  actions: [...controllerActions, ...commissioningActions],
};
