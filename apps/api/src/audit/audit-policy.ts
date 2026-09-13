import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';

const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const channel = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const oneOf =
  (...values: string[]) =>
  (v: unknown) =>
    values.includes(v as string);
const fields: Record<string, (v: unknown) => boolean> = {
  revision: positive,
  sourceRevision: positive,
  profileId: (v) => typeof v === 'string' && v.length <= 160 && !!v.trim(),
  profileVersion: (v) => positive(v) && v <= 1_000_000,
  presetId: oneOf(
    'metered-switched-load',
    'pulsed-lock-bank',
    'guarded-enable-request',
    'generic-digital-output',
    'generic-monitored-input',
  ),
  channelId: channel,
  commandId: uuid,
  operation: oneOf('set', 'pulse'),
  result: oneOf('dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'),
};
const summaries = [
  'before.physicalPointCount',
  'before.logicalChannelCount',
  'after.physicalPointCount',
  'after.logicalChannelCount',
];
for (const key of summaries) fields[key] = (v) => Number.isSafeInteger(v) && (v as number) >= 0;

/** Explicit per-event schemas. Extending domains requires a reviewed policy, never arbitrary JSON. */
const policies: Record<string, readonly string[]> = {
  claim: [],
  unclaim: [],
  credential_rotation: [],
  manual_credential_fallback: [],
  publication: ['revision'],
  forced_publication: ['revision'],
  rollback: ['sourceRevision', 'revision'],
  rejection_acknowledgement: ['revision'],
  preset_application: ['presetId', 'channelId', ...summaries],
  preset_reapplication: ['presetId', 'channelId', ...summaries],
  profile_creation: ['profileId', 'profileVersion', ...summaries],
  profile_change: ['profileId', 'profileVersion', ...summaries],
  manual_command: ['channelId', 'commandId', 'operation', 'result'],
};
for (const action of [
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
]) {
  policies[`commissioning.${action}`] = [];
}
function dataFields(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length) return null;
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

/** Snapshot once before awaiting storage/settings. Never serialize caller objects or invoke their accessors. */
export function projectAuditEvent(input: unknown): (PluginAuditEvent & { pluginId: string }) | null {
  try {
    const event = dataFields(input, [
      'action',
      'operationId',
      'principal',
      'outcome',
      'subject',
      'details',
      'pluginId',
    ]);
    if (!event || typeof event.action !== 'string' || !event.action.startsWith('wago.')) return null;
    const action = event.action.slice(5);
    if (!Object.prototype.hasOwnProperty.call(policies, action)) return null;
    if (typeof event.pluginId !== 'string' || !/^[a-zA-Z0-9_-]{21}$/.test(event.pluginId) || !uuid(event.operationId))
      return null;
    const outcome = event.outcome;
    if (outcome !== 'attempted' && outcome !== 'succeeded' && outcome !== 'failed') return null;
    const principal = dataFields(event.principal, ['userId', 'authenticationMethod', 'apiTokenId']);
    if (!principal || !positive(principal.userId)) return null;
    const method = principal.authenticationMethod;
    if (method !== 'session' && method !== 'api-token') return null;
    const apiTokenId = principal.apiTokenId;
    if (method === 'api-token' ? !positive(apiTokenId) : apiTokenId !== undefined) return null;
    const subject = dataFields(event.subject, ['type', 'id']);
    const subjectType = action.startsWith('commissioning.') ? 'wago.commissioning' : 'wago.controller';
    if (!subject || !positive(subject.id) || subject.type !== subjectType) return null;
    const source = dataFields(event.details, policies[action]);
    if (!source) return null;
    const details: Record<string, string | number> = Object.create(null);
    for (const [key, value] of Object.entries(source)) {
      if ((typeof value !== 'string' && typeof value !== 'number') || !fields[key](value)) return null;
      details[key] = value;
    }
    if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
    return {
      pluginId: event.pluginId,
      action: event.action,
      operationId: event.operationId,
      outcome,
      principal: {
        userId: principal.userId,
        authenticationMethod: method,
        ...(method === 'api-token' && positive(apiTokenId) ? { apiTokenId } : {}),
      },
      subject: { type: subjectType, id: subject.id },
      details,
    };
  } catch {
    return null;
  }
}

export const AUDIT_ACTIONS = Object.keys(policies).map((action) => `wago.${action}`);

const ssoPolicies = {
  'provider.created': ['before', 'after'],
  'provider.updated': ['before', 'after'],
  'provider.deleted': ['before', 'after'],
  'provisioning.sessions_revoked': ['provider', 'changes'],
  'provisioning.user_deleted': ['provider', 'changes'],
  'provisioning.permissions_synced': ['provider', 'changes'],
} as const;

export type SsoAuditEvent = {
  action: `sso.${keyof typeof ssoPolicies}`;
  operationId: string;
  actorId: number;
  authenticationMethod: 'session' | 'api-token' | 'sso-provider';
  apiTokenId?: number;
  subject: { type: 'sso.provider' | 'user'; id: number };
  details: Record<string, string>;
};

/** Projects core SSO events through a closed schema so request data and credentials cannot leak into audit storage. */
export function projectSsoAuditEvent(input: unknown): SsoAuditEvent | null {
  try {
    const event = dataFields(input, ['action', 'operationId', 'actorId', 'authenticationMethod', 'apiTokenId', 'subject', 'details']);
    if (!event || typeof event.action !== 'string' || !event.action.startsWith('sso.') || !uuid(event.operationId)) return null;
    const action = event.action.slice(4) as keyof typeof ssoPolicies;
    const allowed = ssoPolicies[action];
    if (!allowed || !positive(event.actorId)) return null;
    const authenticationMethod = event.authenticationMethod;
    if (authenticationMethod !== 'session' && authenticationMethod !== 'api-token' && authenticationMethod !== 'sso-provider') return null;
    if (authenticationMethod === 'api-token' ? !positive(event.apiTokenId) : event.apiTokenId !== undefined) return null;
    const subject = dataFields(event.subject, ['type', 'id']);
    if (!subject || !positive(subject.id) || (subject.type !== 'sso.provider' && subject.type !== 'user')) return null;
    const source = dataFields(event.details, allowed);
    if (!source) return null;
    const details: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(source)) {
      if (typeof value !== 'string' || value.length > 1800) return null;
      details[key] = value;
    }
    if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
    return {
      action: event.action as SsoAuditEvent['action'],
      operationId: event.operationId,
      actorId: event.actorId,
      authenticationMethod,
      ...(authenticationMethod === 'api-token' ? { apiTokenId: event.apiTokenId as number } : {}),
      subject: { type: subject.type, id: subject.id },
      details,
    };
  } catch {
    return null;
  }
}

export const SSO_AUDIT_ACTIONS = Object.keys(ssoPolicies).map((action) => `sso.${action}`);
