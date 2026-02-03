import { Test, TestingModule } from '@nestjs/testing';
import { SSOService } from './sso.service';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
} from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LicenseService } from '../../../license/license.service';
import { EncryptionService } from '../../../encryption/encryption.service';
import { CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';

const SSOProviderRepository = getRepositoryToken(SSOProvider);
const SSOProviderOIDCConfigurationRepository = getRepositoryToken(SSOProviderOIDCConfiguration);
const SSOProviderSAMLConfigurationRepository = getRepositoryToken(SSOProviderSAMLConfiguration);

describe('SsoService', () => {
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
          },
        },
      ],
    }).compile();

    service = module.get<SSOService>(SSOService);
    ssoProviderRepository = module.get<Repository<SSOProvider>>(SSOProviderRepository);
    oidcConfigRepository = module.get<Repository<SSOProviderOIDCConfiguration>>(SSOProviderOIDCConfigurationRepository);
    samlConfigRepository = module.get<Repository<SSOProviderSAMLConfiguration>>(SSOProviderSAMLConfigurationRepository);
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllProviders', () => {
    it('should return an array of SSO providers', async () => {
      const result = await service.getAllProviders();
      expect(result).toEqual([mockSSOProvider]);
      expect(ssoProviderRepository.find).toHaveBeenCalled();
    });
  });

  describe('getProviderByTypeAndId', () => {
    it('should return a single SSO provider with OIDC configuration', async () => {
      const result = await service.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, 1);
      expect(result).toEqual(mockSSOProviderWithOIDCConfig);
      expect(ssoProviderRepository.findOne).toHaveBeenCalledWith({
        where: { type: SSOProviderType.OIDC, id: 1 },
        relations: ['oidcConfiguration'],
      });
    });
  });

  describe('getProviderById', () => {
    it('should return a single SSO provider by ID', async () => {
      const result = await service.getProviderById(1);
      expect(result).toEqual(mockSSOProviderWithOIDCConfig);
      expect(ssoProviderRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['oidcConfiguration', 'samlConfiguration'],
      });
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.getProviderById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProvider', () => {
    it('should create a new OIDC provider with configuration', async () => {
      const createProviderDto = {
        name: 'New Provider',
        type: SSOProviderType.OIDC,
        oidcConfiguration: {
          issuer: 'https://new-issuer.com',
          authorizationURL: 'https://new-issuer.com/auth',
          tokenURL: 'https://new-issuer.com/token',
          userInfoURL: 'https://new-issuer.com/userinfo',
          clientId: 'new-client-id',
          clientSecret: 'new-client-secret',
        },
      };

      const result = await service.createProvider(createProviderDto);

      expect(ssoProviderRepository.create).toHaveBeenCalledWith({
        name: createProviderDto.name,
        type: createProviderDto.type,
      });
      expect(ssoProviderRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockSSOProviderWithOIDCConfig);
    });
  });

  describe('updateProvider', () => {
    it('should update an existing provider', async () => {
      const updateDto = { name: 'Updated Provider' };

      jest.spyOn(ssoProviderRepository, 'update').mockResolvedValueOnce(undefined);

      const result = await service.updateProvider(1, updateDto);

      expect(ssoProviderRepository.update).toHaveBeenCalledWith(1, { name: updateDto.name });
      expect(result).toEqual(mockSSOProviderWithOIDCConfig);
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider and its OIDC configuration', async () => {
      await service.deleteProvider(1);

      expect(oidcConfigRepository.delete).toHaveBeenCalledWith(mockOIDCConfig.id);
      expect(ssoProviderRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(service.deleteProvider(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('SAML configuration helpers', () => {
    const baseSamlConfig = {
      entryPoint: 'https://idp.example.com/sso',
      issuer: 'https://app.example.com',
      certificate: '-----BEGIN CERTIFICATE-----MIIC-----END CERTIFICATE-----',
      signRequest: false,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      forceAuthn: false,
    };

    const callCreateSAMLConfiguration = (config: CreateSAMLConfigurationDto) =>
      (
        service as unknown as {
          createSAMLConfiguration: (
            providerId: number,
            samlConfig: CreateSAMLConfigurationDto,
          ) => Promise<SSOProviderSAMLConfiguration>;
        }
      ).createSAMLConfiguration(1, config);

    it('throws when enabling signing without materials', async () => {
      await expect(
        callCreateSAMLConfiguration({
          ...baseSamlConfig,
          signRequest: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('encrypts private key material when provided', async () => {
      jest.spyOn(samlConfigRepository, 'create');

      await callCreateSAMLConfiguration({
        ...baseSamlConfig,
        signRequest: true,
        spSigningCertificate: '-----BEGIN CERTIFICATE-----ABC-----END CERTIFICATE-----',
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith(expect.stringContaining('BEGIN PRIVATE KEY'));
      expect(samlConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spSigningCertificate: 'ABC',
          spSigningKeyEncrypted: expect.stringContaining('BEGIN PRIVATE KEY'),
          spSigningKeyEncryptionKeyId: 'default',
        }),
      );
    });
  });
});
