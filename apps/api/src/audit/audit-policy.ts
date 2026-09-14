import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { isIP } from 'node:net';

export interface ResourceAuditEvent {
  action:
    | 'resource.created'
    | 'resource.updated'
    | 'resource.deleted'
    | 'resource_group.created'
    | 'resource_group.updated'
    | 'resource_group.deleted'
    | 'resource_group.resource_added'
    | 'resource_group.resource_removed'
    | 'introduction.granted'
    | 'introduction.revoked'
    | 'maintenance_schedule.created'
    | 'maintenance_schedule.updated'
    | 'maintenance_schedule.deleted'
    | 'supervision.approved'
    | 'supervision.rejected'
    | 'health.transition'
    | 'usage_session.started'
    | 'usage_session.ended'
    | 'retraining.required'
    | 'retraining.cleared';
  operationId: string;
  actorId: number | null;
  authenticationMethod?: 'session' | 'api-token' | null;
  apiTokenId?: number | null;
  subjectId: number;
  subjectType?: 'resource' | 'resource_group';
  details: Record<string, string | number>;
}

export interface ProjectAuditEvent {
  action:
    | 'project.created'
    | 'project.updated'
    | 'project.deleted'
    | 'project.archived'
    | 'project.unarchived'
    | 'project.member.added'
    | 'project.member.removed'
    | 'project.invitation.sent'
    | 'project.invitation.accepted'
    | 'project.invitation.rejected'
    | 'project.invitation.revoked';
  operationId: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: 'project' | 'project.member' | 'project.invitation';
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

export type ResourceAuditOrigin =
  | { actorId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number }
  | { actorId: number; authenticationMethod: null }
  | { actorId: null };

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

const ssoActions = new Set([
  'sso.provider.created',
  'sso.provider.updated',
  'sso.provider.deleted',
  'sso.provisioning.sessions_revoked',
  'sso.provisioning.user_created',
  'sso.provisioning.user_deleted',
  'sso.provisioning.permissions_synced',
]);
export type SsoAuditEvent = {
  action: string;
  operationId: string;
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId?: number;
  subject: { type: 'sso.provider' | 'user'; id: number };
  details: Record<string, string>;
};

function providerSnapshot(value: unknown): boolean {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1800) return false;
  try {
    const snapshot = dataFields(JSON.parse(value), ['id', 'name', 'type', 'configuration']);
    return (
      !!snapshot &&
      Reflect.ownKeys(snapshot).length === 4 &&
      positive(snapshot.id) &&
      typeof snapshot.name === 'string' &&
      snapshot.name.length > 0 &&
      snapshot.name.length <= 255 &&
      (snapshot.type === 'oidc' || snapshot.type === 'saml') &&
      providerConfiguration(snapshot.type, snapshot.configuration)
    );
  } catch {
    return false;
  }
}

function stringArray(value: unknown, max = 100): boolean {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((entry) => typeof entry === 'string' && entry.length <= 255)
  );
}

function roleMappings(value: unknown): boolean {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const summary = dataFields(value, ['mappedRoleCount', 'externalValueCount', 'truncated']);
    if (summary && Reflect.ownKeys(summary).length === 3) {
      return (
        Number.isInteger(summary.mappedRoleCount) &&
        (summary.mappedRoleCount as number) >= 0 &&
        Number.isInteger(summary.externalValueCount) &&
        (summary.externalValueCount as number) >= 0 &&
        summary.truncated === true
      );
    }
  }
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 100 || keys.some((key) => typeof key !== 'string')) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === 'string' &&
      !!descriptor &&
      'value' in descriptor &&
      /^[a-z0-9][a-z0-9_-]{0,127}$/.test(key) &&
      stringArray(descriptor.value)
    );
  });
}

function safeUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function opaqueSamlEntityId(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 96 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return true;
  }
}

function omissionMetadata(value: unknown, allowed: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return (
    Object.keys(fields).length <= 10 &&
    Object.keys(fields).every((key) => allowed.includes(key)) &&
    Object.values(fields).every((metadata) => {
      const entry = dataFields(metadata, ['byteLength', 'count']);
      if (!entry || Object.keys(entry).length === 0) return false;
      return (
        (entry.byteLength === undefined ||
          (Number.isSafeInteger(entry.byteLength) && (entry.byteLength as number) >= 0)) &&
        (entry.count === undefined || (Number.isInteger(entry.count) && (entry.count as number) >= 0))
      );
    })
  );
}

function omittedField(value: unknown, field: string): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, field);
}

function providerConfiguration(type: unknown, value: unknown): boolean {
  if (type === 'oidc') {
    const config = dataFields(value, [
      'issuer',
      'authorizationURL',
      'tokenURL',
      'userInfoURL',
      'clientId',
      'clientSecretConfigured',
      'scopes',
      'usernameClaimPaths',
      'emailClaimPaths',
      'roleMappings',
      'omitted',
    ]);
    return (
      !!config &&
      Reflect.ownKeys(config).length === 11 &&
      ['issuer', 'authorizationURL', 'tokenURL', 'userInfoURL'].every(
        (key) => safeUrl(config[key]) || (config[key] === '' && omittedField(config.omitted, key)),
      ) &&
      typeof config.clientId === 'string' &&
      config.clientId.length <= 96 &&
      typeof config.clientSecretConfigured === 'boolean' &&
      [config.scopes, config.usernameClaimPaths, config.emailClaimPaths].every(
        (field) => field === null || stringArray(field),
      ) &&
      (config.roleMappings === null || roleMappings(config.roleMappings)) &&
      omissionMetadata(config.omitted, [
        'name',
        'issuer',
        'authorizationURL',
        'tokenURL',
        'userInfoURL',
        'clientId',
        'scopes',
        'usernameClaimPaths',
        'emailClaimPaths',
      ])
    );
  }
  if (type === 'saml') {
    const config = dataFields(value, [
      'entryPoint',
      'issuer',
      'audience',
      'signRequest',
      'wantAssertionsSigned',
      'wantAuthnResponseSigned',
      'forceAuthn',
      'emailAttributeKeys',
      'roleMappings',
      'signingMaterial',
      'omitted',
    ]);
    const material =
      config &&
      dataFields(config.signingMaterial, [
        'identityProviderCertificateConfigured',
        'provisioningSecretConfigured',
        'signingCertificateConfigured',
        'signingPrivateKeyConfigured',
      ]);
    return (
      !!config &&
      Reflect.ownKeys(config).length === 11 &&
      !!material &&
      Reflect.ownKeys(material).length === 4 &&
      (safeUrl(config.entryPoint) || (config.entryPoint === '' && omittedField(config.omitted, 'entryPoint'))) &&
      (opaqueSamlEntityId(config.issuer) || (config.issuer === '' && omittedField(config.omitted, 'issuer'))) &&
      (config.audience === null ||
        opaqueSamlEntityId(config.audience) ||
        (config.audience === '' && omittedField(config.omitted, 'audience'))) &&
      ['signRequest', 'wantAssertionsSigned', 'wantAuthnResponseSigned', 'forceAuthn'].every(
        (key) => typeof config[key] === 'boolean',
      ) &&
      (config.emailAttributeKeys === null || stringArray(config.emailAttributeKeys)) &&
      (config.roleMappings === null || roleMappings(config.roleMappings)) &&
      omissionMetadata(config.omitted, ['name', 'entryPoint', 'issuer', 'audience', 'emailAttributeKeys']) &&
      [
        'identityProviderCertificateConfigured',
        'provisioningSecretConfigured',
        'signingCertificateConfigured',
        'signingPrivateKeyConfigured',
      ].every((key) => typeof material[key] === 'boolean')
    );
  }
  return false;
}

function providerChanges(value: unknown): boolean {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1800) return false;
  try {
    const changes = dataFields(JSON.parse(value), ['changed', 'rotated']);
    return (
      !!changes &&
      Reflect.ownKeys(changes).length === 2 &&
      stringArray(changes.changed, 20) &&
      stringArray(changes.rotated, 5) &&
      (changes.changed as string[]).every((field) => /^(name|configuration\.[a-zA-Z]+)$/.test(field)) &&
      (changes.rotated as string[]).every((field) =>
        [
          'clientSecret',
          'provisioningSecret',
          'identityProviderCertificate',
          'signingCertificate',
          'signingPrivateKey',
        ].includes(field),
      )
    );
  } catch {
    return false;
  }
}

function roleDelta(value: unknown): boolean {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1800) return false;
  try {
    const delta = dataFields(JSON.parse(value), ['added', 'removed', 'updated']);
    if (!delta || Reflect.ownKeys(delta).length !== 3) return false;
    const names = Object.values(delta);
    if (!names.every((roles) => Array.isArray(roles) && roles.length <= 100)) return false;
    const values = names.flat() as unknown[];
    return values.every((role) => typeof role === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(role));
  } catch {
    return false;
  }
}

function provisioningChange(action: string, value: unknown): boolean {
  if (action === 'sso.provisioning.permissions_synced') return roleDelta(value);
  if (typeof value !== 'string') return false;
  try {
    const change = dataFields(JSON.parse(value), ['sessionsRevoked', 'userCreated', 'userDeleted']);
    return (
      !!change &&
      Reflect.ownKeys(change).length === 1 &&
      (action === 'sso.provisioning.sessions_revoked'
        ? change.sessionsRevoked === true
        : action === 'sso.provisioning.user_created'
          ? change.userCreated === true
          : change.userDeleted === true)
    );
  } catch {
    return false;
  }
}

export function projectSsoAuditEvent(input: unknown): SsoAuditEvent | null {
  const event = dataFields(input, [
    'action',
    'operationId',
    'actorId',
    'authenticationMethod',
    'apiTokenId',
    'subject',
    'details',
  ]);
  if (!event || !ssoActions.has(event.action as string) || !uuid(event.operationId)) return null;
  if (event.actorId === null) {
    if (event.authenticationMethod !== null || event.apiTokenId !== undefined) return null;
  } else if (
    !positive(event.actorId) ||
    (event.authenticationMethod !== 'session' && event.authenticationMethod !== 'api-token')
  ) {
    return null;
  }
  if (event.authenticationMethod === 'api-token' ? !positive(event.apiTokenId) : event.apiTokenId !== undefined)
    return null;
  const providerLifecycle = (event.action as string).startsWith('sso.provider.');
  if (providerLifecycle ? event.actorId === null : event.actorId !== null) return null;
  const subject = dataFields(event.subject, ['type', 'id']);
  const details = dataFields(event.details, ['before', 'after', 'provider', 'changes']);
  if (!subject || !positive(subject.id) || (subject.type !== 'sso.provider' && subject.type !== 'user') || !details)
    return null;
  if (
    Object.values(details).some((value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1800) ||
    Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096
  )
    return null;
  const detailKeys = Object.keys(details).sort().join(',');
  if (
    event.action === 'sso.provider.created' &&
    (detailKeys !== 'after,before' ||
      subject.type !== 'sso.provider' ||
      details.before !== 'null' ||
      !providerSnapshot(details.after))
  )
    return null;
  if (
    event.action === 'sso.provider.deleted' &&
    (detailKeys !== 'after,before' ||
      subject.type !== 'sso.provider' ||
      !providerSnapshot(details.before) ||
      details.after !== 'null')
  )
    return null;
  if (
    event.action === 'sso.provider.updated' &&
    (detailKeys !== 'after,before,changes' ||
      subject.type !== 'sso.provider' ||
      !providerSnapshot(details.before) ||
      !providerSnapshot(details.after) ||
      !providerChanges(details.changes))
  )
    return null;
  if (
    (event.action as string).startsWith('sso.provisioning.') &&
    (detailKeys !== 'changes,provider' ||
      subject.type !== 'user' ||
      !providerSnapshot(details.provider) ||
      !provisioningChange(event.action as string, details.changes))
  )
    return null;
  return {
    action: event.action as string,
    operationId: event.operationId as string,
    actorId: event.actorId as number | null,
    authenticationMethod: event.authenticationMethod as SsoAuditEvent['authenticationMethod'],
    ...(event.apiTokenId === undefined ? {} : { apiTokenId: event.apiTokenId as number }),
    subject: { type: subject.type as 'sso.provider' | 'user', id: subject.id as number },
    details: details as Record<string, string>,
  };
}

export const RESOURCE_AUDIT_ACTIONS: ResourceAuditEvent['action'][] = [
  'resource.created',
  'resource.updated',
  'resource.deleted',
  'resource_group.created',
  'resource_group.updated',
  'resource_group.deleted',
  'resource_group.resource_added',
  'resource_group.resource_removed',
  'introduction.granted',
  'introduction.revoked',
  'maintenance_schedule.created',
  'maintenance_schedule.updated',
  'maintenance_schedule.deleted',
  'supervision.approved',
  'supervision.rejected',
  'health.transition',
  'usage_session.started',
  'usage_session.ended',
  'retraining.required',
  'retraining.cleared',
];
const resourceActions = new Set<ResourceAuditEvent['action']>(RESOURCE_AUDIT_ACTIONS);
const resourceDetailFields: Partial<Record<ResourceAuditEvent['action'], readonly string[]>> = {
  'resource.created': ['after.name', 'after.type'],
  'resource.updated': ['before.name', 'after.name', 'before.type', 'after.type', 'changedFields'],
  'resource.deleted': ['before.name', 'before.type'],
  'resource_group.created': ['after.name', 'after.isHidden'],
  'resource_group.updated': ['before.name', 'after.name', 'before.isHidden', 'after.isHidden', 'changedFields'],
  'resource_group.deleted': ['before.name', 'before.isHidden'],
  'resource_group.resource_added': ['resourceId'],
  'resource_group.resource_removed': ['resourceId'],
  'introduction.granted': ['recipientUserId', 'tutorUserId'],
  'introduction.revoked': ['recipientUserId'],
  'maintenance_schedule.created': ['scheduleId', 'enabled', 'triggerType', 'name', 'usageDuration', 'usageUnit', 'usageThreshold'],
  'maintenance_schedule.updated': ['scheduleId', 'enabled', 'triggerType', 'name', 'usageDuration', 'usageUnit', 'usageThreshold'],
  'maintenance_schedule.deleted': ['scheduleId', 'enabled', 'triggerType', 'name', 'usageDuration', 'usageUnit', 'usageThreshold'],
  'supervision.approved': ['requesterUserId', 'supervisorUserId', 'requestId'],
  'supervision.rejected': ['requesterUserId', 'supervisorUserId', 'requestId'],
  'health.transition': ['healthSource', 'previousStatus', 'status'],
  'usage_session.started': ['supervisorUserId', 'usageId', 'usageUserId'],
  'usage_session.ended': ['usageId', 'usageUserId'],
  'retraining.required': ['introductionId', 'retrainingReason', 'usageUserId'],
  'retraining.cleared': ['introductionId', 'usageUserId'],
};

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
    (input.actorId !== null && !positive(input.actorId)) ||
    !positive(input.subjectId) ||
    (input.subjectType !== undefined && input.subjectType !== 'resource' && input.subjectType !== 'resource_group')
  ) {
    return null;
  }
  const allowedFields = resourceDetailFields[input.action];
  if (!allowedFields) return null;
  const details = dataFields(input.details, allowedFields);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (!allowedFields.includes(key) || (typeof value !== 'string' && typeof value !== 'number')) return null;
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  if (input.actorId === null) {
    if (
      (input.authenticationMethod !== undefined && input.authenticationMethod !== null) ||
      (input.apiTokenId !== undefined && input.apiTokenId !== null)
    )
      return null;
  } else if (
    (input.authenticationMethod !== undefined &&
      input.authenticationMethod !== null &&
      input.authenticationMethod !== 'session' &&
      input.authenticationMethod !== 'api-token') ||
    ((input.authenticationMethod === undefined || input.authenticationMethod === null) &&
      input.apiTokenId !== undefined &&
      input.apiTokenId !== null) ||
    (input.apiTokenId !== undefined && input.apiTokenId !== null && !positive(input.apiTokenId)) ||
    (input.authenticationMethod === 'api-token' && (input.apiTokenId === undefined || input.apiTokenId === null))
  ) {
    return null;
  }
  return { ...input, details: details as Record<string, string | number> };
}

const projectActions = new Set<ProjectAuditEvent['action']>([
  'project.created',
  'project.updated',
  'project.deleted',
  'project.archived',
  'project.unarchived',
  'project.member.added',
  'project.member.removed',
  'project.invitation.sent',
  'project.invitation.accepted',
  'project.invitation.rejected',
  'project.invitation.revoked',
]);
const projectDetailFields = new Set([
  'projectId',
  'memberId',
  'userId',
  'invitationId',
  'role',
  'before.name',
  'after.name',
  'before.nameOmitted',
  'after.nameOmitted',
  'before.nameTruncated',
  'after.nameTruncated',
  'descriptionChanged',
  'changedFields',
  'before.hasLogo',
  'after.hasLogo',
  'after.archived',
]);
const projectDetailValidators: Record<string, (value: string | number) => boolean> = {
  projectId: positive,
  memberId: positive,
  userId: positive,
  invitationId: positive,
  role: oneOf('viewer'),
  'before.name': (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 160 && !!value.trim(),
  'after.name': (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 160 && !!value.trim(),
  'before.nameOmitted': (value) => value === 1,
  'after.nameOmitted': (value) => value === 1,
  'before.nameTruncated': (value) => value === 1,
  'after.nameTruncated': (value) => value === 1,
  descriptionChanged: (value) => value === 1,
  changedFields: (value) => {
    try {
      const fields = JSON.parse(value as string);
      return Array.isArray(fields) && fields.length > 0 && fields.every((field) => ['name', 'description', 'logo'].includes(field));
    } catch {
      return false;
    }
  },
  'before.hasLogo': (value) => value === 0 || value === 1,
  'after.hasLogo': (value) => value === 0 || value === 1,
  'after.archived': (value) => value === 0 || value === 1,
};

/** Project administration snapshots intentionally exclude descriptions, email addresses, and invitation credentials. */
export function projectProjectAuditEvent(input: ProjectAuditEvent): ProjectAuditEvent | null {
  if (
    !projectActions.has(input.action) ||
    !uuid(input.operationId) ||
    !positive(input.actorId) ||
    !positive(input.subjectId) ||
    !['project', 'project.member', 'project.invitation'].includes(input.subjectType)
  ) {
    return null;
  }
  const authenticationMethod = input.authenticationMethod ?? 'session';
  if (
    (input.authenticationMethod !== undefined && input.authenticationMethod !== 'session' && input.authenticationMethod !== 'api-token') ||
    (authenticationMethod === 'api-token' && !positive(input.apiTokenId)) ||
    (authenticationMethod === 'session' && input.apiTokenId !== undefined)
  ) {
    return null;
  }
  const details = dataFields(input.details, [...projectDetailFields]);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (
      !projectDetailFields.has(key) ||
      (typeof value !== 'string' && typeof value !== 'number') ||
      !projectDetailValidators[key](value)
    ) {
      return null;
    }
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
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
const integerBetween = (minimum: number, maximum: number) => (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const policySnapshotFields: Record<string, (value: unknown) => boolean> = {
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
