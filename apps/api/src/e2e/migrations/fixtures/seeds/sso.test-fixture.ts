import type { DataSource } from 'typeorm';
import {
  AuthenticationDetail,
  AuthenticationType,
  MqttServer,
  Session,
  Setting,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
  User,
} from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';
export async function migrationSsoSeeds(dataSource: DataSource, seedTag: string, primaryUser: User) {
  const mqttRepo = dataSource.getRepository(MqttServer);

  const ssoProviderRepo = dataSource.getRepository(SSOProvider);

  const ssoConfigRepo = dataSource.getRepository(SSOProviderOIDCConfiguration);

  const ssoSamlConfigRepo = dataSource.getRepository(SSOProviderSAMLConfiguration);

  const authenticationRepo = dataSource.getRepository(AuthenticationDetail);

  const sessionRepo = dataSource.getRepository(Session);

  const settingRepo = dataSource.getRepository(Setting);

  await ensureEntity(mqttRepo, () => ({
    name: `Seed MQTT ${seedTag}`,
    host: 'localhost',
    port: 1883,
  }));

  const ssoProvider = await ensureEntity(ssoProviderRepo, () => ({
    name: `Seed SSO ${seedTag}`,
    type: SSOProviderType.OIDC,
  }));

  const samlProvider =
    (await ssoProviderRepo.findOne({ where: { type: SSOProviderType.SAML } })) ??
    (await ssoProviderRepo.save(
      ssoProviderRepo.create({
        name: `Seed SSO SAML ${seedTag}`,
        type: SSOProviderType.SAML,
      }),
    ));

  await ensureEntity(ssoConfigRepo, () => ({
    ssoProviderId: ssoProvider.id,
    issuer: 'https://issuer.example.com',
    authorizationURL: 'https://issuer.example.com/auth',
    tokenURL: 'https://issuer.example.com/token',
    userInfoURL: 'https://issuer.example.com/userinfo',
    clientId: `seed-client-${seedTag}`,
    clientSecret: `seed-secret-${seedTag}`,
    scopes: ['openid', 'email'],
    usernameClaimPaths: ['preferred_username'],
    emailClaimPaths: ['email'],
  }));

  const existingSamlConfig = await ssoSamlConfigRepo.findOne({ where: { ssoProviderId: samlProvider.id } });

  if (!existingSamlConfig) {
    await ssoSamlConfigRepo.save(
      ssoSamlConfigRepo.create({
        ssoProviderId: samlProvider.id,
        entryPoint: 'https://saml.example.com/sso',
        issuer: 'https://app.example.com',
        certificate: 'seed-certificate',
        audience: null,
        signRequest: false,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: true,
        forceAuthn: false,
        emailAttributeKeys: ['email'],
        spSigningCertificate: null,
        spSigningKeyEncrypted: null,
        spSigningKeyEncryptionKeyId: null,
      }),
    );
  }

  await ensureEntity(authenticationRepo, () => ({
    userId: primaryUser.id,
    type: AuthenticationType.LOCAL_PASSWORD,
    password: 'hashed-password',
  }));

  await ensureEntity(sessionRepo, () => ({
    token: `seed-session-${seedTag}`,
    userId: primaryUser.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }));

  await ensureEntity(settingRepo, () => ({
    parent: 'system',
    key: `seed-setting-${seedTag}`,
    value: 'true',
  }));
}
