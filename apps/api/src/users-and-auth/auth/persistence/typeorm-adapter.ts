import { AuthenticationOperations, AuthenticationPersistence, NewAuthenticationDetail } from './port';
import {
  SSOProvider,
  SSOProviderType,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
} from '@attraccess/database-entities';
import { OidcConfigurationChanges, SamlConfigurationChanges, SsoPersistence } from './port';
import { SsoLinkSecretPersistence, StoredLinkSecret, TotpDetails, TwoFactorPersistence } from './port';
import {
  AuthenticationDetail,
  AuthenticationType,
  Setting,
  ApiToken,
  ApiTokenPermission,
  Passkey,
  PasskeyChallenge,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, LessThan, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { ApiTokenPersistence, NewApiToken, NewPasskey, PasskeyPersistence } from './port';

@Injectable()
export class TypeormPasskeyPersistence extends PasskeyPersistence {
  constructor(
    @InjectRepository(Passkey) private readonly passkeys: Repository<Passkey>,
    @InjectRepository(PasskeyChallenge) private readonly challenges: Repository<PasskeyChallenge>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async listForUser(userId: number): Promise<Passkey[]> {
    return toApplicationRecord(await this.passkeys.find({ where: { userId }, order: { createdAt: 'DESC' } }));
  }
  async removeOwned(userId: number, passkeyId: number): Promise<boolean> {
    return !!(await this.passkeys.delete({ id: passkeyId, userId })).affected;
  }
  async findOwned(userId: number, passkeyId: number): Promise<Passkey | null> {
    return toApplicationRecord(await this.passkeys.findOneBy({ id: passkeyId, userId }));
  }
  async findCredential(credentialId: string): Promise<Passkey | null> {
    return toApplicationRecord(await this.passkeys.findOneBy({ credentialId }));
  }
  async savePasskey(passkey: Passkey): Promise<Passkey> {
    return toApplicationRecord(await this.passkeys.save(passkey));
  }
  async registerPasskey(passkey: NewPasskey): Promise<Passkey> {
    return toApplicationRecord(await this.passkeys.save(this.passkeys.create(passkey)));
  }
  async recordAuthentication(id: number, counter: number, backedUp: boolean, usedAt: Date): Promise<void> {
    await this.passkeys.update(id, { counter, backedUp, lastUsedAt: usedAt });
  }
  async findUser(userId: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOneBy({ id: userId }));
  }
  async removeExpiredChallenges(before: Date): Promise<void> {
    await this.challenges.delete({ expiresAt: LessThan(before) });
  }
  async storeChallenge(challenge: string, userId: number | null, expiresAt: Date): Promise<void> {
    await this.challenges.insert({ challenge, userId, expiresAt });
  }
  async consumeChallenge(challenge: string): Promise<PasskeyChallenge | null> {
    const stored = await this.challenges.findOneBy({ challenge });
    const removed = await this.challenges.delete({ challenge });
    return removed.affected ? toApplicationRecord(stored) : null;
  }
}

function projectApiToken(token: ApiToken): ApiToken;
function projectApiToken(token: ApiToken | null): ApiToken | null;
function projectApiToken(token: ApiToken | null): ApiToken | null {
  if (!token) return null;
  return {
    ...toApplicationRecord(token),
    permissionKeys: token.apiTokenPermissions.map(({ permissionKey }) => permissionKey),
  };
}

@Injectable()
export class TypeormApiTokenPersistence extends ApiTokenPersistence {
  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async activePage(userId: number, page: number, limit: number): Promise<[ApiToken[], number]> {
    const [tokens, count] = await this.tokens.findAndCount({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      relations: { apiTokenPermissions: true },
      skip: (page - 1) * limit,
      take: limit,
    });
    return [tokens.map(projectApiToken), count];
  }
  async findOwned(userId: number, tokenId: number): Promise<ApiToken | null> {
    return projectApiToken(
      await this.tokens.findOne({
        where: { id: tokenId, userId, revokedAt: IsNull() },
        relations: { apiTokenPermissions: true },
      }),
    );
  }
  async findByHash(tokenHash: string): Promise<ApiToken | null> {
    return projectApiToken(
      await this.tokens.findOne({ where: { tokenHash }, relations: { apiTokenPermissions: true } }),
    );
  }
  async findOwner(userId: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOneBy({ id: userId }));
  }
  async createToken(token: NewApiToken, permissionKeys: readonly string[]): Promise<ApiToken> {
    return this.tokens.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ApiToken);
      const saved = await repo.save(repo.create(token));
      saved.apiTokenPermissions = await this.createPermissions(manager, saved.id, permissionKeys);
      return projectApiToken(saved);
    });
  }
  async updateToken(token: ApiToken, permissionKeys?: readonly string[]): Promise<ApiToken> {
    return this.tokens.manager.transaction(async (manager) => {
      if (permissionKeys !== undefined) {
        await manager.getRepository(ApiTokenPermission).delete({ apiTokenId: token.id });
        token.apiTokenPermissions = await this.createPermissions(manager, token.id, permissionKeys);
      }
      return projectApiToken(await manager.getRepository(ApiToken).save(token));
    });
  }
  async saveToken(token: ApiToken): Promise<void> {
    await this.tokens.save(token);
  }
  async touchActive(id: number, now: Date): Promise<boolean> {
    const result = await this.tokens
      .createQueryBuilder()
      .update(ApiToken)
      .set({ lastUsedAt: now })
      .where('id = :id', { id })
      .andWhere('revokedAt IS NULL')
      .andWhere('(expiresAt IS NULL OR expiresAt > :now)', { now })
      .execute();
    return result.affected === 1;
  }
  private createPermissions(
    manager: EntityManager,
    apiTokenId: number,
    keys: readonly string[],
  ): Promise<ApiTokenPermission[]> {
    const repo = manager.getRepository(ApiTokenPermission);
    return repo.save(keys.map((permissionKey) => repo.create({ apiTokenId, permissionKey })));
  }
}

@Injectable()
export class TypeormTwoFactorPersistence extends TwoFactorPersistence {
  constructor(
    @InjectRepository(AuthenticationDetail) private readonly details: Repository<AuthenticationDetail>,
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
  ) {
    super();
  }
  async findDetail(userId: number): Promise<AuthenticationDetail | null> {
    return toApplicationRecord(await this.details.findOne({ where: { userId, type: AuthenticationType.TOTP } }));
  }
  async saveDetail(detail: TotpDetails): Promise<void> {
    await this.details.save(detail);
  }
  async removeDetail(id: number): Promise<void> {
    await this.details.delete(id);
  }
  async readPolicy(): Promise<string | null> {
    return (await this.settings.findOneBy({ parent: 'auth', key: 'two_factor_policy' }))?.value ?? null;
  }
  async writePolicy(policy: string): Promise<void> {
    const existing = await this.settings.findOneBy({ parent: 'auth', key: 'two_factor_policy' });
    if (existing) await this.settings.update(existing.id, { value: policy });
    else await this.settings.insert({ parent: 'auth', key: 'two_factor_policy', value: policy });
  }
}
@Injectable()
export class TypeormSsoLinkSecretPersistence extends SsoLinkSecretPersistence {
  constructor(@InjectRepository(Setting) private readonly settings: Repository<Setting>) {
    super();
  }
  async readSecret(): Promise<StoredLinkSecret | null> {
    const row = await this.settings.findOneBy({ parent: 'auth', key: 'sso_link_token_secret' });
    return row ? { id: row.id, value: row.value } : null;
  }
  async updateSecret(id: number, value: string): Promise<void> {
    await this.settings.update(id, { value });
  }
  async insertSecret(value: string): Promise<void> {
    await this.settings.insert({ parent: 'auth', key: 'sso_link_token_secret', value });
  }
}

@Injectable()
export class TypeormSsoPersistence extends SsoPersistence {
  constructor(
    @InjectRepository(SSOProvider) private readonly providers: Repository<SSOProvider>,
    @InjectRepository(SSOProviderOIDCConfiguration) private readonly oidc: Repository<SSOProviderOIDCConfiguration>,
    @InjectRepository(SSOProviderSAMLConfiguration) private readonly saml: Repository<SSOProviderSAMLConfiguration>,
  ) {
    super();
  }
  async allProviders(): Promise<SSOProvider[]> {
    return toApplicationRecord(await this.providers.find({ relations: ['oidcConfiguration', 'samlConfiguration'] }));
  }
  async providerById(id: number): Promise<SSOProvider | null> {
    return toApplicationRecord(
      await this.providers.findOne({ where: { id }, relations: ['oidcConfiguration', 'samlConfiguration'] }),
    );
  }
  async providerByType(id: number, type: SSOProviderType): Promise<SSOProvider | null> {
    const relations =
      type === SSOProviderType.OIDC
        ? ['oidcConfiguration']
        : type === SSOProviderType.SAML
          ? ['samlConfiguration']
          : [];
    return toApplicationRecord(await this.providers.findOne({ where: { type, id }, relations }));
  }
  async createProvider(name: string, type: SSOProviderType): Promise<SSOProvider> {
    return toApplicationRecord(await this.providers.save(this.providers.create({ name, type })));
  }
  async renameProvider(id: number, name: string): Promise<void> {
    await this.providers.update(id, { name });
  }
  async removeProvider(id: number): Promise<void> {
    await this.providers.delete(id);
  }
  async createOidcConfiguration(data: OidcConfigurationChanges): Promise<SSOProviderOIDCConfiguration> {
    return toApplicationRecord(await this.oidc.save(this.oidc.create(data)));
  }
  async oidcConfiguration(providerId: number): Promise<SSOProviderOIDCConfiguration | null> {
    return toApplicationRecord(await this.oidc.findOne({ where: { ssoProviderId: providerId } }));
  }
  async patchOidcConfiguration(providerId: number, data: OidcConfigurationChanges): Promise<void> {
    await this.oidc.update({ ssoProviderId: providerId }, data);
  }
  async removeOidcConfiguration(id: number): Promise<void> {
    await this.oidc.delete(id);
  }
  async createSamlConfiguration(data: SamlConfigurationChanges): Promise<SSOProviderSAMLConfiguration> {
    return toApplicationRecord(await this.saml.save(this.saml.create(data)));
  }
  async samlConfiguration(providerId: number): Promise<SSOProviderSAMLConfiguration | null> {
    return toApplicationRecord(await this.saml.findOne({ where: { ssoProviderId: providerId } }));
  }
  async patchSamlConfiguration(providerId: number, data: SamlConfigurationChanges): Promise<void> {
    await this.saml.update({ ssoProviderId: providerId }, data);
  }
  async removeSamlConfiguration(id: number): Promise<void> {
    await this.saml.delete(id);
  }
}
export function ssoTransactionOperations(manager: EntityManager): TypeormSsoPersistence {
  return new TypeormSsoPersistence(
    manager.getRepository(SSOProvider),
    manager.getRepository(SSOProviderOIDCConfiguration),
    manager.getRepository(SSOProviderSAMLConfiguration),
  );
}

@Injectable()
export class TypeormAuthenticationPersistence extends AuthenticationPersistence {
  constructor(@InjectRepository(AuthenticationDetail) private readonly details: Repository<AuthenticationDetail>) {
    super();
  }
  async ssoIdentity(
    providerType: SSOProviderType,
    providerId: number,
    subject: string,
  ): Promise<AuthenticationDetail | null> {
    return toApplicationRecord(
      await this.details.findOne({
        where: { type: AuthenticationType.SSO, providerType, providerId, ssoSubject: subject },
      }),
    );
  }
  async ssoCount(userId: number): Promise<number> {
    return this.details.count({ where: { userId, type: AuthenticationType.SSO } });
  }
  async detail(userId: number, type: AuthenticationType): Promise<AuthenticationDetail | null> {
    return toApplicationRecord(await this.details.findOne({ where: { userId, type } }));
  }
  async updateSubject(detailId: number, ssoSubject: string): Promise<void> {
    await this.details.update(detailId, { ssoSubject });
  }
  async saveAuthentication(detail: AuthenticationDetail | NewAuthenticationDetail): Promise<AuthenticationDetail> {
    return toApplicationRecord(await this.details.save('id' in detail ? detail : this.details.create(detail)));
  }
  async removeDetail(detailId: number): Promise<void> {
    await this.details.delete({ id: detailId });
  }
}
export function authenticationTransactionOperations(manager: EntityManager): AuthenticationOperations {
  return new TypeormAuthenticationPersistence(manager.getRepository(AuthenticationDetail));
}
