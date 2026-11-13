import type { AuditLog } from '@attraccess/database-entities';
import { randomUUID } from 'crypto';
import { getPluginAuditDomain } from '../../plugin-system/audit/audit-registry';
import { projectAdministrationAuditEvent } from '../policies/administration';
import { AttractapAuditAction, projectAttractapAuditEvent } from '../policies/attractap';
import { validBillingAuditEvent } from '../policies/billing';
import { CORE_AUDIT_DOMAINS, CoreAuditDomain } from '../policies/domains';
import { IdentityAuditAction, projectIdentityAuditEvent } from '../policies/identity';
import { projectPluginAuditEvent } from '../policies/plugins';
import { projectProjectAuditEvent } from '../policies/projects';
import { projectResourceAuditEvent } from '../policies/resources';
import { projectSsoAuditEvent } from '../policies/sso';
import { dataFields } from '../policies/projection';
import type { AuditEvent } from './audit-event';

export type AuditRow = Omit<AuditLog, 'id' | 'at'>;

type CoreEvent<D extends CoreAuditDomain> = AuditEvent<D> & { operationId: string };

const OMITTED_METHOD_DEFAULTS: Partial<Record<CoreAuditDomain, (actorId: unknown) => 'session' | null>> = {
  resource: (actorId) => (actorId === null ? null : 'session'),
  project: () => 'session',
  administration: () => 'session',
  identity: () => null,
};

const isCoreDomain = (domain: unknown): domain is CoreAuditDomain =>
  (CORE_AUDIT_DOMAINS as readonly unknown[]).includes(domain);

/** The metrics label of a dropped event: a core or registered plugin domain, otherwise unknown. */
export function auditDomainLabel(event: unknown): string | undefined {
  const domain = (event as { domain?: unknown } | null)?.domain;
  if (isCoreDomain(domain)) return domain;
  return typeof domain === 'string' && getPluginAuditDomain(domain) ? domain : undefined;
}

/**
 * Validates one envelope against its domain policy and builds the stored row. Returns null for an event the
 * policy rejects. Stored values (pluginId, prefixes, defaults) match what each domain recorded before the envelope.
 */
export function projectAuditRow(input: AuditEvent): AuditRow | null {
  const event = dataFields(input, [
    'domain',
    'action',
    'operationId',
    'actor',
    'subject',
    'outcome',
    'request',
    'details',
  ]) as unknown as AuditEvent | null;
  const actor = dataFields(event?.actor, ['id', 'authenticationMethod', 'apiTokenId']);
  const subject = dataFields(event?.subject, ['type', 'id']);
  if (!event || !actor || !subject || typeof event.action !== 'string') return null;
  if (event.outcome !== undefined && !['attempted', 'succeeded', 'failed'].includes(event.outcome)) return null;
  // An omitted method gets the default each domain applied before the envelope, so stored rows stay the same:
  // a session for resource (with an actor), project and administration; none for identity.
  if (
    actor.authenticationMethod === undefined &&
    (actor.apiTokenId ?? null) === null &&
    event.domain in OMITTED_METHOD_DEFAULTS
  )
    actor.authenticationMethod = OMITTED_METHOD_DEFAULTS[event.domain as CoreAuditDomain]?.(actor.id ?? null);
  const normalized = {
    ...event,
    operationId: event.operationId ?? randomUUID(),
    actor: actor as unknown as AuditEvent['actor'],
    subject: subject as unknown as AuditEvent['subject'],
  } as AuditEvent & { operationId: string };
  if (!isCoreDomain(event.domain)) return pluginRow(normalized);
  // Domains without an outcome vocabulary record successful changes only.
  if (!['identity', 'administration'].includes(event.domain) && (event.outcome ?? 'succeeded') !== 'succeeded')
    return null;
  const project = coreRows[event.domain] as (event: CoreEvent<CoreAuditDomain>) => AuditRow | null;
  return project(normalized as CoreEvent<CoreAuditDomain>);
}

const base = (event: CoreEvent<CoreAuditDomain>) => ({
  operationId: event.operationId,
  actorId: event.actor.id,
  authenticationMethod: event.actor.authenticationMethod,
  apiTokenId: event.actor.apiTokenId ?? null,
  outcome: event.outcome ?? ('succeeded' as const),
  ipAddress: null,
  userAgent: null,
});

const tokenId = (event: AuditEvent) => event.actor.apiTokenId ?? undefined;

const coreRows: { [D in CoreAuditDomain]: (event: CoreEvent<D>) => AuditRow | null } = {
  sso(event) {
    const apiTokenId = tokenId(event);
    const snapshot = projectSsoAuditEvent({
      action: event.action,
      operationId: event.operationId,
      actorId: event.actor.id,
      authenticationMethod: event.actor.authenticationMethod,
      ...(apiTokenId === undefined ? {} : { apiTokenId }),
      subject: event.subject,
      details: event.details,
    });
    if (!snapshot) return null;
    return {
      ...base(event),
      domain: 'sso',
      pluginId: null,
      action: snapshot.action,
      subjectType: snapshot.subject.type,
      subjectId: snapshot.subject.id,
      details: snapshot.details,
    };
  },

  identity(event) {
    const subjectId = event.subject.id ?? undefined;
    const snapshot = projectIdentityAuditEvent({
      action: event.action.slice('identity.'.length) as IdentityAuditAction,
      operationId: event.operationId,
      outcome: event.outcome ?? 'succeeded',
      ...(event.actor.id === null ? {} : { actorId: event.actor.id }),
      ...(event.actor.authenticationMethod === null ? {} : { authenticationMethod: event.actor.authenticationMethod }),
      ...(tokenId(event) === undefined ? {} : { apiTokenId: tokenId(event) }),
      subjectType: event.subject.type,
      ...(subjectId === undefined ? {} : { subjectId }),
      details: event.details,
      ...(event.request === undefined ? {} : { request: event.request }),
    });
    if (!snapshot || !event.action.startsWith('identity.')) return null;
    return {
      domain: 'identity',
      pluginId: null,
      action: snapshot.action,
      operationId: snapshot.operationId,
      actorId: snapshot.actorId,
      authenticationMethod: snapshot.authenticationMethod,
      apiTokenId: snapshot.apiTokenId,
      outcome: snapshot.outcome,
      subjectType: snapshot.subjectType,
      subjectId: snapshot.subjectId,
      ipAddress: snapshot.ipAddress,
      userAgent: snapshot.userAgent,
      details: snapshot.details,
    };
  },

  attractap(event) {
    if (!event.action.startsWith('attractap.') || event.subject.id === null) return null;
    const action = event.action.slice('attractap.'.length) as AttractapAuditAction;
    // Card events are always about the card; every other event names its own subject.
    const card = action.startsWith('card.');
    if (card !== (event.subject.type === 'attractap.card')) return null;
    const apiTokenId = tokenId(event);
    const snapshot = projectAttractapAuditEvent({
      action,
      ...(card ? {} : { subjectType: event.subject.type as 'attractap.reader' }),
      actorId: event.actor.id,
      authenticationMethod: event.actor.authenticationMethod,
      ...(apiTokenId === undefined ? {} : { apiTokenId }),
      subjectId: event.subject.id,
      details: event.details as Record<string, string | number | boolean>,
    });
    if (!snapshot) return null;
    return {
      ...base(event),
      domain: 'attractap',
      pluginId: 'core',
      action: `attractap.${snapshot.action}`,
      subjectType: card ? 'attractap.card' : (snapshot.subjectType ?? 'attractap.reader'),
      subjectId: snapshot.subjectId,
      details: snapshot.details,
    };
  },

  resource(event) {
    if (event.subject.id === null) return null;
    const snapshot = projectResourceAuditEvent({
      action: event.action,
      operationId: event.operationId,
      actorId: event.actor.id,
      authenticationMethod: event.actor.authenticationMethod,
      apiTokenId: event.actor.apiTokenId,
      subjectId: event.subject.id,
      subjectType: event.subject.type as 'resource' | 'flow',
      details: event.details as Record<string, string | number>,
    });
    if (!snapshot) return null;
    return {
      ...base(event),
      domain: 'resource',
      pluginId: 'core',
      action: snapshot.action,
      subjectType: snapshot.subjectType ?? 'resource',
      subjectId: snapshot.subjectId,
      details: snapshot.details,
    };
  },

  project(event) {
    if (event.actor.id === null || event.subject.id === null) return null;
    const apiTokenId = tokenId(event);
    const snapshot = projectProjectAuditEvent({
      action: event.action,
      operationId: event.operationId,
      actorId: event.actor.id,
      ...(event.actor.authenticationMethod === null ? {} : { authenticationMethod: event.actor.authenticationMethod }),
      ...(apiTokenId === undefined ? {} : { apiTokenId }),
      subjectType: event.subject.type as 'project',
      subjectId: event.subject.id,
      details: event.details as Record<string, string | number>,
    });
    if (!snapshot) return null;
    return {
      ...base(event),
      domain: 'project',
      pluginId: 'core',
      action: snapshot.action,
      // The validated method, never null: these domains always stored the session default.
      authenticationMethod: snapshot.authenticationMethod ?? 'session',
      apiTokenId: snapshot.apiTokenId ?? null,
      subjectType: snapshot.subjectType,
      subjectId: snapshot.subjectId,
      details: snapshot.details,
    };
  },

  administration(event) {
    if (event.actor.id === null || event.subject.id === null) return null;
    const apiTokenId = tokenId(event);
    const snapshot = projectAdministrationAuditEvent({
      action: event.action,
      operationId: event.operationId,
      actorId: event.actor.id,
      ...(event.actor.authenticationMethod === null ? {} : { authenticationMethod: event.actor.authenticationMethod }),
      ...(apiTokenId === undefined ? {} : { apiTokenId }),
      subjectType: event.subject.type,
      subjectId: event.subject.id,
      ...(event.outcome === undefined ? {} : { outcome: event.outcome as 'succeeded' }),
      details: event.details as Record<string, string | number>,
    });
    if (!snapshot) return null;
    return {
      ...base(event),
      domain: 'administration',
      pluginId: 'core',
      action: snapshot.action,
      // The validated method, never null: these domains always stored the session default.
      authenticationMethod: snapshot.authenticationMethod ?? 'session',
      apiTokenId: snapshot.apiTokenId ?? null,
      subjectType: snapshot.subjectType,
      subjectId: snapshot.subjectId,
      details: snapshot.details,
    };
  },

  billing(event) {
    if (!validBillingAuditEvent(event)) return null;
    const details = dataFields(event.details, ['amount', 'status', 'previousStatus', 'source']);
    if (!details) return null;
    return {
      ...base(event),
      domain: 'billing',
      pluginId: 'billing',
      action: event.action,
      subjectType: 'billing.transaction',
      subjectId: event.subject.id,
      details: { ...details } as AuditRow['details'],
    };
  },
};

/** Plugin domains: validated against the declaration of the plugin that registered the domain. */
function pluginRow(event: AuditEvent & { operationId: string }): AuditRow | null {
  const registered = getPluginAuditDomain(event.domain);
  if (!registered) return null;
  const { id, authenticationMethod } = event.actor;
  const apiTokenId = tokenId(event);
  const snapshot = projectPluginAuditEvent({
    action: event.action,
    operationId: event.operationId,
    principal: { userId: id, authenticationMethod, ...(apiTokenId === undefined ? {} : { apiTokenId }) },
    outcome: event.outcome ?? 'succeeded',
    subject: event.subject,
    details: event.details,
    pluginId: registered.pluginId,
  });
  if (!snapshot || snapshot.domain !== event.domain) return null;
  return {
    domain: snapshot.domain,
    pluginId: snapshot.pluginId,
    action: snapshot.action,
    operationId: snapshot.operationId,
    actorId: snapshot.actorId,
    authenticationMethod: snapshot.authenticationMethod,
    apiTokenId: snapshot.apiTokenId ?? null,
    outcome: snapshot.outcome,
    subjectType: snapshot.subjectType,
    subjectId: snapshot.subjectId,
    ipAddress: null,
    userAgent: null,
    details: snapshot.details,
  };
}
