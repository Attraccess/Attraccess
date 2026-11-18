/** DI token for the {@link SsoLinkSecretStore}. */
export const SSO_LINK_SECRET_STORE = Symbol.for('attraccess.auth.sso-link-secret-store');

/**
 * Where the key that signs account-link tokens is kept. The value is stored encrypted; encrypting, decrypting
 * and migrating plain values is the link-token service's business.
 */
export interface SsoLinkSecretStore {
  /** The stored value; null when no secret was created yet. */
  read(): Promise<string | null>;
  /** Replaces the stored value (used to encrypt a secret that was stored in plain text). */
  replace(value: string): Promise<void>;
  /** Stores the value unless another instance created a secret first; false when one already exists. */
  createIfAbsent(value: string): Promise<boolean>;
}
