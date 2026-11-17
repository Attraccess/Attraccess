import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { SSOProviderType } from '@attraccess/application-models';
import type {
  SsoOidcConfigurationRecord,
  SsoProviderRecord,
  SsoSamlConfigurationRecord,
} from '@attraccess/application-models';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../audit/recorder/audit-event';
import type {
  SsoProviderChanges,
  SsoProviderDraft,
  SsoProviderStore,
} from '../../../users-and-auth/auth/sso/providers/sso-provider.port';
import type { AuditEvent } from '../../../audit/recorder/audit-event';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

const relationOf = (type: SSOProviderType) =>
  type === SSOProviderType.OIDC ? ('oidcConfiguration' as const) : ('samlConfiguration' as const);

function oidcRecord(config: SSOProviderOIDCConfiguration): SsoOidcConfigurationRecord {
  const { ssoProvider: _provider, ...columns } = config;
  void _provider;
  return columns;
}

function samlRecord(config: SSOProviderSAMLConfiguration): SsoSamlConfigurationRecord {
  const { ssoProvider: _provider, ...columns } = config;
  void _provider;
  return columns;
}

function toRecord(provider: SSOProvider): SsoProviderRecord {
  const record: SsoProviderRecord = {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
  if (provider.oidcConfiguration) record.oidcConfiguration = oidcRecord(provider.oidcConfiguration);
  if (provider.samlConfiguration) record.samlConfiguration = samlRecord(provider.samlConfiguration);
  return record;
}

@Injectable()
export class TypeOrmSsoProviderStore implements SsoProviderStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async findAll(): Promise<SsoProviderRecord[]> {
    const providers = await this.dataSource.getRepository(SSOProvider).find({
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });
    return providers.map(toRecord);
  }

  async findById(id: number): Promise<SsoProviderRecord | null> {
    const provider = await this.dataSource.getRepository(SSOProvider).findOne({
      where: { id },
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });
    return provider ? toRecord(provider) : null;
  }

  async findByTypeAndId(type: SSOProviderType, id: number): Promise<SsoProviderRecord | null> {
    const provider = await this.dataSource.getRepository(SSOProvider).findOne({
      where: { type, id },
      relations: [relationOf(type)],
    });
    return provider ? toRecord(provider) : null;
  }

  async create(draft: SsoProviderDraft, audit: (created: SsoProviderRecord) => AuditEvent): Promise<SsoProviderRecord> {
    return this.dataSource.transaction(async (manager) => {
      const providers = manager.getRepository(SSOProvider);
      const provider = await providers.save(providers.create({ name: draft.name, type: draft.type }));
      if (draft.type === SSOProviderType.OIDC && draft.oidcConfiguration) {
        const configs = manager.getRepository(SSOProviderOIDCConfiguration);
        await configs.save(configs.create({ ...draft.oidcConfiguration, ssoProviderId: provider.id }));
      } else if (draft.type === SSOProviderType.SAML && draft.samlConfiguration) {
        const configs = manager.getRepository(SSOProviderSAMLConfiguration);
        await configs.save(configs.create({ ...draft.samlConfiguration, ssoProviderId: provider.id }));
      }
      const loaded = await this.load(manager, provider.id);
      if (!loaded) throw new Error('Provider not found after create');
      const record = toRecord(loaded);
      await this.audit.record(audit(record), legacyEngineTransactionScope(manager));
      return record;
    });
  }

  async update(
    id: number,
    plan: (current: SsoProviderRecord) => SsoProviderChanges,
    audit: (updated: SsoProviderRecord) => AuditEvent | null,
  ): Promise<SsoProviderRecord | null> {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, id);
      if (!current) return null;
      const changes = plan(toRecord(current));
      if (changes.oidcConfiguration) {
        await manager
          .getRepository(SSOProviderOIDCConfiguration)
          .update({ ssoProviderId: id }, changes.oidcConfiguration);
      }
      if (changes.samlConfiguration) {
        await manager
          .getRepository(SSOProviderSAMLConfiguration)
          .update({ ssoProviderId: id }, changes.samlConfiguration);
      }
      if (changes.name) await manager.getRepository(SSOProvider).update(id, { name: changes.name });
      const updated = await this.load(manager, id);
      if (!updated) return null;
      const record = toRecord(updated);
      const event = audit(record);
      if (event) await this.audit.record(event, legacyEngineTransactionScope(manager));
      return record;
    });
  }

  async remove(id: number, audit: (removed: SsoProviderRecord) => AuditEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(SSOProvider).findOne({
        where: { id },
        relations: ['oidcConfiguration', 'samlConfiguration'],
      });
      if (!current) return;
      if (current.oidcConfiguration) {
        await manager.getRepository(SSOProviderOIDCConfiguration).delete(current.oidcConfiguration.id);
      }
      if (current.samlConfiguration) {
        await manager.getRepository(SSOProviderSAMLConfiguration).delete(current.samlConfiguration.id);
      }
      await manager.getRepository(SSOProvider).delete(id);
      await this.audit.record(audit(toRecord(current)), legacyEngineTransactionScope(manager));
    });
  }

  /** The provider with the configuration of its own type, as stored. */
  private async load(manager: EntityManager, id: number): Promise<SSOProvider | null> {
    const providers = manager.getRepository(SSOProvider);
    const header = await providers.findOneBy({ id });
    if (!header) return null;
    return providers.findOne({ where: { type: header.type, id }, relations: [relationOf(header.type)] });
  }
}
