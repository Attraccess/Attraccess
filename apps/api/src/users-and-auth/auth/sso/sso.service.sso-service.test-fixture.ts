import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
} from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../../encryption/encryption.service';
import { LicenseService } from '../../../license/license.service';
import { SSOService } from './sso.service';

const SSOProviderRepository = getRepositoryToken(SSOProvider);

const SSOProviderOIDCConfigurationRepository = getRepositoryToken(SSOProviderOIDCConfiguration);

const SSOProviderSAMLConfigurationRepository = getRepositoryToken(SSOProviderSAMLConfiguration);
export function registerSsoServiceFixture() {
  let service: SSOService;

  let ssoProviderRepository: Repository<SSOProvider>;

  let oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>;

  let samlConfigRepository: Repository<SSOProviderSAMLConfiguration>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SSOService,
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SSOProviderRepository,
          useValue: {
            find: jest.fn().mockResolvedValue([mockSSOProvider]),
            findOne: jest.fn().mockResolvedValue(mockSSOProviderWithOIDCConfig),
            create: jest.fn().mockReturnValue(mockSSOProvider),
            save: jest.fn().mockResolvedValue(mockSSOProvider),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SSOProviderOIDCConfigurationRepository,
          useValue: {
            create: jest.fn().mockReturnValue(mockOIDCConfig),
            save: jest.fn().mockResolvedValue(mockOIDCConfig),
            findOne: jest.fn().mockResolvedValue(mockOIDCConfig),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SSOProviderSAMLConfigurationRepository,
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({}),
            findOne: jest.fn().mockResolvedValue({
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
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
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
    ssoProviderRepository = module.get<Repository<SSOProvider>>(SSOProviderRepository);
    oidcConfigRepository = module.get<Repository<SSOProviderOIDCConfiguration>>(SSOProviderOIDCConfigurationRepository);
    samlConfigRepository = module.get<Repository<SSOProviderSAMLConfiguration>>(SSOProviderSAMLConfigurationRepository);
    Object.assign(ssoProviderRepository, {
      manager: {
        transaction: jest.fn(
          (callback: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>) =>
            callback({
              getRepository: (entity) =>
                entity === SSOProvider
                  ? ssoProviderRepository
                  : entity === SSOProviderOIDCConfiguration
                    ? oidcConfigRepository
                    : samlConfigRepository,
            }),
        ),
      },
    });
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });
  return {
    get service() {
      return service;
    },
    get ssoProviderRepository() {
      return ssoProviderRepository;
    },
    get oidcConfigRepository() {
      return oidcConfigRepository;
    },
    get samlConfigRepository() {
      return samlConfigRepository;
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
