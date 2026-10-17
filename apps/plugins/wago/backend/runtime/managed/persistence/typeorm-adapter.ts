import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import type { SqlitePluginAdapterContext } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoManagedAccess, WagoRuntimeUpdateEntity } from '../access.entity';
import { WagoController } from '../../../controllers/entity';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from '../../../network/entity';
import { WagoManagedPersistence } from './port';

export class TypeormWagoManagedPersistence extends WagoManagedPersistence {
  constructor(private readonly source: () => SqlitePluginAdapterContext['manager']) {
    super();
  }
  private get accessRows() {
    return this.source().getRepository(WagoManagedAccess);
  }
  private get updates() {
    return this.source().getRepository(WagoRuntimeUpdateEntity);
  }
  async latestAccess(controllerId: number) {
    const row = await this.accessRows.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    return row ? { ...row } : null;
  }
  async access(sessionId: number) {
    const row = await this.accessRows.findOneBy({ sessionId });
    return row ? { ...row } : null;
  }
  async managedCredentials(controllerId: number) {
    const row = await this.accessRows
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.controllerId = :controllerId AND access.state = :state', { controllerId, state: 'managed' })
      .orderBy('access.sessionId', 'DESC')
      .getOne();
    return row ? { ...row } : null;
  }
  async sessionCredentials(sessionId: number) {
    const row = await this.accessRows
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.sessionId = :sessionId', { sessionId })
      .getOne();
    return row ? { ...row } : null;
  }
  async saveAccess(input: WagoManagedAccess) {
    return { ...(await this.accessRows.save(input)) };
  }
  async updateAccess(sessionId: number, patch: Partial<WagoManagedAccess>): Promise<void> {
    await this.accessRows.update(sessionId, patch);
  }
  async retireControllerAccess(controllerId: number): Promise<void> {
    await this.accessRows.update({ controllerId }, { state: 'retired' });
  }
  async setUnretiredState(sessionId: number, state: 'verified' | 'managed' | 'recovery_required') {
    const result = await this.accessRows
      .createQueryBuilder()
      .update()
      .set({ state })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', { sessionId, retired: ['retiring', 'retired'] })
      .execute();
    return result.affected === 1;
  }
  async claimedControllerPage(offset: number) {
    return (
      await this.source()
        .getRepository(WagoController)
        .find({ where: { trustState: 'claimed' }, order: { id: 'ASC' }, skip: offset, take: 50 })
    ).map((row) => ({ ...row }));
  }
  async networkIntent(controllerId: number | null, fingerprint?: string) {
    const row = await this.source()
      .getRepository(WagoNetworkChange)
      .findOneBy(controllerId === null ? { fingerprint } : { controllerId });
    return row ? { ...row } : null;
  }
  retirementCount(controllerId: number) {
    return this.source().getRepository(WagoMqttCredentialRetirement).countBy({ controllerId });
  }
  async updateMetadata(controllerId: number) {
    const row = await this.updates.findOneBy({ controllerId });
    return row?.metadata ?? null;
  }
  async initializeUpdate(controllerId: number): Promise<void> {
    await this.updates.createQueryBuilder().insert().values({ controllerId }).orIgnore().execute();
  }
  async saveUpdate(controllerId: number, metadata: string, fingerprint: string, owner: string, now: number) {
    const result = await this.updates
      .createQueryBuilder()
      .update()
      .set({ metadata })
      .where(
        'controller_id = :controllerId AND EXISTS (SELECT 1 FROM plugin_wago_device_operations WHERE fingerprint = :fingerprint AND owner = :owner AND lease_until > :now)',
        { controllerId, fingerprint, owner, now },
      )
      .execute();
    return result.affected === 1;
  }
}

export function createSqliteManagedPersistence(
  context: Pick<LegacySqliteContext, 'getRepository'>,
): WagoManagedPersistence {
  return new TypeormWagoManagedPersistence(() => context.getRepository(WagoManagedAccess).manager);
}
