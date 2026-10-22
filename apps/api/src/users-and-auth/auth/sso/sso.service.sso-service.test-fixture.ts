import { SsoPersistence, SSO_WRITES } from '../persistence/port';
import { operationTransactionsFake } from '../../../database/testing/operation-transactions.test-fixture';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderType } from '@attraccess/application-models';
import { EncryptionService } from '../../../encryption/encryption.service';
import { SSOService } from './sso.service';
export function registerSsoServiceFixture() {
  let service: SSOService;

  let persistence: jest.Mocked<SsoPersistence>;
  let driver: ReturnType<typeof operationTransactionsFake>;

  let encryptionService: EncryptionService;

  const mockOIDCConfig = {
    id: 1,
    ssoProviderId: 1,
    issuer: 'https://test-issuer.com',
    authorizationURL: 'https://test-issuer.com/auth',
    tokenURL: 'https://test-issuer.com/token',
    userInfoURL: 'https://test-issuer.com/userinfo',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    createdAt: new Date(),
    updatedAt: new Date(),
    ssoProvider: null,
  } as SSOProviderOIDCConfiguration;

  const mockSSOProvider = {
    id: 1,
    name: 'Test Provider',
    type: SSOProviderType.OIDC,
    createdAt: new Date(),
    updatedAt: new Date(),
    oidcConfiguration: mockOIDCConfig,
  } as SSOProvider;

  mockOIDCConfig.ssoProvider = mockSSOProvider;

  const mockSSOProviderWithOIDCConfig = { ...mockSSOProvider };

  beforeEach(() => {
    const provider = jest.fn().mockResolvedValue(mockSSOProviderWithOIDCConfig);
    persistence = {
      allProviders: jest.fn().mockResolvedValue([mockSSOProvider]),
      providerById: provider,
      providerByType: provider,
      createProvider: jest.fn().mockResolvedValue(mockSSOProvider),
      renameProvider: jest.fn(),
      removeProvider: jest.fn(),
      createOidcConfiguration: jest.fn().mockResolvedValue(mockOIDCConfig),
      oidcConfiguration: jest.fn().mockResolvedValue(mockOIDCConfig),
      patchOidcConfiguration: jest.fn(),
      removeOidcConfiguration: jest.fn(),
      createSamlConfiguration: jest.fn().mockResolvedValue({}),
      samlConfiguration: jest.fn().mockResolvedValue({
        id: 99,
        ssoProviderId: 1,
        entryPoint: 'https://idp',
        issuer: 'https://sp',
        certificate: 'CERT',
        signRequest: false,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: true,
        forceAuthn: false,
      }),
      patchSamlConfiguration: jest.fn(),
      removeSamlConfiguration: jest.fn(),
    };
    driver = operationTransactionsFake();
    driver.bind(SSO_WRITES, persistence);
    encryptionService = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
      isEncrypted: jest.fn((value: string) => value.startsWith('enc:')),
      encryptIfPlain: jest.fn((value: string) => (value.startsWith('enc:') ? value : `enc:${value}`)),
      decryptIfEncrypted: jest.fn((value: string) => (value?.startsWith('enc:') ? value.replace(/^enc:/, '') : value)),
    } as unknown as EncryptionService;
    service = new SSOService(
      persistence,
      driver.transactions,
      { verifyLicense: jest.fn().mockResolvedValue(undefined) } as never,
      encryptionService,
    );
  });
  return {
    get service() {
      return service;
    },
    get persistence() {
      return persistence;
    },
    get driver() {
      return driver;
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
  };
}
