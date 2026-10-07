import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';
import { registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
export function registerSamlConfigurationHelpersCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
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
}
