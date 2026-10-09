import { registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
import { SSOProviderType, SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';

describe('SsoService', () => {
  const fixture = registerSsoServiceFixture();

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('getAllProviders', () => {
    it('should return an array of SSO providers', async () => {
      const result = await fixture.service.getAllProviders();
      expect(result).toEqual([fixture.mockSSOProvider]);
      expect(fixture.ssoProviderRepository.find).toHaveBeenCalled();
    });
  });

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
          endSessionURL: 'https://new-issuer.com/logout',
          jwksURL: 'https://new-issuer.com/jwks',
          signingAlgorithms: ['RS256'],
        },
      };

      const result = await fixture.service.createProvider(createProviderDto);

      expect(fixture.ssoProviderRepository.create).toHaveBeenCalledWith({
        name: createProviderDto.name,
        type: createProviderDto.type,
      });
      expect(fixture.ssoProviderRepository.save).toHaveBeenCalled();
      expect(fixture.oidcConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          endSessionURL: 'https://new-issuer.com/logout',
          jwksURL: 'https://new-issuer.com/jwks',
          signingAlgorithms: ['RS256'],
          clientSecret: 'enc:new-client-secret',
        }),
      );
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

  describe('updateProvider', () => {
    it('should update an existing provider', async () => {
      const updateDto = { name: 'Updated Provider' };

      jest.spyOn(fixture.ssoProviderRepository, 'update').mockResolvedValueOnce(undefined);

      const result = await fixture.service.updateProvider(1, updateDto);

      expect(fixture.ssoProviderRepository.update).toHaveBeenCalledWith(1, { name: updateDto.name });
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
    });

    it('does not commit a provider update when its configuration write fails', async () => {
      fixture.oidcConfigRepository.update.mockRejectedValueOnce(new Error('configuration write failed'));

      await expect(
        fixture.service.updateProvider(1, { oidcConfiguration: { issuer: 'https://changed.example.com' } }),
      ).rejects.toThrow('configuration write failed');
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
      expect(fixture.ssoProviderRepository.update).not.toHaveBeenCalled();
    });

    it('rolls back a provider update when the committed provider cannot be reloaded', async () => {
      jest
        .spyOn(fixture.ssoProviderRepository, 'findOne')
        .mockResolvedValueOnce(fixture.mockSSOProviderWithOIDCConfig)
        .mockResolvedValueOnce(null);

      await expect(fixture.service.updateProvider(1, { name: 'Changed Provider' })).rejects.toThrow(
        'Provider not found after update',
      );
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
    });
  });

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

  it('updates, preserves omitted and clears nullable OIDC logout settings independently', async () => {
    const settings = {
      endSessionURL: 'https://idp.example/logout',
      jwksURL: 'https://idp.example/jwks',
      signingAlgorithms: ['RS256'],
    };
    await fixture.service.updateProvider(1, { oidcConfiguration: settings });
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith({ ssoProviderId: 1 }, settings);
    await fixture.service.updateProvider(1, { oidcConfiguration: { clientId: 'changed-client' } });
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { clientId: 'changed-client' },
    );
    await fixture.service.updateProvider(1, {
      oidcConfiguration: { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
    });
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
    );
    await expect(
      fixture.service.updateProvider(1, { oidcConfiguration: { signingAlgorithms: ['HS256'] } }),
    ).rejects.toThrow('Unsupported');
  });

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
        fixture.service as unknown as {
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

    it('requires the IdP issuer and signing material when enabling SAML logout', async () => {
      await expect(
        callCreateSAMLConfiguration({ ...baseSamlConfig, logoutURL: 'https://idp.example/logout' }),
      ).rejects.toThrow('IdP issuer');
      await expect(
        callCreateSAMLConfiguration({
          ...baseSamlConfig,
          idpIssuer: 'https://idp.example',
          logoutURL: 'https://idp.example/logout',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('encrypts private key material when provided', async () => {
      jest.spyOn(fixture.samlConfigRepository, 'create');

      await callCreateSAMLConfiguration({
        ...baseSamlConfig,
        signRequest: true,
        spSigningCertificate: '-----BEGIN CERTIFICATE-----ABC-----END CERTIFICATE-----',
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
      });

      expect(fixture.encryptionService.encrypt).toHaveBeenCalledWith(expect.stringContaining('BEGIN PRIVATE KEY'));
      expect(fixture.samlConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spSigningCertificate: 'ABC',
          spSigningKeyEncrypted: expect.stringContaining('BEGIN PRIVATE KEY'),
          spSigningKeyEncryptionKeyId: 'default',
        }),
      );
    });

    it('updates all SAML options and can explicitly clear sensitive signing material', async () => {
      jest
        .mocked(fixture.samlConfigRepository.findOne)
        .mockResolvedValue({ ...baseSamlConfig, spSigningKeyEncrypted: 'enc:old-key' } as SSOProviderSAMLConfiguration);
      const update = (
        fixture.service as unknown as { updateSAMLConfiguration: (id: number, config: object) => Promise<unknown> }
      ).updateSAMLConfiguration.bind(fixture.service);
      await update(1, {
        entryPoint: 'https://new-idp.example/sso',
        issuer: 'new-issuer',
        idpIssuer: 'https://new-idp.example',
        logoutURL: 'https://new-idp.example/logout',
        certificate: '-----BEGIN CERTIFICATE-----IDPCERT-----END CERTIFICATE-----',
        audience: 'audience',
        signRequest: true,
        wantAssertionsSigned: true,
        wantAuthnResponseSigned: true,
        forceAuthn: true,
        emailAttributeKeys: ['mail'],
        provisioningSecret: ' provisioning-secret ',
        roleMappings: { operator: ['staff'] },
        spSigningCertificate: '-----BEGIN CERTIFICATE-----SPCERT-----END CERTIFICATE-----',
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----new-secret-----END PRIVATE KEY-----',
      });
      expect(fixture.samlConfigRepository.update).toHaveBeenCalledWith(
        { ssoProviderId: 1 },
        expect.objectContaining({
          entryPoint: 'https://new-idp.example/sso',
          issuer: 'new-issuer',
          idpIssuer: 'https://new-idp.example',
          logoutURL: 'https://new-idp.example/logout',
          certificate: 'IDPCERT',
          audience: 'audience',
          signRequest: true,
          wantAssertionsSigned: true,
          wantAuthnResponseSigned: true,
          forceAuthn: true,
          emailAttributeKeys: ['mail'],
          roleMappings: { operator: ['staff'] },
          spSigningCertificate: 'SPCERT',
          spSigningKeyEncryptionKeyId: 'default',
        }),
      );
      expect(fixture.encryptionService.encrypt).toHaveBeenCalledWith('provisioning-secret');
      await update(1, {
        signRequest: false,
        provisioningSecret: '',
        roleMappings: null,
        spSigningCertificate: '',
        spSigningPrivateKey: '',
      });
      expect(fixture.samlConfigRepository.update).toHaveBeenLastCalledWith(
        { ssoProviderId: 1 },
        {
          signRequest: false,
          provisioningSecret: null,
          roleMappings: null,
          spSigningCertificate: null,
          spSigningKeyEncrypted: null,
          spSigningKeyEncryptionKeyId: null,
        },
      );
      jest.mocked(fixture.samlConfigRepository.findOne).mockResolvedValue(null);
      await expect(update(1, {})).rejects.toThrow('SAML configuration not found');
    });

    it('does not re-encrypt a canonical-equivalent signing key', async () => {
      jest.mocked(fixture.samlConfigRepository.findOne).mockResolvedValue({
        ...baseSamlConfig,
        spSigningKeyEncrypted: 'enc:-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
      } as SSOProviderSAMLConfiguration);

      await (
        fixture.service as unknown as {
          updateSAMLConfiguration: (providerId: number, config: { spSigningPrivateKey: string }) => Promise<void>;
        }
      ).updateSAMLConfiguration(1, {
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
      });

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      expect(fixture.samlConfigRepository.update).toHaveBeenCalledWith({ ssoProviderId: 1 }, {});
    });
  });
});
