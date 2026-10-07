import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  ConflictException
} from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { WagoManagedAccess, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoAudit } from './wago-audit';
import { WagoNetworkChangeServiceOnModuleDestroyOperation } from "./wago-network-change.service.wago-network-change-service-on-module-destroy-operation";
export abstract class WagoNetworkChangeServiceRetirePreviousCredentialsOperation extends WagoNetworkChangeServiceOnModuleDestroyOperation {


  async retirePreviousCredentials(controllerId: number, principal: PluginAuditPrincipal) {
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    if (!access) throw new ConflictException('Controller management identity is unavailable.');
    const operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation)),
      owner = randomBytes(16).toString('hex');
    if (!(await operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 120_000)))
      throw new ConflictException('Controller is busy');
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'network_credential_retirement');
    let audited = false;
    try {
      await this.managed.assertNetworkSettled(controllerId);
      await lifecycle.attempt();
      audited = true;
      const controller = await this.context.getRepository(WagoController).findOneByOrFail({ id: controllerId });
      const current = controller.mqttServerId && (await this.context.getMqttServerConfig(controller.mqttServerId));
      if (!current) throw new Error();
      const repository = this.context.getRepository(WagoMqttCredentialRetirement);
      for (const row of await repository.findBy({ controllerId })) {
        const previous = await this.context.getMqttServerConfig(row.mqttServerId);
        if (!previous) throw new Error();
        // Duplicate server records and DNS aliases share the active credentials.
        // Clear that redundant association without revoking the username in use.
        const sameHost =
          previous.host.toLowerCase().replace(/\.$/, '') === current.host.toLowerCase().replace(/\.$/, '');
        let sharedDestination = sameHost;
        if (!sameHost) {
          const destinations = await Promise.all([
            lookup(previous.host, { all: true }),
            lookup(current.host, { all: true }),
          ]);
          const address = (value: string) => value.toLowerCase().replace(/^::ffff:/, '');
          if (!destinations[0].length || !destinations[1].length) throw new Error();
          const previousAddresses = new Set(destinations[0].map((item) => address(item.address)));
          const currentAddresses = new Set(destinations[1].map((item) => address(item.address)));
          const overlaps = [...previousAddresses].some((item) => currentAddresses.has(item));
          const sameAddresses =
            previousAddresses.size === currentAddresses.size &&
            [...previousAddresses].every((item) => currentAddresses.has(item));
          // A partial overlap may include another credential store. Neither
          // revocation nor dropping the cleanup obligation is safe in that case.
          if (overlaps && !sameAddresses) throw new Error();
          sharedDestination = sameAddresses;
        }
        if (sharedDestination) {
          // Different listeners on a shared host may belong to distinct brokers.
          // Keep ambiguous retirements retryable rather than revoking active credentials.
          if (previous.port !== current.port || previous.useTls !== current.useTls) throw new Error();
          await operations.assertOwned(access.fingerprint, owner);
          await repository.delete({ controllerId, mqttServerId: row.mqttServerId });
          continue;
        }
        await operations.assertOwned(access.fingerprint, owner);
        const identity = `wago-controller-${controller.hardwareId}`;
        const result = await this.context
          .getMqttCredentialProvisioning()
          .revoke({ mqttServerId: row.mqttServerId, identity, username: identity, vhost: '/' });
        if (result) throw new Error();
        await operations.assertOwned(access.fingerprint, owner);
        await repository.delete({ controllerId, mqttServerId: row.mqttServerId });
      }
      await lifecycle.finish('succeeded');
      audited = false;
      return this.status(controllerId);
    } catch {
      if (audited) await lifecycle.finish('failed').catch(() => undefined);
      throw new ConflictException(
        'Previous broker credentials could not be retired. Check the previous broker connection and retry.',
      );
    } finally {
      await operations.release(access.fingerprint, owner);
    }
  }
}
