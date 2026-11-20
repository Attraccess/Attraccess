export const SUMUP_CREDENTIAL_STORE = Symbol.for('attraccess.billing.sumup-credential-store');

/** The SumUp account the instance is connected to. The API key is only ever stored encrypted. */
export interface SumUpCredentialStore {
  /** The encrypted API key, or null when none is stored. */
  getEncryptedApiKey(): Promise<string | null>;

  getMerchantCode(): Promise<string | null>;

  /** Replaces both values together: either both change or none does. */
  saveCredentials(credentials: { encryptedApiKey: string; merchantCode: string }): Promise<void>;
}
