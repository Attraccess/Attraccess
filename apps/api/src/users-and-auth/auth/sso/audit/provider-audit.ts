import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { AuditActor, AuditEvent, AuditRecorder } from '../../../../audit/recorder/audit-event';

const MAX_INLINE_ROLE_MAPPINGS_BYTES = 180;
const MAX_INLINE_FIELD_BYTES = 96;
// Account for escaping when a snapshot is stored as a string inside audit details.
const MAX_ENCODED_SNAPSHOT_BYTES = 1300;

type OmittedFields = Record<string, { byteLength?: number; count?: number }>;

function auditEndpointUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function boundedString(value: string | null | undefined, field: string, omitted: OmittedFields): string {
  const text = value ?? '';
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (Buffer.byteLength(JSON.stringify(text), 'utf8') <= MAX_INLINE_FIELD_BYTES) return text;
  omitted[field] = { byteLength };
  return '';
}

function boundedArray(value: string[] | null | undefined, field: string, omitted: OmittedFields): string[] | null {
  if (value === null || value === undefined) return null;
  const byteLength = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (byteLength <= MAX_INLINE_FIELD_BYTES) return value;
  omitted[field] = { byteLength, count: value.length };
  return null;
}

function auditRoleMappings(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const mappings = value as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(mappings), 'utf8') <= MAX_INLINE_ROLE_MAPPINGS_BYTES) return mappings;
  const entries = Object.entries(mappings);
  return {
    mappedRoleCount: entries.length,
    externalValueCount: entries.reduce((count, [, roles]) => count + (Array.isArray(roles) ? roles.length : 0), 0),
    truncated: true,
  };
}

function auditSamlEntityId(value: string | null | undefined, field: string, omitted: OmittedFields): string {
  // passport-saml permits entity IDs such as URNs; these are not endpoint URLs.
  let identifier = value ?? '';
  try {
    const url = new URL(identifier);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    identifier = url.toString();
  } catch {
    // Plain public identifiers, for example passport-saml, have no URL components.
  }
  return boundedString(identifier, field, omitted);
}

/** Safe, stable SSO configuration projection for audit before/after comparisons. */
export function ssoAuditSnapshot(provider: SSOProvider): string {
  const omitted: OmittedFields = {};
  const configuration =
    provider.type === SSOProviderType.OIDC
      ? {
          issuer: boundedString(auditEndpointUrl(provider.oidcConfiguration?.issuer), 'issuer', omitted),
          authorizationURL: boundedString(
            auditEndpointUrl(provider.oidcConfiguration?.authorizationURL),
            'authorizationURL',
            omitted,
          ),
          tokenURL: boundedString(auditEndpointUrl(provider.oidcConfiguration?.tokenURL), 'tokenURL', omitted),
          userInfoURL: boundedString(auditEndpointUrl(provider.oidcConfiguration?.userInfoURL), 'userInfoURL', omitted),
          clientId: boundedString(provider.oidcConfiguration?.clientId, 'clientId', omitted),
          clientSecretConfigured: Boolean(provider.oidcConfiguration?.clientSecret),
          scopes: boundedArray(provider.oidcConfiguration?.scopes, 'scopes', omitted),
          usernameClaimPaths: boundedArray(
            provider.oidcConfiguration?.usernameClaimPaths,
            'usernameClaimPaths',
            omitted,
          ),
          emailClaimPaths: boundedArray(provider.oidcConfiguration?.emailClaimPaths, 'emailClaimPaths', omitted),
          roleClaimPaths: boundedArray(provider.oidcConfiguration?.roleClaimPaths, 'roleClaimPaths', omitted),
          roleMappings: auditRoleMappings(provider.oidcConfiguration?.roleMappings),
          omitted,
        }
      : {
          entryPoint: boundedString(auditEndpointUrl(provider.samlConfiguration?.entryPoint), 'entryPoint', omitted),
          issuer: auditSamlEntityId(provider.samlConfiguration?.issuer, 'issuer', omitted),
          audience: !provider.samlConfiguration?.audience
            ? null
            : auditSamlEntityId(provider.samlConfiguration?.audience, 'audience', omitted),
          signRequest: provider.samlConfiguration?.signRequest ?? false,
          wantAssertionsSigned: provider.samlConfiguration?.wantAssertionsSigned ?? false,
          wantAuthnResponseSigned: provider.samlConfiguration?.wantAuthnResponseSigned ?? false,
          forceAuthn: provider.samlConfiguration?.forceAuthn ?? false,
          emailAttributeKeys: boundedArray(
            provider.samlConfiguration?.emailAttributeKeys,
            'emailAttributeKeys',
            omitted,
          ),
          roleAttributeKeys: boundedArray(provider.samlConfiguration?.roleAttributeKeys, 'roleAttributeKeys', omitted),
          roleMappings: auditRoleMappings(provider.samlConfiguration?.roleMappings),
          signingMaterial: {
            identityProviderCertificateConfigured: Boolean(provider.samlConfiguration?.certificate),
            provisioningSecretConfigured: Boolean(provider.samlConfiguration?.provisioningSecret),
            signingCertificateConfigured: Boolean(provider.samlConfiguration?.spSigningCertificate),
            signingPrivateKeyConfigured: Boolean(provider.samlConfiguration?.spSigningKeyEncrypted),
          },
          omitted,
        };
  const snapshot = {
    id: provider.id,
    name: boundedString(provider.name, 'name', omitted) || 'SSO provider',
    type: provider.type.toLowerCase(),
    configuration,
  };
  if (Buffer.byteLength(JSON.stringify(JSON.stringify(snapshot)), 'utf8') > MAX_ENCODED_SNAPSHOT_BYTES) {
    // Keep the event and explicit omission evidence even when many individually safe fields
    // together exceed the envelope. Change detection uses the authoritative configuration.
    for (const [field, value] of Object.entries(configuration)) {
      if ((typeof value === 'string' && value.length > 0) || Array.isArray(value)) {
        omitted[field] = {
          byteLength: Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'),
          ...(Array.isArray(value) ? { count: value.length } : {}),
        };
        Object.assign(configuration, { [field]: Array.isArray(value) ? null : '' });
      }
    }
  }
  return JSON.stringify(snapshot);
}

/** Records a committed `sso.provisioning.*` change for a user; callers decide how to handle failures. */
export async function recordSsoProvisioningAudit(
  audit: AuditRecorder,
  action: 'user_created' | 'user_deleted' | 'permissions_synced' | 'sessions_revoked',
  userId: number,
  provider: SSOProvider,
  changes: unknown,
): Promise<void> {
  await audit.record({
    domain: 'sso',
    action: `sso.provisioning.${action}`,
    operationId: randomUUID(),
    actor: { id: null, authenticationMethod: null },
    subject: { type: 'user', id: userId },
    details: { provider: ssoAuditSnapshot(provider), changes: JSON.stringify(changes) },
  });
}

/** Names of the provider fields an update changed, plus the secrets it rotated; never their values. */
export function ssoProviderChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string {
  const beforeConfiguration = (before.type === SSOProviderType.OIDC
    ? before.oidcConfiguration
    : before.samlConfiguration) as unknown as Record<string, unknown> | undefined;
  const afterConfiguration = (after.type === SSOProviderType.OIDC
    ? after.oidcConfiguration
    : after.samlConfiguration) as unknown as Record<string, unknown> | undefined;
  const fields =
    before.type === SSOProviderType.OIDC
      ? [
          'issuer',
          'authorizationURL',
          'tokenURL',
          'userInfoURL',
          'clientId',
          'scopes',
          'usernameClaimPaths',
          'emailClaimPaths',
          'roleClaimPaths',
          'roleMappings',
          'permissionSyncTtlMinutes',
        ]
      : [
          'entryPoint',
          'issuer',
          'audience',
          'signRequest',
          'wantAssertionsSigned',
          'wantAuthnResponseSigned',
          'forceAuthn',
          'emailAttributeKeys',
          'roleAttributeKeys',
          'roleMappings',
        ];
  const changed = [
    ...(before.name === after.name ? [] : ['name']),
    ...fields
      .filter((key) => !isDeepStrictEqual(beforeConfiguration?.[key], afterConfiguration?.[key]))
      .map((key) => `configuration.${key}`),
  ];
  return JSON.stringify({ changed, rotated });
}

/** The provider secrets and key material an update replaced. */
export function ssoProviderRotations(before: SSOProvider, after: SSOProvider): string[] {
  const rotated: string[] = [];
  if (before.oidcConfiguration?.clientSecret !== after.oidcConfiguration?.clientSecret) rotated.push('clientSecret');
  if (before.samlConfiguration?.provisioningSecret !== after.samlConfiguration?.provisioningSecret)
    rotated.push('provisioningSecret');
  if (before.samlConfiguration?.certificate !== after.samlConfiguration?.certificate)
    rotated.push('identityProviderCertificate');
  if (before.samlConfiguration?.spSigningCertificate !== after.samlConfiguration?.spSigningCertificate)
    rotated.push('signingCertificate');
  if (before.samlConfiguration?.spSigningKeyEncrypted !== after.samlConfiguration?.spSigningKeyEncrypted)
    rotated.push('signingPrivateKey');
  return rotated;
}

/**
 * The `sso.provider.*` event for a provider lifecycle change, with before/after snapshots. Null for an update
 * that changed nothing.
 */
export function ssoProviderAuditEvent(
  action: 'created' | 'deleted',
  actor: AuditActor,
  provider: SSOProvider,
): AuditEvent<'sso'>;
export function ssoProviderAuditEvent(
  action: 'updated',
  actor: AuditActor,
  provider: SSOProvider,
  before: SSOProvider,
): AuditEvent<'sso'> | null;
export function ssoProviderAuditEvent(
  action: 'created' | 'updated' | 'deleted',
  actor: AuditActor,
  provider: SSOProvider,
  before?: SSOProvider,
): AuditEvent<'sso'> | null {
  const snapshot = ssoAuditSnapshot(provider);
  const previous = before ?? provider;
  const changes = ssoProviderChanges(previous, provider, before ? ssoProviderRotations(before, provider) : []);
  if (action === 'updated' && changes === '{"changed":[],"rotated":[]}') return null;
  return {
    domain: 'sso',
    action: `sso.provider.${action}`,
    operationId: randomUUID(),
    actor,
    subject: { type: 'sso.provider', id: provider.id },
    details:
      action === 'created'
        ? { before: 'null', after: snapshot }
        : action === 'deleted'
          ? { before: snapshot, after: 'null' }
          : { before: ssoAuditSnapshot(previous), after: snapshot, changes },
  };
}
