import { SSOProviderType } from '@attraccess/database-entities';
import { registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
import { NotFoundException } from '@nestjs/common';

export function registerCreateProviderCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
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

      const result = await fixture.service.createProvider(createProviderDto);

      expect(fixture.ssoProviderRepository.create).toHaveBeenCalledWith({
        name: createProviderDto.name,
        type: createProviderDto.type,
      });
      expect(fixture.ssoProviderRepository.save).toHaveBeenCalled();
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
    });

    it('rolls back provider creation when the committed provider cannot be reloaded', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(
        fixture.service.createProvider({
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
        }),
      ).rejects.toThrow('Provider not found after create');
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
    });
  });
}

export function registerDeleteProviderCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  describe('deleteProvider', () => {
    it('should delete a provider and its OIDC configuration', async () => {
      await fixture.service.deleteProvider(1);

      expect(fixture.oidcConfigRepository.delete).toHaveBeenCalledWith(fixture.mockOIDCConfig.id);
      expect(fixture.ssoProviderRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(fixture.service.deleteProvider(999)).rejects.toThrow(NotFoundException);
    });
  });
}

export function registerGetAllProvidersCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  describe('getAllProviders', () => {
    it('should return an array of SSO providers', async () => {
      const result = await fixture.service.getAllProviders();
      expect(result).toEqual([fixture.mockSSOProvider]);
      expect(fixture.ssoProviderRepository.find).toHaveBeenCalled();
    });
  });
}

export function registerGetProviderByIdCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  describe('getProviderById', () => {
    it('should return a single SSO provider by ID', async () => {
      const result = await fixture.service.getProviderById(1);
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
      expect(fixture.ssoProviderRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['oidcConfiguration', 'samlConfiguration'],
      });
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);
      await expect(fixture.service.getProviderById(999)).rejects.toThrow(NotFoundException);
    });
  });
}

export function registerGetProviderByTypeAndIdCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  describe('getProviderByTypeAndId', () => {
    it('should return a single SSO provider with OIDC configuration', async () => {
      const result = await fixture.service.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, 1);
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
      expect(fixture.ssoProviderRepository.findOne).toHaveBeenCalledWith({
        where: { type: SSOProviderType.OIDC, id: 1 },
        relations: ['oidcConfiguration'],
      });
    });
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}

export function registerUpdateOidcconfigurationClientSecretHandlingCases(
  fixture: ReturnType<typeof registerSsoServiceFixture>,
) {
  describe('updateOIDCConfiguration clientSecret handling', () => {
    const baseOidcUpdate = {
      issuer: 'https://test-issuer.com',
      authorizationURL: 'https://test-issuer.com/auth',
      tokenURL: 'https://test-issuer.com/token',
      userInfoURL: 'https://test-issuer.com/userinfo',
      clientId: 'test-client-id',
    };

    it('should not update clientSecret when it is an empty string (frontend placeholder)', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate, clientSecret: '' },
      });

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should not update clientSecret when it is null', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate, clientSecret: null },
      });

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should not update clientSecret when it is omitted', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate },
      });

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should encrypt and update clientSecret when a new value is provided', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate, clientSecret: 'new-secret' },
      });

      expect(fixture.encryptionService.encrypt).toHaveBeenCalledWith('new-secret');
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('clientSecret', 'enc:new-secret');
    });
  });
}

export function registerUpdateOidcconfigurationRoleMappingsHandlingCases(
  fixture: ReturnType<typeof registerSsoServiceFixture>,
) {
  describe('updateOIDCConfiguration roleMappings handling', () => {
    const baseOidcUpdate = {
      issuer: 'https://test-issuer.com',
      authorizationURL: 'https://test-issuer.com/auth',
      tokenURL: 'https://test-issuer.com/token',
      userInfoURL: 'https://test-issuer.com/userinfo',
      clientId: 'test-client-id',
    };
    const asMappings = (value: unknown) => value as Record<string, string[]>;

    it('persists explicit null on roleMappings to clear mappings', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate, roleMappings: asMappings(null) },
      });

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('roleMappings', null);
    });

    it('persists an empty object (emptied mapping table)', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate, roleMappings: {} },
      });

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('roleMappings');
      expect(updateCall[1].roleMappings).toEqual({});
    });

    it('leaves roleMappings untouched when the field is omitted', async () => {
      await fixture.service.updateProvider(1, {
        oidcConfiguration: { ...baseOidcUpdate },
      });

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('roleMappings');
    });
  });
}
