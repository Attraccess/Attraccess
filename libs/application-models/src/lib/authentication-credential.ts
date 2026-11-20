import type { AuthenticationType } from './authentication-type';
import type { SSOProviderType } from './ssoProvider';

/** A credential of a user without its secret material (password hash, TOTP secret). */
export interface CredentialRecord {
  id: number;
  userId: number;
  type: AuthenticationType;
}

/** The binding of a user to an identity at a single sign-on provider. */
export interface SsoCredentialRecord extends CredentialRecord {
  providerType: SSOProviderType | null;
  providerId: number | null;
  ssoSubject: string | null;
}

/** A credential to add for a user. A password arrives hashed. */
export type NewCredential =
  | { type: AuthenticationType.LOCAL_PASSWORD; passwordHash: string }
  | { type: AuthenticationType.SSO; providerType: SSOProviderType; providerId: number; subject: string };

/** The authenticator-app (TOTP) enrollment of a user. The secret is stored encrypted. */
export interface TotpCredentialRecord {
  id: number;
  userId: number;
  encryptedSecret: string | null;
  enabledAt: Date | null;
}
