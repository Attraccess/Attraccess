import { PROVIDER_TRANSACTION, registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
import { SSOProviderType } from '@attraccess/application-models';
import type { SsoProviderRecord, SsoSamlConfigurationRecord } from '@attraccess/application-models';
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
      expect(fixture.store.findAll).toHaveBeenCalled();
    });
  });

  describe('getProviderByTypeAndId', () => {
    it('should return a single SSO provider with OIDC configuration', async () => {
      const result = await fixture.service.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, 1);
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
      expect(fixture.store.findByTypeAndId).toHaveBeenCalledWith(SSOProviderType.OIDC, 1);
    });
  });

  describe('getProviderById', () => {
    it('should return a single SSO provider by ID', async () => {
      const result = await fixture.service.getProviderById(1);
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
      expect(fixture.store.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      fixture.store.findById.mockResolvedValueOnce(null);
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

      expect(fixture.store.drafts).toEqual([
        {
          name: createProviderDto.name,
          type: createProviderDto.type,
          oidcConfiguration: expect.objectContaining({
            endSessionURL: 'https://new-issuer.com/logout',
            jwksURL: 'https://new-issuer.com/jwks',
            signingAlgorithms: ['RS256'],
            clientSecret: 'enc:new-client-secret',
          }),
        },
      ]);
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
      // Recorded inside the create transaction, with a snapshot that never carries the client secret.
      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'sso', action: 'sso.provider.created', actor: ACTOR }),
        PROVIDER_TRANSACTION,
      );
      expect(JSON.stringify(fixture.audit.record.mock.calls)).not.toContain('new-client-secret');
    });

    it('refuses a provider without the configuration of its type before anything is stored', async () => {
      await expect(
        fixture.service.createProvider({ name: 'New Provider', type: SSOProviderType.OIDC }, ACTOR),
      ).rejects.toThrow('Missing OIDC configuration payload');
      await expect(
        fixture.service.createProvider({ name: 'New Provider', type: SSOProviderType.SAML }, ACTOR),
      ).rejects.toThrow('Missing SAML configuration payload');
      expect(fixture.store.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProvider', () => {
    it('should update an existing provider', async () => {
      const updateDto = { name: 'Updated Provider' };

      const result = await fixture.service.updateProvider(1, updateDto, ACTOR);

      expect(fixture.store.lastChanges).toEqual({ name: updateDto.name });
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
    });

    it('does not apply or audit an update the plan refuses', async () => {
      await expect(
        fixture.service.updateProvider(1, { oidcConfiguration: { signingAlgorithms: ['HS256'] } }, ACTOR),
      ).rejects.toThrow('Unsupported');
      expect(fixture.store.changes).toEqual([]);
      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('fails when the provider cannot be reloaded after the update', async () => {
      fixture.store.update.mockResolvedValueOnce(null);

      await expect(fixture.service.updateProvider(1, { name: 'Changed Provider' }, ACTOR)).rejects.toThrow(
        'Provider not found after update',
      );
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
      expect(fixture.store.lastChanges?.oidcConfiguration).not.toHaveProperty('clientSecret');
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
      expect(fixture.store.lastChanges?.oidcConfiguration).not.toHaveProperty('clientSecret');
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
      expect(fixture.store.lastChanges?.oidcConfiguration).not.toHaveProperty('clientSecret');
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
      expect(fixture.store.lastChanges?.oidcConfiguration).toHaveProperty('clientSecret', 'enc:new-secret');
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
    expect(fixture.store.lastChanges).toEqual({
      oidcConfiguration: { scopes: null, usernameClaimPaths: null, emailClaimPaths: null, roleClaimPaths: null },
    });
    await fixture.service.updateProvider(1, { oidcConfiguration: { scopes: ['email'], roleClaimPaths: null } }, ACTOR);
    expect(fixture.store.lastChanges).toEqual({ oidcConfiguration: { scopes: ['email'], roleClaimPaths: null } });
  });

  it('updates, preserves omitted and clears nullable OIDC logout settings independently', async () => {
    const settings = {
      endSessionURL: 'https://idp.example/logout',
      jwksURL: 'https://idp.example/jwks',
      signingAlgorithms: ['RS256'],
    };
    await fixture.service.updateProvider(1, { oidcConfiguration: settings }, ACTOR);
    expect(fixture.store.lastChanges).toEqual({ oidcConfiguration: settings });
    await fixture.service.updateProvider(1, { oidcConfiguration: { clientId: 'changed-client' } }, ACTOR);
    expect(fixture.store.lastChanges).toEqual({ oidcConfiguration: { clientId: 'changed-client' } });
    await fixture.service.updateProvider(
      1,
      {
        oidcConfiguration: { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
      },
      ACTOR,
    );
    expect(fixture.store.lastChanges).toEqual({
      oidcConfiguration: { endSessionURL: null, jwksURL: null, signingAlgorithms: null },
    });
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

      expect(fixture.store.lastChanges?.oidcConfiguration).toHaveProperty('roleMappings', null);
    });

    it('persists an empty object (emptied mapping table)', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate, roleMappings: {} },
        },
        ACTOR,
      );

      expect(fixture.store.lastChanges?.oidcConfiguration).toHaveProperty('roleMappings');
      expect(fixture.store.lastChanges?.oidcConfiguration?.roleMappings).toEqual({});
    });

    it('leaves roleMappings untouched when the field is omitted', async () => {
      await fixture.service.updateProvider(
        1,
        {
          oidcConfiguration: { ...baseOidcUpdate },
        },
        ACTOR,
      );

      expect(fixture.store.lastChanges?.oidcConfiguration).not.toHaveProperty('roleMappings');
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider and its configuration through the store', async () => {
      await fixture.service.deleteProvider(1, ACTOR);

      expect(fixture.store.removed).toEqual([1]);
    });

    it('should throw NotFoundException if provider not found', async () => {
      fixture.store.findById.mockResolvedValueOnce(null);

      await expect(fixture.service.deleteProvider(999, ACTOR)).rejects.toThrow(NotFoundException);
      expect(fixture.store.remove).not.toHaveBeenCalled();
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

    const storedSaml = (overrides: Partial<SsoSamlConfigurationRecord> = {}): SsoSamlConfigurationRecord => ({
      ...fixture.storedSamlConfig,
      ...overrides,
    });

    type SamlInternals = {
      buildSamlConfiguration: (config: CreateSAMLConfigurationDto) => Record<string, unknown>;
      buildSamlChanges: (config: object, existing: SsoSamlConfigurationRecord | undefined) => Record<string, unknown>;
    };
    const internals = () => fixture.service as unknown as SamlInternals;

    const callCreateSAMLConfiguration = async (config: CreateSAMLConfigurationDto) =>
      internals().buildSamlConfiguration(config);
    const callUpdate = async (existing: SsoSamlConfigurationRecord | undefined, config: object) =>
      internals().buildSamlChanges(config, existing);

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
      const created = await callCreateSAMLConfiguration({
        ...baseSamlConfig,
        signRequest: true,
        spSigningCertificate: '-----BEGIN CERTIFICATE-----ABC-----END CERTIFICATE-----',
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
      });

      expect(fixture.encryptionService.encrypt).toHaveBeenCalledWith(expect.stringContaining('BEGIN PRIVATE KEY'));
      expect(created).toEqual(
        expect.objectContaining({
          spSigningCertificate: 'ABC',
          spSigningKeyEncrypted: expect.stringContaining('BEGIN PRIVATE KEY'),
          spSigningKeyEncryptionKeyId: 'default',
        }),
      );
      expect(created).not.toHaveProperty('spSigningPrivateKey');
    });

    it('updates all SAML options and can explicitly clear sensitive signing material', async () => {
      const existing = storedSaml({ ...baseSamlConfig, spSigningKeyEncrypted: 'enc:old-key' });
      expect(
        await callUpdate(existing, {
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
        }),
      ).toEqual(
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
      expect(
        await callUpdate(existing, {
          signRequest: false,
          provisioningSecret: '',
          roleMappings: null,
          spSigningCertificate: '',
          spSigningPrivateKey: '',
        }),
      ).toEqual({
        signRequest: false,
        provisioningSecret: null,
        roleMappings: null,
        spSigningCertificate: null,
        spSigningKeyEncrypted: null,
        spSigningKeyEncryptionKeyId: null,
      });
      await expect(callUpdate(undefined, {})).rejects.toThrow('SAML configuration not found');
    });

    it('rejects SAML logout updates that would leave the provider without an IdP issuer', async () => {
      const existing = storedSaml({
        ...baseSamlConfig,
        idpIssuer: 'https://idp.example.com',
        logoutURL: 'https://idp.example.com/logout',
        spSigningCertificate: 'SPCERT',
        spSigningKeyEncrypted: 'enc:key',
      });

      await expect(callUpdate(existing, { idpIssuer: ' ' })).rejects.toThrow('SAML logout requires an IdP issuer');
      await expect(callUpdate(existing, { idpIssuer: null, logoutURL: null })).resolves.toEqual({
        idpIssuer: null,
        logoutURL: null,
      });
    });

    it('does not re-encrypt a canonical-equivalent signing key', async () => {
      const existing = storedSaml({
        ...baseSamlConfig,
        spSigningKeyEncrypted: 'enc:-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
      });

      const changes = await callUpdate(existing, {
        spSigningPrivateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
      });

      expect(fixture.encryptionService.encrypt).not.toHaveBeenCalled();
      expect(changes).toEqual({});
    });

    it('plans a SAML provider update from the stored SAML configuration', async () => {
      fixture.store.provider = {
        id: 1,
        name: 'SAML',
        type: SSOProviderType.SAML,
        createdAt: new Date(),
        updatedAt: new Date(),
        samlConfiguration: storedSaml(),
      };

      await fixture.service.updateProvider(1, { samlConfiguration: { forceAuthn: true } }, ACTOR);

      expect(fixture.store.lastChanges).toEqual({ samlConfiguration: { forceAuthn: true } });
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

    beforeEach(() => {
      fixture.audit.record.mockClear();
    });

    it('records the created provider with the create transaction', async () => {
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
        PROVIDER_TRANSACTION,
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

    it('records the changed fields and rotated secrets of an update with the update transaction', async () => {
      const before = { ...fixture.mockSSOProviderWithOIDCConfig, oidcConfiguration: { ...fixture.mockOIDCConfig } };
      const after = {
        ...before,
        name: 'Renamed Provider',
        oidcConfiguration: {
          ...before.oidcConfiguration,
          issuer: 'https://changed.example.com',
          clientSecret: 'rotated-client-secret',
        },
      } as SsoProviderRecord;
      fixture.store.provider = before;
      fixture.store.updatedProvider = after;

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
        PROVIDER_TRANSACTION,
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

      expect(fixture.store.update).toHaveBeenCalledTimes(2);
      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records nothing for an update that fails before commit', async () => {
      fixture.store.update.mockRejectedValueOnce(new Error('name write failed'));

      await expect(fixture.service.updateProvider(1, { name: 'Renamed Provider' }, ACTOR)).rejects.toThrow(
        'name write failed',
      );

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records the deleted provider with the delete transaction', async () => {
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
        PROVIDER_TRANSACTION,
      );
    });

    it('records nothing for a delete that fails before commit', async () => {
      fixture.store.remove.mockRejectedValueOnce(new Error('delete failed'));

      await expect(fixture.service.deleteProvider(1, ACTOR)).rejects.toThrow('delete failed');

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });
  });
});
