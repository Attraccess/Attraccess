import { operationToken } from '../../../database/transaction-scope';
import type {
  SSOProvider,
  SSOProviderType,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
} from '@attraccess/application-models';
import type { AuthenticationDetail, ApiToken, Passkey, PasskeyChallenge, User } from '@attraccess/application-models';

export type NewPasskey = Pick<
  Passkey,
  'userId' | 'credentialId' | 'publicKey' | 'counter' | 'transports' | 'name' | 'backedUp'
>;
export abstract class PasskeyPersistence {
  abstract listForUser(userId: number): Promise<Passkey[]>;
  abstract removeOwned(userId: number, passkeyId: number): Promise<boolean>;
  abstract findOwned(userId: number, passkeyId: number): Promise<Passkey | null>;
  abstract findCredential(credentialId: string): Promise<Passkey | null>;
  abstract savePasskey(passkey: Passkey): Promise<Passkey>;
  abstract registerPasskey(passkey: NewPasskey): Promise<Passkey>;
  abstract recordAuthentication(id: number, counter: number, backedUp: boolean, usedAt: Date): Promise<void>;
  abstract findUser(userId: number): Promise<User | null>;
  abstract removeExpiredChallenges(before: Date): Promise<void>;
  abstract storeChallenge(challenge: string, userId: number | null, expiresAt: Date): Promise<void>;
  /** Claim and burn once, even when another request read the same row concurrently. */
  abstract consumeChallenge(challenge: string): Promise<PasskeyChallenge | null>;
}

export type NewApiToken = Pick<ApiToken, 'userId' | 'name' | 'tokenHash' | 'expiresAt' | 'lastUsedAt' | 'revokedAt'>;
export abstract class ApiTokenPersistence {
  abstract activePage(userId: number, page: number, limit: number): Promise<[ApiToken[], number]>;
  abstract findOwned(userId: number, tokenId: number): Promise<ApiToken | null>;
  abstract findByHash(tokenHash: string): Promise<ApiToken | null>;
  abstract findOwner(userId: number): Promise<User | null>;
  abstract createToken(token: NewApiToken, permissionKeys: readonly string[]): Promise<ApiToken>;
  abstract updateToken(token: ApiToken, permissionKeys?: readonly string[]): Promise<ApiToken>;
  abstract saveToken(token: ApiToken): Promise<void>;
  abstract touchActive(id: number, now: Date): Promise<boolean>;
}

export type TotpDetails = Pick<AuthenticationDetail, 'userId' | 'type' | 'totpSecret' | 'totpEnabledAt'> &
  Partial<Pick<AuthenticationDetail, 'id'>>;
export abstract class TwoFactorPersistence {
  abstract findDetail(userId: number): Promise<AuthenticationDetail | null>;
  abstract saveDetail(detail: TotpDetails): Promise<void>;
  abstract removeDetail(id: number): Promise<void>;
  abstract readPolicy(): Promise<string | null>;
  abstract writePolicy(policy: string): Promise<void>;
}
export interface StoredLinkSecret {
  id: number;
  value: string;
}
export abstract class SsoLinkSecretPersistence {
  abstract readSecret(): Promise<StoredLinkSecret | null>;
  abstract updateSecret(id: number, value: string): Promise<void>;
  abstract insertSecret(value: string): Promise<void>;
}

export type OidcConfigurationChanges = Partial<Omit<SSOProviderOIDCConfiguration, 'ssoProvider'>>;
export type SamlConfigurationChanges = Partial<Omit<SSOProviderSAMLConfiguration, 'ssoProvider'>> & {
  provisioningSecret?: string | null;
};
export abstract class SsoProviderOperations {
  abstract createProvider(name: string, type: SSOProviderType): Promise<SSOProvider>;
  abstract providerByType(id: number, type: SSOProviderType): Promise<SSOProvider | null>;
  abstract renameProvider(id: number, name: string): Promise<void>;
  abstract removeProvider(id: number): Promise<void>;
  abstract createOidcConfiguration(data: OidcConfigurationChanges): Promise<SSOProviderOIDCConfiguration>;
  abstract oidcConfiguration(providerId: number): Promise<SSOProviderOIDCConfiguration | null>;
  abstract patchOidcConfiguration(providerId: number, data: OidcConfigurationChanges): Promise<void>;
  abstract removeOidcConfiguration(id: number): Promise<void>;
  abstract createSamlConfiguration(data: SamlConfigurationChanges): Promise<SSOProviderSAMLConfiguration>;
  abstract samlConfiguration(providerId: number): Promise<SSOProviderSAMLConfiguration | null>;
  abstract patchSamlConfiguration(providerId: number, data: SamlConfigurationChanges): Promise<void>;
  abstract removeSamlConfiguration(id: number): Promise<void>;
}
export const SSO_WRITES = operationToken<SsoProviderOperations>('sso-provider-configuration', [
  'createProvider',
  'providerByType',
  'renameProvider',
  'removeProvider',
  'createOidcConfiguration',
  'oidcConfiguration',
  'patchOidcConfiguration',
  'removeOidcConfiguration',
  'createSamlConfiguration',
  'samlConfiguration',
  'patchSamlConfiguration',
  'removeSamlConfiguration',
]);
export abstract class SsoPersistence extends SsoProviderOperations {
  abstract allProviders(): Promise<SSOProvider[]>;
  abstract providerById(id: number): Promise<SSOProvider | null>;
}

export type NewAuthenticationDetail = Pick<AuthenticationDetail, 'userId' | 'type'> &
  Partial<Pick<AuthenticationDetail, 'password' | 'providerType' | 'providerId' | 'ssoSubject'>>;
export abstract class AuthenticationOperations {
  abstract saveAuthentication(detail: AuthenticationDetail | NewAuthenticationDetail): Promise<AuthenticationDetail>;
}
export const AUTHENTICATION_WRITES = operationToken<AuthenticationOperations>('authentication-writes', [
  'saveAuthentication',
]);
export abstract class AuthenticationPersistence extends AuthenticationOperations {
  abstract ssoIdentity(
    providerType: import('@attraccess/application-models').SSOProviderType,
    providerId: number,
    subject: string,
  ): Promise<AuthenticationDetail | null>;
  abstract ssoCount(userId: number): Promise<number>;
  abstract detail(
    userId: number,
    type: import('@attraccess/application-models').AuthenticationType,
  ): Promise<AuthenticationDetail | null>;
  abstract updateSubject(detailId: number, subject: string): Promise<void>;
  abstract removeDetail(detailId: number): Promise<void>;
}
