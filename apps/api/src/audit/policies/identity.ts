import { isIP } from 'node:net';
import { dataFields, positive, uuid, oneOf } from './projection';

export const identityPolicies = {
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

export const identityFields: Record<string, (value: unknown) => boolean> = {
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

export function policySnapshot(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const snapshot = JSON.parse(value);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    return Object.entries(snapshot).every(([key, entry]) => policySnapshotFields[key]?.(entry) === true);
  } catch {
    return false;
  }
}

export const nullable = (validate: (value: unknown) => boolean) => (value: unknown) =>
  value === null || validate(value);

export const integerBetween = (minimum: number, maximum: number) => (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export const policySnapshotFields: Record<string, (value: unknown) => boolean> = {
  role: (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value),
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
export const ipAddress = (value: unknown) => typeof value === 'string' && value.length <= 45 && isIP(value) !== 0;
export const userAgent = (value: unknown) => typeof value === 'string' && value.length <= 512 && !/[\r\n]/.test(value);
export function identityRequestMetadata(value: unknown): Pick<ProjectedIdentityAuditEvent, 'ipAddress' | 'userAgent'> {
  const request = value === undefined ? Object.create(null) : dataFields(value, ['ipAddress', 'userAgent']);
  // Request metadata is client-controlled and optional; a bad header must not suppress the audit event.
  const ip =
    request && typeof request.ipAddress === 'string' && ipAddress(request.ipAddress) ? request.ipAddress : null;
  const agent =
    request && typeof request.userAgent === 'string' ? request.userAgent.replace(/[\r\n]/g, '').slice(0, 512) : null;
  return { ipAddress: ip, userAgent: agent !== null && userAgent(agent) ? agent : null };
}
export function validIdentityPrincipal(event: Record<string, unknown>): boolean {
  if (event.actorId !== undefined && !positive(event.actorId)) return false;
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
    return false;
  return true;
}

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
    if (!validIdentityPrincipal(event)) return null;
    const authenticationMethod = event.authenticationMethod;
    const apiTokenId = event.apiTokenId;
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
      ...identityRequestMetadata(event.request),
    };
  } catch {
    return null;
  }
}

export const IDENTITY_AUDIT_ACTIONS = Object.keys(identityPolicies).map((action) => `identity.${action}`);
