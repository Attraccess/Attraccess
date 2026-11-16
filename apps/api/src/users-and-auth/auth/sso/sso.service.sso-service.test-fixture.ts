import { AUDIT_RECORDER, type AuditEvent } from '../../../audit/recorder/audit-event';
import { SSOProviderType } from '@attraccess/application-models';
import type {
  SsoOidcConfigurationRecord,
  SsoProviderRecord,
  SsoSamlConfigurationRecord,
} from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '../../../encryption/encryption.service';
import { LicenseService } from '../../../license/license.service';
import {
  SSO_PROVIDER_STORE,
  type SsoProviderChanges,
  type SsoProviderDraft,
  type SsoProviderStore,
} from './providers/sso-provider.port';
import { SSOService } from './sso.service';

const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

/** Stands in for the transaction the real store opens: the audit row is recorded with it. */
export const PROVIDER_TRANSACTION = { transaction: 'sso-provider' };

/**
 * An in-memory SsoProviderStore with the contract of the real one: the plan runs against the stored provider, the
 * audit callback runs once the change is applied and its event is recorded with the unit's transaction.
 */
export class FakeSsoProviderStore implements SsoProviderStore {
  /** The provider as stored, and (when an update changes it) as stored afterwards. */
  provider: SsoProviderRecord;
  updatedProvider: SsoProviderRecord | undefined;
  readonly drafts: SsoProviderDraft[] = [];
  readonly changes: SsoProviderChanges[] = [];
  readonly removed: number[] = [];

  constructor(provider: SsoProviderRecord) {
    this.provider = provider;
  }

  get lastChanges(): SsoProviderChanges | undefined {
    return this.changes[this.changes.length - 1];
  }

  findAll = jest.fn(async (): Promise<SsoProviderRecord[]> => [this.provider]);
  findById = jest.fn(async (): Promise<SsoProviderRecord | null> => this.provider);
  findByTypeAndId = jest.fn(async (): Promise<SsoProviderRecord | null> => this.provider);

  create = jest.fn(async (draft: SsoProviderDraft, auditEvent: (created: SsoProviderRecord) => AuditEvent) => {
    this.drafts.push(draft);
    await audit.record(auditEvent(this.provider), PROVIDER_TRANSACTION as never);
    return this.provider;
  });

  update = jest.fn(
    async (
      _id: number,
      plan: (current: SsoProviderRecord) => SsoProviderChanges,
      auditEvent: (updated: SsoProviderRecord) => AuditEvent | null,
    ) => {
      this.changes.push(plan(this.provider));
      const after = this.updatedProvider ?? this.provider;
      const event = auditEvent(after);
      if (event) await audit.record(event, PROVIDER_TRANSACTION as never);
      return after as SsoProviderRecord | null;
    },
  );

  remove = jest.fn(async (id: number, auditEvent: (removed: SsoProviderRecord) => AuditEvent) => {
    this.removed.push(id);
    await audit.record(auditEvent(this.provider), PROVIDER_TRANSACTION as never);
  });
}

export function registerSsoServiceFixture() {
  let service: SSOService;
  let store: FakeSsoProviderStore;
  let encryptionService: EncryptionService;

  const mockOIDCConfig: SsoOidcConfigurationRecord = {
    id: 1,
    ssoProviderId: 1,
    issuer: 'https://test-issuer.com',
    authorizationURL: 'https://test-issuer.com/auth',
    tokenURL: 'https://test-issuer.com/token',
    userInfoURL: 'https://test-issuer.com/userinfo',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    scopes: null,
    usernameClaimPaths: null,
    emailClaimPaths: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSSOProvider: SsoProviderRecord = {
    id: 1,
    name: 'Test Provider',
    type: SSOProviderType.OIDC,
    createdAt: new Date(),
    updatedAt: new Date(),
    oidcConfiguration: mockOIDCConfig,
  };

  const mockSSOProviderWithOIDCConfig = mockSSOProvider;

  const storedSamlConfig: SsoSamlConfigurationRecord = {
    id: 99,
    ssoProviderId: 1,
    entryPoint: 'https://idp',
    issuer: 'https://sp',
    certificate: 'CERT',
    signRequest: false,
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: true,
    forceAuthn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    store = new FakeSsoProviderStore(mockSSOProvider);
    audit.record.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AUDIT_RECORDER, useValue: audit },
        SSOService,
        { provide: SSO_PROVIDER_STORE, useValue: store },
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((value: string) => `enc:${value}`),
            decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
            isEncrypted: jest.fn((value: string) => value.startsWith('enc:')),
            encryptIfPlain: jest.fn((value: string) => (value.startsWith('enc:') ? value : `enc:${value}`)),
            decryptIfEncrypted: jest.fn((value: string) =>
              value?.startsWith('enc:') ? value.replace(/^enc:/, '') : value,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<SSOService>(SSOService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });
  return {
    get audit() {
      return audit;
    },
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    get encryptionService() {
      return encryptionService;
    },
    get mockOIDCConfig() {
      return mockOIDCConfig;
    },
    get mockSSOProvider() {
      return mockSSOProvider;
    },
    get mockSSOProviderWithOIDCConfig() {
      return mockSSOProviderWithOIDCConfig;
    },
    get storedSamlConfig() {
      return storedSamlConfig;
    },
  };
}
