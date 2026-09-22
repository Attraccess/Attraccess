import type { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { CompiledPluginAuditField, getPluginAuditDomain } from '../plugin-system/plugin-audit-registry';
import { AUDIT_DOMAIN_QUERY_PATTERN } from './audit-domains';
import { dataFields, positive, uuid, withinDetailsLimit } from './audit-projection';

export interface ProjectedPluginAuditEvent {
  domain: string;
  pluginId: string;
  action: string;
  operationId: string;
  outcome: 'attempted' | 'succeeded' | 'failed';
  actorId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: string;
  subjectId: number;
  details: Record<string, string | number | boolean>;
}

function matchesField(field: CompiledPluginAuditField, value: unknown): boolean {
  if (field.type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (field.integer && !Number.isSafeInteger(value)) return false;
    if (field.min !== undefined && value < field.min) return false;
    if (field.max !== undefined && value > field.max) return false;
    if (field.oneOf && !field.oneOf.has(value)) return false;
    return true;
  }
  if (typeof value !== 'string') return false;
  if (field.maxLength !== undefined && value.length > field.maxLength) return false;
  if (field.regex && !field.regex.test(value)) return false;
  if (field.oneOf && !field.oneOf.has(value)) return false;
  return true;
}

function pluginPrincipal(
  value: unknown,
): Pick<ProjectedPluginAuditEvent, 'actorId' | 'authenticationMethod' | 'apiTokenId'> | null {
  const principal = dataFields(value, ['userId', 'authenticationMethod', 'apiTokenId']);
  if (!principal || !positive(principal.userId)) return null;
  const method = principal.authenticationMethod;
  if (method !== 'session' && method !== 'api-token') return null;
  const apiTokenId = principal.apiTokenId;
  if (method === 'api-token' ? !positive(apiTokenId) : apiTokenId !== undefined) return null;
  return {
    actorId: principal.userId,
    authenticationMethod: method,
    ...(method === 'api-token' && positive(apiTokenId) ? { apiTokenId } : {}),
  };
}

/**
 * Projects an event recorded through a plugin's PluginAuditContext against the
 * domain declaration that plugin registered at load time. The host never names
 * a plugin domain: an event is admitted only when its action prefix resolves to
 * a registered domain owned by the recording plugin, the action and subject
 * type are declared, and every detail field passes its declared policy.
 * Anything else — including plugin events for domains registered by another
 * plugin — is rejected without touching storage.
 */
export function projectPluginAuditEvent(input: unknown): ProjectedPluginAuditEvent | null {
  try {
    const event = dataFields(input as Partial<PluginAuditEvent> & { pluginId: string }, [
      'action',
      'operationId',
      'principal',
      'outcome',
      'subject',
      'details',
      'pluginId',
    ]) as (Partial<PluginAuditEvent> & { pluginId?: string }) | null;
    if (!event) return null;
    if (typeof event.pluginId !== 'string' || !/^[a-zA-Z0-9_-]{21}$/.test(event.pluginId)) return null;
    if (typeof event.action !== 'string' || !uuid(event.operationId)) return null;
    const separator = event.action.indexOf('.');
    if (separator < 1) return null;
    const domain = event.action.slice(0, separator);
    if (!AUDIT_DOMAIN_QUERY_PATTERN.test(domain)) return null;
    const registered = getPluginAuditDomain(domain);
    if (!registered || registered.pluginId !== event.pluginId) return null;
    const policy = registered.actions.get(event.action);
    if (!policy) return null;
    const outcome = event.outcome;
    if (outcome !== 'attempted' && outcome !== 'succeeded' && outcome !== 'failed') return null;
    const principal = pluginPrincipal(event.principal);
    if (!principal) return null;
    const subject = dataFields(event.subject, ['type', 'id']);
    if (!subject || !positive(subject.id) || typeof subject.type !== 'string') return null;
    if (!policy.subjectTypes.has(subject.type)) return null;
    const source = dataFields(event.details, [...policy.fields.keys()]);
    if (!source) return null;
    const details: Record<string, string | number | boolean> = Object.create(null);
    for (const [key, value] of Object.entries(source)) {
      const field = policy.fields.get(key);
      if (!field || !matchesField(field, value)) return null;
      details[key] = value as string | number | boolean;
    }
    if (!withinDetailsLimit(details)) return null;
    return {
      domain: registered.domain,
      pluginId: event.pluginId,
      action: event.action,
      operationId: event.operationId,
      outcome,
      ...principal,
      subjectType: subject.type,
      subjectId: subject.id,
      details,
    };
  } catch {
    return null;
  }
}
