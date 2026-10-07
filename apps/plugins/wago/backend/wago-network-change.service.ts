import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ConflictException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { WagoAudit } from './wago-audit';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoDeviceOperation, WagoManagedAccess, WagoRuntimeUpdateEntity } from './wago-managed-access.entity';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoNetworkBrokerChange } from './wago-network-broker-change';
import { WagoNetworkChange } from './wago-network-change.entity';
import { NetworkChangeError } from './wago-network-change.service.errors';
import { networkChangeInput } from './wago-network-change.service.network-change-input';
import { OPERATION_MS } from './wago-network-change.service.operation-ms';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoService } from './wago.service';

@Injectable()
export class WagoNetworkChangeService extends WagoNetworkBrokerChange implements OnModuleDestroy {
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) context: PluginContext,
    @Inject(WagoManagedRuntimeService) managed: WagoManagedRuntimeService,
    @Inject(WagoService) wago: WagoService,
  ) {
    super(context, managed, wago);
  }

  async apply(controllerId: number, body: unknown, principal: PluginAuditPrincipal, retry = false) {
    if (this.destroyed) throw new ConflictException('Controller operation has stopped. Retry the request.');
    const input = retry ? null : networkChangeInput(body);
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId, state: 'managed' }, order: { sessionId: 'DESC' } });
    if (!access) throw new ConflictException('Automatic SSH management is required for this operation.');
    const operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
    const owner = randomBytes(16).toString('hex'),
      now = Date.now();
    if (!(await operations.acquire(access.fingerprint, owner, now, now + OPERATION_MS + 60_000)))
      throw new ConflictException('Another controller operation is active. Retry after it finishes.');
    const abort = new AbortController();
    this.active.add(abort);
    const timer = setTimeout(() => abort.abort(), OPERATION_MS).unref();
    const assertOwned = async () => {
      abort.signal.throwIfAborted();
      await operations.assertOwned(access.fingerprint, owner);
    };
    let row: WagoNetworkChange | null = null;
    let audited = false;
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'network_change');
    try {
      const controller = await this.context
        .getRepository(WagoController)
        .findOneBy({ id: controllerId, trustState: 'claimed' });
      if (!controller?.mqttServerId || !controller.credentialEpoch)
        throw new ConflictException('Managed enrolled controller required.');
      row = await this.repository
        .createQueryBuilder('change')
        .addSelect('change.encryptedPayload')
        .where('change.controllerId = :controllerId', { controllerId })
        .getOne();
      if (retry && (!row || row.phase === 'completed')) return this.status(controllerId);
      if (!retry && row && row.phase !== 'completed' && !(row.phase === 'connecting' && row.failure))
        throw new ConflictException('Retry the pending MQTT/address change before starting another.');
      const rotation = await this.context.getRepository(WagoCredentialRotationEntity).findOneBy({ controllerId });
      const update = await this.context.getRepository(WagoRuntimeUpdateEntity).findOneBy({ controllerId });
      if ((rotation && rotation.phase !== 'completed') || (update?.metadata && JSON.parse(update.metadata).token))
        throw new ConflictException(
          'Finish credential rotation or runtime update recovery before changing MQTT/address settings.',
        );
      if (!retry) {
        if (!input) throw new BadRequestException('Invalid MQTT/address change');
        row = this.repository.create({
          controllerId,
          sessionId: access.sessionId,
          fingerprint: access.fingerprint,
          ...input,
          phase: 'connecting',
          failure: null,
          encryptedPayload: null,
          updatedAt: new Date().toISOString(),
        });
        await assertOwned();
        await this.repository.save(row);
      }
      if (!row || row.sessionId !== access.sessionId || row.fingerprint !== access.fingerprint)
        throw new ConflictException('Pending change belongs to another managed identity.');
      await lifecycle.attempt();
      audited = true;
      await assertOwned();
      if (row.mqttServerId !== null && !this.context.mqtt.refreshConnection)
        throw new NetworkChangeError('host_connection');
      const host = await this.managed.networkManagement(controllerId, row.targetHost, abort.signal);
      if (host.hardwareId !== controller.hardwareId) throw new RuntimeUpdateError('management_required');
      // The helper was already verified before saving a credential payload. A
      // retry may find no container after DELETE succeeded and CREATE failed;
      // proof + the retained helper/journal must suffice to recreate it.
      if (!row.encryptedPayload) await host.prepare();
      if (row.mqttServerId !== null) {
        await this.applyBrokerChange(controllerId, row, controller, host, abort, assertOwned, retry);
      } else {
        if ((await host.command(`mqtt-address ${host.managementToken}`)) !== 'OK\n')
          throw new RuntimeUpdateError('recovery');
        await this.phase(row, 'saving', assertOwned);
        await this.saveBindings(row, host.encryptedCredentials, null, assertOwned);
      }
      row.encryptedPayload = null;
      await this.phase(row, 'completed', assertOwned);
      if (row.mqttServerId !== null) this.managed.networkChanged(controllerId);
      await lifecycle.finish('succeeded');
      audited = false;
      return this.status(controllerId);
    } catch (error) {
      // Neither provider errors, SSH output nor decrypted envelopes cross this
      // boundary. The durable intent stays available to an explicit retry.
      if (row && row.phase !== 'completed') {
        row.failure =
          error instanceof RuntimeUpdateError || error instanceof NetworkChangeError ? error.failure : 'interrupted';
        await assertOwned()
          .then(() => this.repository.save(row))
          .catch(() => undefined);
      }
      if (audited) await lifecycle.finish('failed');
      throw new ConflictException('MQTT/address change is incomplete. Check its status and retry the saved operation.');
    } finally {
      clearTimeout(timer);
      abort.abort();
      this.active.delete(abort);
      await operations.release(access.fingerprint, owner);
    }
  }
}

export { networkChangeInput } from './wago-network-change.service.network-change-input';
