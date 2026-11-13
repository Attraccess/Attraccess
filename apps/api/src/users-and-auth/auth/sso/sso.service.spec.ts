import { registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  SSOProviderSAMLConfiguration,
} from '@attraccess/database-entities';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';
import { ssoAuditSnapshot } from './audit/provider-audit';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };

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

      const result = await fixture.service.createProvider(createProviderDto, ACTOR);

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
      // Recorded inside the create transaction, with a snapshot that never carries the client secret.
      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'sso', action: 'sso.provider.created', actor: ACTOR }),
        expect.anything(),
      );
      expect(JSON.stringify(fixture.audit.record.mock.calls)).not.toContain('new-client-secret');
    });

    it('rolls back provider creation when the committed provider cannot be reloaded', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(
        fixture.service.createProvider(
          {
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
          },
          ACTOR,
        ),
      ).rejects.toThrow('Provider not found after create');
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
    });
  });

  describe('updateProvider', () => {
    it('should update an existing provider', async () => {
      const updateDto = { name: 'Updated Provider' };

      jest.spyOn(fixture.ssoProviderRepository, 'update').mockResolvedValueOnce(undefined);

      const result = await fixture.service.updateProvider(1, updateDto, ACTOR);

      expect(fixture.ssoProviderRepository.update).toHaveBeenCalledWith(1, { name: updateDto.name });
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
    });

    it('does not commit a provider update when its configuration write fails', async () => {
      fixture.oidcConfigRepository.update.mockRejectedValueOnce(new Error('configuration write failed'));

      await expect(
        fixture.service.updateProvider(1, { oidcConfiguration: { issuer: 'https://changed.example.com' } }, ACTOR),
      ).rejects.toThrow('configuration write failed');
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
      expect(fixture.ssoProviderRepository.update).not.toHaveBeenCalled();
    });

    it('rolls back a provider update when the committed provider cannot be reloaded', async () => {
      jest
        .spyOn(fixture.ssoProviderRepository, 'findOne')
        .mockResolvedValueOnce(fixture.mockSSOProviderWithOIDCConfig)
        .mockResolvedValueOnce(null);

      await expect(fixture.service.updateProvider(1, { name: 'Changed Provider' }, ACTOR)).rejects.toThrow(
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
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, clientSecret: '' },
        },
        ACTOR,
      );

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should not update clientSecret when it is null', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, clientSecret: null },
        },
        ACTOR,
      );

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should not update clientSecret when it is omitted', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate },
        },
        ACTOR,
      );

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('clientSecret');
    });

    it('should encrypt and update clientSecret when a new value is provided', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, clientSecret: 'new-secret' },
        },
        ACTOR,
      );

      expect(fixture.encryptionService.encrypt).toHaveBeenCalledWith('new-secret');
      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('clientSecret', 'enc:new-secret');
    });
  });

  it('stores emptied OIDC lists as null so they never hydrate as [""]', async () => {
    await fixture.service.updateProvider(
      1,
      {
        oidcConfiguration: {
          scopes: [],
          usernameClaimPaths: [],
          emailClaimPaths: [],
          roleClaimPaths: [],
        },
      },
      ACTOR,
    );
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { scopes: null, usernameClaimPaths: null, emailClaimPaths: null, roleClaimPaths: null },
    );
    await fixture.service.updateProvider(1, { oidcConfiguration: { scopes: ['email'], roleClaimPaths: null } }, ACTOR);
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { scopes: ['email'], roleClaimPaths: null },
    );
  });

  it('updates, preserves omitted and clears nullable OIDC logout settings independently', async () => {
    const settings = {
      endSessionURL: 'https://idp.example/logout',
      jwksURL: 'https://idp.example/jwks',
      signingAlgorithms: ['RS256'],
    };
    await fixture.service.updateProvider(1, { oidcConfiguration: settings }, ACTOR);
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith({ ssoProviderId: 1 }, settings);
    await fixture.service.updateProvider(1, { oidcConfiguration: { clientId: 'changed-client' } }, ACTOR);
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { clientId: 'changed-client' },
    );
    await fixture.service.updateProvider(
      1,
      {
        oidcConfiguration: { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
      },
      ACTOR,
    );
    expect(fixture.oidcConfigRepository.update).toHaveBeenLastCalledWith(
      { ssoProviderId: 1 },
      { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
    );
    await expect(
      fixture.service.updateProvider(1, { oidcConfiguration: { signingAlgorithms: ['HS256'] } }, ACTOR),
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
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, roleMappings: asMappings(null) },
        },
        ACTOR,
      );

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('roleMappings', null);
    });

    it('persists an empty object (emptied mapping table)', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, roleMappings: {} },
        },
        ACTOR,
      );

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).toHaveProperty('roleMappings');
      expect(updateCall[1].roleMappings).toEqual({});
    });

    it('leaves roleMappings untouched when the field is omitted', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate },
        },
        ACTOR,
      );

      const updateCall = (fixture.oidcConfigRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[1]).not.toHaveProperty('roleMappings');
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider and its OIDC configuration', async () => {
      await fixture.service.deleteProvider(1, ACTOR);

      expect(fixture.oidcConfigRepository.delete).toHaveBeenCalledWith(fixture.mockOIDCConfig.id);
      expect(fixture.ssoProviderRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(null);

      await expect(fixture.service.deleteProvider(999, ACTOR)).rejects.toThrow(NotFoundException);
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

    it('rejects SAML logout updates that would leave the provider without an IdP issuer', async () => {
      jest.mocked(fixture.samlConfigRepository.findOne).mockResolvedValue({
        ...baseSamlConfig,
        idpIssuer: 'https://idp.example.com',
        logoutURL: 'https://idp.example.com/logout',
        spSigningCertificate: 'SPCERT',
        spSigningKeyEncrypted: 'enc:key',
      } as SSOProviderSAMLConfiguration);
      const update = (
        fixture.service as unknown as { updateSAMLConfiguration: (id: number, config: object) => Promise<unknown> }
      ).updateSAMLConfiguration.bind(fixture.service);

      await expect(update(1, { idpIssuer: ' ' })).rejects.toThrow('SAML logout requires an IdP issuer');
      await expect(update(1, { idpIssuer: null, logoutURL: null })).resolves.toMatchObject({
        issuer: baseSamlConfig.issuer,
      });
      expect(fixture.samlConfigRepository.update).toHaveBeenCalledTimes(1);
      expect(fixture.samlConfigRepository.update).toHaveBeenCalledWith(
        { ssoProviderId: 1 },
        { idpIssuer: null, logoutURL: null },
      );
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

  describe('provider lifecycle audit', () => {
    const oidcProvider = {
      issuer: 'https://new-issuer.com',
      authorizationURL: 'https://new-issuer.com/auth',
      tokenURL: 'https://new-issuer.com/token',
      userInfoURL: 'https://new-issuer.com/userinfo',
      clientId: 'new-client-id',
      clientSecret: 'new-client-secret',
    };

    /** The manager of the next provider transaction, so a test can tell it apart from any other manager. */
    function nextTransactionManager() {
      const manager = {
        getRepository: (entity: unknown) =>
          entity === SSOProvider
            ? fixture.ssoProviderRepository
            : entity === SSOProviderOIDCConfiguration
              ? fixture.oidcConfigRepository
              : fixture.samlConfigRepository,
      };
      (fixture.ssoProviderRepository.manager.transaction as jest.Mock).mockImplementationOnce(
        (callback: (transactionManager: typeof manager) => Promise<unknown>) => callback(manager),
      );
      return manager;
    }

    beforeEach(() => {
      fixture.audit.record.mockClear();
    });

    it('records the created provider with the create transaction manager', async () => {
      const manager = nextTransactionManager();

      await fixture.service.createProvider(
        { name: 'New Provider', type: SSOProviderType.OIDC, oidcConfiguration: oidcProvider },
        ACTOR,
      );

      expect(fixture.audit.record).toHaveBeenCalledTimes(1);
      expect(fixture.audit.record).toHaveBeenCalledWith(
        {
          domain: 'sso',
          action: 'sso.provider.created',
          operationId: expect.any(String),
          actor: ACTOR,
          subject: { type: 'sso.provider', id: 1 },
          details: { before: 'null', after: ssoAuditSnapshot(fixture.mockSSOProviderWithOIDCConfig) },
        },
        manager,
      );
    });

    it('keeps provider creation successful when the audit receipt is unavailable', async () => {
      fixture.audit.record.mockResolvedValueOnce({ status: 'unavailable' });

      await expect(
        fixture.service.createProvider(
          { name: 'New Provider', type: SSOProviderType.OIDC, oidcConfiguration: oidcProvider },
          ACTOR,
        ),
      ).resolves.toEqual(fixture.mockSSOProviderWithOIDCConfig);
      expect(fixture.audit.record).toHaveBeenCalledTimes(1);
    });

    it('records the changed fields and rotated secrets of an update with the update transaction manager', async () => {
      const before = { ...fixture.mockSSOProviderWithOIDCConfig, oidcConfiguration: { ...fixture.mockOIDCConfig } };
      const after = {
        ...before,
        name: 'Renamed Provider',
        oidcConfiguration: {
          ...before.oidcConfiguration,
          issuer: 'https://changed.example.com',
          clientSecret: 'rotated-client-secret',
        },
      } as SSOProvider;
      jest.spyOn(fixture.ssoProviderRepository, 'findOne').mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      const manager = nextTransactionManager();

      await fixture.service.updateProvider(
        1,
        {
          name: 'Renamed Provider',
          oidcConfiguration: { issuer: 'https://changed.example.com', clientSecret: 'rotated-client-secret' },
        },
        ACTOR,
      );

      expect(fixture.audit.record).toHaveBeenCalledTimes(1);
      expect(fixture.audit.record).toHaveBeenCalledWith(
        {
          domain: 'sso',
          action: 'sso.provider.updated',
          operationId: expect.any(String),
          actor: ACTOR,
          subject: { type: 'sso.provider', id: 1 },
          details: {
            before: ssoAuditSnapshot(before),
            after: ssoAuditSnapshot(after),
            changes: JSON.stringify({ changed: ['name', 'configuration.issuer'], rotated: ['clientSecret'] }),
          },
        },
        manager,
      );
      expect(JSON.stringify(fixture.audit.record.mock.calls)).not.toMatch(/rotated-client-secret|test-client-secret/);
    });

    it('records nothing for an update that changes nothing', async () => {
      await fixture.service.updateProvider(1, {}, ACTOR);
      await fixture.service.updateProvider(
        1,
        { oidcConfiguration: { clientSecret: fixture.mockOIDCConfig.clientSecret } },
        ACTOR,
      );

      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalledTimes(2);
      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records nothing for an update that fails before commit', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'update').mockRejectedValueOnce(new Error('name write failed'));

      await expect(fixture.service.updateProvider(1, { name: 'Renamed Provider' }, ACTOR)).rejects.toThrow(
        'name write failed',
      );

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records the deleted provider with the delete transaction manager', async () => {
      const manager = nextTransactionManager();

      await fixture.service.deleteProvider(1, ACTOR);

      expect(fixture.audit.record).toHaveBeenCalledTimes(1);
      expect(fixture.audit.record).toHaveBeenCalledWith(
        {
          domain: 'sso',
          action: 'sso.provider.deleted',
          operationId: expect.any(String),
          actor: ACTOR,
          subject: { type: 'sso.provider', id: 1 },
          details: { before: ssoAuditSnapshot(fixture.mockSSOProviderWithOIDCConfig), after: 'null' },
        },
        manager,
      );
    });

    it('records nothing for a delete that fails before commit', async () => {
      jest.spyOn(fixture.ssoProviderRepository, 'delete').mockRejectedValueOnce(new Error('delete failed'));

      await expect(fixture.service.deleteProvider(1, ACTOR)).rejects.toThrow('delete failed');

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });
  });
});
