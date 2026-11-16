import type {
  NewSsoOidcConfiguration,
  NewSsoSamlConfiguration,
  SSOProviderType,
  SsoOidcConfigurationChanges,
  SsoProviderRecord,
  SsoSamlConfigurationChanges,
} from '@attraccess/application-models';
import type { AuditEvent } from '../../../../audit/recorder/audit-event';

/** DI token for the {@link SsoProviderStore}. */
export const SSO_PROVIDER_STORE = Symbol.for('attraccess.auth.sso-provider-store');

/** A provider to create with the configuration of its own type. Secrets are already encrypted. */
export interface SsoProviderDraft {
  name: string;
  type: SSOProviderType;
  oidcConfiguration?: NewSsoOidcConfiguration;
  samlConfiguration?: NewSsoSamlConfiguration;
}

/** What an update changes; a configuration key that is present is updated even when it carries no columns. */
export interface SsoProviderChanges {
  name?: string;
  oidcConfiguration?: SsoOidcConfigurationChanges;
  samlConfiguration?: SsoSamlConfigurationChanges;
}

/**
 * Where SSO providers and their OIDC/SAML configurations live. Records hold secrets exactly as stored
 * (encrypted); the SSO service encrypts before and decrypts after. Every write is one atomic unit with its audit
 * row: a provider change either commits with its audit event or not at all.
 */
export interface SsoProviderStore {
  /** Every provider with both configurations. */
  findAll(): Promise<SsoProviderRecord[]>;
  /** The provider with both configurations; null when there is none. */
  findById(id: number): Promise<SsoProviderRecord | null>;
  /** The provider of this type with only the configuration of that type. */
  findByTypeAndId(type: SSOProviderType, id: number): Promise<SsoProviderRecord | null>;
  /** Creates the provider, its configuration and the audit event together; returns the stored provider. */
  create(draft: SsoProviderDraft, audit: (created: SsoProviderRecord) => AuditEvent): Promise<SsoProviderRecord>;
  /**
   * Applies the changes `plan` derives from the provider as stored at that moment (it may throw to refuse), and
   * records the audit event (when it returns one) in the same unit. Null when the provider does not exist.
   */
  update(
    id: number,
    plan: (current: SsoProviderRecord) => SsoProviderChanges,
    audit: (updated: SsoProviderRecord) => AuditEvent | null,
  ): Promise<SsoProviderRecord | null>;
  /** Deletes the provider and its configurations, with the audit event. */
  remove(id: number, audit: (removed: SsoProviderRecord) => AuditEvent): Promise<void>;
}
