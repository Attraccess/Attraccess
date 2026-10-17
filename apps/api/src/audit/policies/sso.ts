import { SsoAuditEvent } from './domain-events';
import { dataFields, positive, uuid } from './projection';

export function stringArray(value: unknown, max = 100): boolean {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((entry) => typeof entry === 'string' && entry.length <= 255)
  );
}

export function roleMappings(value: unknown): boolean {
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

export function safeUrl(value: unknown): boolean {
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

export function opaqueSamlEntityId(value: unknown): boolean {
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

export function omissionMetadata(value: unknown, allowed: readonly string[]): boolean {
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

export function omittedField(value: unknown, field: string): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, field);
}

export function providerSnapshot(value: unknown): boolean {
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

export function providerConfiguration(type: unknown, value: unknown): boolean {
  if (type === 'oidc') return oidcProviderConfiguration(value);
  if (type === 'saml') return samlProviderConfiguration(value);
  return false;
}

export function oidcProviderConfiguration(value: unknown): boolean {
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

export function samlProviderConfiguration(value: unknown): boolean {
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

export const ssoActions = new Set([
  'sso.provider.created',
  'sso.provider.updated',
  'sso.provider.deleted',
  'sso.provisioning.sessions_revoked',
  'sso.provisioning.user_created',
  'sso.provisioning.user_deleted',
  'sso.provisioning.permissions_synced',
]);

export function providerChanges(value: unknown): boolean {
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

export function roleDelta(value: unknown): boolean {
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

export function provisioningChange(action: string, value: unknown): boolean {
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

export function validSsoDetails(
  event: Record<string, unknown>,
  subject: Record<string, unknown>,
  details: Record<string, unknown>,
): boolean {
  const detailKeys = Object.keys(details).sort().join(',');
  if (
    event.action === 'sso.provider.created' &&
    (detailKeys !== 'after,before' ||
      subject.type !== 'sso.provider' ||
      details.before !== 'null' ||
      !providerSnapshot(details.after))
  )
    return false;
  if (
    event.action === 'sso.provider.deleted' &&
    (detailKeys !== 'after,before' ||
      subject.type !== 'sso.provider' ||
      !providerSnapshot(details.before) ||
      details.after !== 'null')
  )
    return false;
  if (
    event.action === 'sso.provider.updated' &&
    (detailKeys !== 'after,before,changes' ||
      subject.type !== 'sso.provider' ||
      !providerSnapshot(details.before) ||
      !providerSnapshot(details.after) ||
      !providerChanges(details.changes))
  )
    return false;
  if (
    (event.action as string).startsWith('sso.provisioning.') &&
    (detailKeys !== 'changes,provider' ||
      subject.type !== 'user' ||
      !providerSnapshot(details.provider) ||
      !provisioningChange(event.action as string, details.changes))
  )
    return false;
  return true;
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
  if (!validSsoDetails(event, subject, details)) return null;
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
