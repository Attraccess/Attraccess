import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import type { SqlitePluginAdapterContext } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoController } from '../../controllers/entity';
import { WagoCommissioningSession } from '../../commissioning/sessions/session.entity';
import { WagoCredentialRotationEntity } from '../../credentials/persistence/schema';
import { WagoManagedAccess, WagoRuntimeUpdateEntity } from '../../runtime/managed/access.entity';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from '../entity';
import { NetworkBindingChanges, WagoNetworkPersistence } from './port';

export class TypeormWagoNetworkPersistence extends WagoNetworkPersistence {
  constructor(private readonly source: () => SqlitePluginAdapterContext['manager']) {
    super();
  }
  async managedAccess(controllerId: number, managedOnly = false) {
    const row = await this.source()
      .getRepository(WagoManagedAccess)
      .findOne({
        where: { controllerId, ...(managedOnly ? { state: 'managed' as const } : {}) },
        order: { sessionId: 'DESC' },
      });
    return row ? { ...row } : null;
  }
  async controller(controllerId: number, claimedOnly = false) {
    const row = await this.source()
      .getRepository(WagoController)
      .findOneBy({ id: controllerId, ...(claimedOnly ? { trustState: 'claimed' as const } : {}) });
    return row ? { ...row } : null;
  }
  async intent(controllerId: number, includeSecret = false) {
    const repository = this.source().getRepository(WagoNetworkChange);
    const row = includeSecret
      ? await repository
          .createQueryBuilder('change')
          .addSelect('change.encryptedPayload')
          .where('change.controllerId = :controllerId', { controllerId })
          .getOne()
      : await repository.findOneBy({ controllerId });
    return row ? { ...row } : null;
  }
  async saveIntent(input: WagoNetworkChange): Promise<void> {
    await this.source().getRepository(WagoNetworkChange).save(input);
  }
  async rotationPhase(controllerId: number) {
    const row = await this.source().getRepository(WagoCredentialRotationEntity).findOneBy({ controllerId });
    return row?.phase ?? null;
  }
  async updateMetadata(controllerId: number) {
    const row = await this.source().getRepository(WagoRuntimeUpdateEntity).findOneBy({ controllerId });
    return row?.metadata ?? null;
  }
  async commitBindings(changes: NetworkBindingChanges, assertOwned: () => Promise<void>): Promise<void> {
    await this.source().transaction(async (manager) => {
      await assertOwned();
      await manager
        .getRepository(WagoManagedAccess)
        .update(changes.sessionId, { host: changes.targetHost, encryptedCredentials: changes.encryptedCredentials });
      await manager.getRepository(WagoCommissioningSession).update(changes.sessionId, {
        targetHost: changes.targetHost,
        ...(changes.broker ? { mqttServerId: changes.broker.mqttServerId } : {}),
      });
      if (changes.broker) {
        const broker = changes.broker;
        if (broker.retirePreviousServerId !== null)
          await manager
            .getRepository(WagoMqttCredentialRetirement)
            .save({ controllerId: changes.controllerId, mqttServerId: broker.retirePreviousServerId });
        await manager
          .getRepository(WagoMqttCredentialRetirement)
          .delete({ controllerId: changes.controllerId, mqttServerId: broker.mqttServerId });
        await manager.getRepository(WagoController).update(changes.controllerId, {
          mqttServerId: broker.mqttServerId,
          credentialMqttServerId: broker.mqttServerId,
          credentialEpoch: broker.credentialEpoch,
          lastHeartbeatAt: null,
          updatedAt: broker.updatedAt,
        });
        await manager.getRepository(WagoCredentialRotationEntity).save({
          controllerId: changes.controllerId,
          revision: 1,
          token: broker.token,
          phase: 'completed',
          credentialEpoch: broker.credentialEpoch,
          mqttServerId: broker.mqttServerId,
          prefix: broker.prefix,
          encryptedCredentials: null,
        });
      }
      await assertOwned();
    });
  }
  retirementCount(controllerId: number) {
    return this.source().getRepository(WagoMqttCredentialRetirement).countBy({ controllerId });
  }
  async retirements(controllerId: number) {
    return (await this.source().getRepository(WagoMqttCredentialRetirement).findBy({ controllerId })).map((row) => ({
      ...row,
    }));
  }
  async removeRetirement(controllerId: number, mqttServerId: number): Promise<void> {
    await this.source().getRepository(WagoMqttCredentialRetirement).delete({ controllerId, mqttServerId });
  }
}

/** Legacy composition helper retained for fixtures; application code receives only the port. */
export function createSqliteNetworkPersistence(
  context: Pick<LegacySqliteContext, 'getRepository'>,
): WagoNetworkPersistence {
  return new TypeormWagoNetworkPersistence(() => context.getRepository(WagoNetworkChange).manager);
}
