import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { isIP } from 'node:net';

export interface ResourceAuditEvent {
  action:
    | 'maintenance_schedule.created'
    | 'maintenance_schedule.updated'
    | 'maintenance_schedule.deleted'
    | 'supervision.approved'
    | 'supervision.rejected';
  operationId: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectId: number;
  details: Record<string, string | number>;
}

export interface AttractapAuditEvent {
  action: 'reader.registered' | 'reader.deregistered' | 'card.linked' | 'card.unlinked' | 'reader.crash_reported';
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId?: number;
  subjectId: number;
  details: Record<string, string | number | boolean>;
}

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

const resourceActions = new Set<ResourceAuditEvent['action']>([
  'maintenance_schedule.created',
  'maintenance_schedule.updated',
  'maintenance_schedule.deleted',
  'supervision.approved',
  'supervision.rejected',
]);
const resourceDetailFields = new Set([
  'scheduleId',
  'enabled',
  'triggerType',
  'name',
  'usageDuration',
  'usageUnit',
  'usageThreshold',
  'requesterUserId',
  'supervisorUserId',
  'requestId',
]);

const attractapDetails: Record<AttractapAuditEvent['action'], ReadonlySet<string>> = {
  'reader.registered': new Set(['source']),
  'reader.deregistered': new Set(['source']),
  'card.linked': new Set(['readerId', 'source']),
  'card.unlinked': new Set(['readerId', 'source']),
  'reader.crash_reported': new Set(['source', 'resetReason', 'hasCoredump']),
};
const attractapResetReasons = new Set([
  'POWERON', 'EXT', 'SW', 'PANIC', 'INT_WDT', 'TASK_WDT', 'WDT', 'DEEPSLEEP', 'BROWNOUT', 'SDIO', 'UNKNOWN',
]);

export function projectAttractapAuditEvent(input: AttractapAuditEvent): AttractapAuditEvent | null {
  if (!positive(input.subjectId) || !attractapDetails[input.action]) return null;
  const deviceActor = input.authenticationMethod === null;
  if (deviceActor ? input.actorId !== null || input.apiTokenId !== undefined : !positive(input.actorId)) return null;
  if (
    !deviceActor &&
    input.authenticationMethod !== 'session' &&
    input.authenticationMethod !== 'api-token'
  ) return null;
  if (input.authenticationMethod === 'api-token' ? !positive(input.apiTokenId) : input.apiTokenId !== undefined) return null;
  const details = dataFields(input.details, [...attractapDetails[input.action]]);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (!attractapDetails[input.action].has(key) || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) return null;
    if (key === 'source' && !oneOf('reader-websocket', 'admin-api', 'reader-enrollment', 'reader-reset')(value)) return null;
    if (key === 'resetReason' && !attractapResetReasons.has(value as string)) return null;
    if (key === 'hasCoredump' && typeof value !== 'boolean') return null;
    if (key === 'readerId' && !positive(value)) return null;
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  return { ...input, details: details as Record<string, string | number | boolean> };
}

export function projectResourceAuditEvent(input: ResourceAuditEvent): ResourceAuditEvent | null {
  if (
    !resourceActions.has(input.action) ||
    !uuid(input.operationId) ||
    !positive(input.actorId) ||
    !positive(input.subjectId)
  ) {
    return null;
  }
  const details = dataFields(input.details, [...resourceDetailFields]);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (!resourceDetailFields.has(key) || (typeof value !== 'string' && typeof value !== 'number')) return null;
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  if (
    (input.authenticationMethod !== undefined &&
      input.authenticationMethod !== 'session' &&
      input.authenticationMethod !== 'api-token') ||
    (input.apiTokenId !== undefined && !positive(input.apiTokenId))
  ) {
    return null;
  }
  return { ...input, details: details as Record<string, string | number> };
}

const identityPolicies = {
  login: ['reason'],
  logout: [],
  registration: ['reason'],
  password_reset_requested: ['reason'],
  password_reset_completed: ['reason'],
  two_factor_setup_started: [],
  two_factor_enabled: [],
  two_factor_disabled: [],
  passkey_created: [],
  passkey_renamed: [],
  passkey_deleted: [],
  sso_login: ['providerId', 'reason'],
  user_created: [],
  user_updated: ['field'],
  user_deleted: [],
  user_role_assigned: ['role'],
  user_role_removed: ['role'],
  role_created: ['role'],
  role_updated: ['role'],
  role_deleted: ['role'],
  password_policy_updated: ['before', 'after', 'field'],
  password_policy_override_updated: ['role', 'before', 'after', 'field'],
  password_policy_override_deleted: ['role', 'before'],
} as const satisfies Record<string, readonly string[]>;

const identityFields: Record<string, (value: unknown) => boolean> = {
  reason: oneOf(
    'invalid_credentials',
    'account_locked',
    'rate_limited',
    'two_factor_required',
    'two_factor_invalid',
    'email_not_verified',
    'invalid_token',
    'invalid_input',
    'unknown_user',
    'dependency_failure',
  ),
  providerId: positive,
  // RbacService truncates normalized names after joining parts, which can leave a trailing hyphen.
  role: (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value),
  field: oneOf(
    'username',
    'email',
    'password',
    'billingFactor',
    'isEmailVerified',
    'isActive',
    'role',
    'minLength',
    'maxLength',
    'allowAllUnicode',
    'requireLowercase',
    'requireUppercase',
    'requireDigit',
    'requireNumber',
    'requireSpecial',
    'checkHIBP',
    'checkCommonPasswords',
    'minZxcvbnScore',
    'historySize',
    'rotationDays',
    'zxcvbnMinScore',
    'historyCount',
  ),
  before: policySnapshot,
  after: policySnapshot,
};

function policySnapshot(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const snapshot = JSON.parse(value);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    return Object.entries(snapshot).every(([key, entry]) => policySnapshotFields[key]?.(entry) === true);
  } catch {
    return false;
  }
}

const nullable = (validate: (value: unknown) => boolean) => (value: unknown) => value === null || validate(value);
const integerBetween = (minimum: number, maximum: number) =>
  (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const policySnapshotFields: Record<string, (value: unknown) => boolean> = {
  role: (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
  minLength: nullable(integerBetween(8, 1024)),
  maxLength: nullable(integerBetween(8, 1024)),
  allowAllUnicode: nullable((value) => typeof value === 'boolean'),
  requireUppercase: nullable((value) => typeof value === 'boolean'),
  requireLowercase: nullable((value) => typeof value === 'boolean'),
  requireDigit: nullable((value) => typeof value === 'boolean'),
  requireSpecial: nullable((value) => typeof value === 'boolean'),
  checkHIBP: nullable((value) => typeof value === 'boolean'),
  checkCommonPasswords: nullable((value) => typeof value === 'boolean'),
  minZxcvbnScore: nullable(integerBetween(0, 4)),
  historySize: nullable(integerBetween(0, 50)),
  rotationDays: nullable(integerBetween(0, 3650)),
};

export type IdentityAuditAction = keyof typeof identityPolicies;

export interface IdentityAuditEvent {
  action: IdentityAuditAction;
  operationId: string;
  outcome: 'attempted' | 'succeeded' | 'failed';
  actorId?: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType?: 'identity.user' | 'identity.role' | 'identity.password_policy';
  subjectId?: number;
  details: Record<string, unknown>;
  request?: { ipAddress?: string; userAgent?: string };
}

export interface ProjectedIdentityAuditEvent {
  action: `identity.${IdentityAuditAction}`;
  operationId: string;
  outcome: IdentityAuditEvent['outcome'];
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId: number | null;
  subjectType: NonNullable<IdentityAuditEvent['subjectType']>;
  subjectId: number | null;
  details: Record<string, string | number | boolean | null>;
  ipAddress: string | null;
  userAgent: string | null;
}

const ipAddress = (value: unknown) => typeof value === 'string' && value.length <= 45 && isIP(value) !== 0;
const userAgent = (value: unknown) => typeof value === 'string' && value.length <= 512 && !/[\r\n]/.test(value);

/** Closed identity event schema. Request metadata is copied separately from event details. */
export function projectIdentityAuditEvent(input: unknown): ProjectedIdentityAuditEvent | null {
  try {
    const event = dataFields(input, [
      'action',
      'operationId',
      'outcome',
      'actorId',
      'authenticationMethod',
      'apiTokenId',
      'subjectType',
      'subjectId',
      'details',
      'request',
    ]);
    if (
      !event ||
      typeof event.action !== 'string' ||
      !Object.prototype.hasOwnProperty.call(identityPolicies, event.action)
    )
      return null;
    const action = event.action as IdentityAuditAction;
    if (!uuid(event.operationId) || !['attempted', 'succeeded', 'failed'].includes(event.outcome as string))
      return null;
    if (event.actorId !== undefined && !positive(event.actorId)) return null;
    const authenticationMethod = event.authenticationMethod;
    const apiTokenId = event.apiTokenId;
    if (
      (authenticationMethod !== undefined &&
        authenticationMethod !== 'session' &&
        authenticationMethod !== 'api-token') ||
      (apiTokenId !== undefined && !positive(apiTokenId)) ||
      (authenticationMethod === 'api-token' && !positive(apiTokenId)) ||
      (authenticationMethod !== 'api-token' && apiTokenId !== undefined)
    )
      return null;
    if (
      event.subjectType !== undefined &&
      !['identity.user', 'identity.role', 'identity.password_policy'].includes(event.subjectType as string)
    )
      return null;
    if (event.subjectId !== undefined && !positive(event.subjectId)) return null;
    const source = dataFields(event.details, identityPolicies[action]);
    if (!source) return null;
    const details: Record<string, string | number | boolean | null> = Object.create(null);
    for (const [key, value] of Object.entries(source)) {
      if (!identityFields[key](value)) return null;
      details[key] = value as string | number | boolean | null;
    }
    const request =
      event.request === undefined ? Object.create(null) : dataFields(event.request, ['ipAddress', 'userAgent']);
    // Request metadata is client-controlled and optional; a bad header must not suppress the audit event.
    const ip =
      request && typeof request.ipAddress === 'string' && ipAddress(request.ipAddress) ? request.ipAddress : null;
    const agent =
      request && typeof request.userAgent === 'string' ? request.userAgent.replace(/[\r\n]/g, '').slice(0, 512) : null;
    if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
    return {
      action: `identity.${action}`,
      operationId: event.operationId,
      outcome: event.outcome as IdentityAuditEvent['outcome'],
      actorId: (event.actorId as number | undefined) ?? null,
      authenticationMethod: (authenticationMethod as 'session' | 'api-token' | undefined) ?? null,
      apiTokenId: (apiTokenId as number | undefined) ?? null,
      subjectType: (event.subjectType as IdentityAuditEvent['subjectType'] | undefined) ?? 'identity.user',
      subjectId: (event.subjectId as number | undefined) ?? null,
      details,
      ipAddress: ip,
      userAgent: agent !== null && userAgent(agent) ? agent : null,
    };
  } catch {
    return null;
  }
}

export const IDENTITY_AUDIT_ACTIONS = Object.keys(identityPolicies).map((action) => `identity.${action}`);

export const ATTRACTAP_AUDIT_ACTIONS = [
  'attractap.reader.registered',
  'attractap.reader.deregistered',
  'attractap.card.linked',
  'attractap.card.unlinked',
  'attractap.reader.crash_reported',
];
