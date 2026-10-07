import { dataFields, positive } from './audit-projection';
import {
  omissionMetadata,
  omittedField,
  opaqueSamlEntityId,
  roleMappings,
  safeUrl,
  stringArray,
} from './audit-sso-field-validation';
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
