import { dataFields } from './audit-projection';
import { stringArray } from './audit-sso-field-validation';
import { providerSnapshot } from './audit-sso-provider-validation';
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
