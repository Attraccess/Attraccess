import { Test, TestingModule } from '@nestjs/testing';
import { SSOService } from './sso.service';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { LicenseService } from '../../../license/license.service';

const SSOProviderRepository = getRepositoryToken(SSOProvider);
const SSOProviderOIDCConfigurationRepository = getRepositoryToken(SSOProviderOIDCConfiguration);

describe('SsoService', () => {
  let service: SSOService;
  let ssoProviderRepository: Repository<SSOProvider>;
  let oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>;

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
      ],
    }).compile();

    service = module.get<SSOService>(SSOService);
    ssoProviderRepository = module.get<Repository<SSOProvider>>(SSOProviderRepository);
    oidcConfigRepository = module.get<Repository<SSOProviderOIDCConfiguration>>(SSOProviderOIDCConfigurationRepository);
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
        relations: ['oidcConfiguration'],
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
});
