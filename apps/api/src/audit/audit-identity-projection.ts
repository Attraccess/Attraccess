import { isIP } from 'node:net';
import { identityFields, identityPolicies } from './audit-identity-validation';
import { dataFields, positive, uuid } from './audit-projection';

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
