import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { normalizeOperationalPrefix } from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoNetworkChange } from './wago-network-change.entity';
import { NetworkChangeError } from './wago-network-change.service.errors';
import { NetworkPayload } from './wago-network-change.service.network-payload';
import { WagoNetworkChangeServiceEvidenceOperation } from './wago-network-change.service.wago-network-change-service-evidence-operation';
import { RuntimeUpdateError } from './wago-runtime-update';

export abstract class WagoNetworkBrokerChange extends WagoNetworkChangeServiceEvidenceOperation {
  protected async applyBrokerChange(
    controllerId: number,
    row: WagoNetworkChange,
    controller: WagoController,
    host: Awaited<ReturnType<WagoManagedRuntimeService['networkManagement']>>,
    abort: AbortController,
    assertOwned: () => Promise<void>,
    retry: boolean,
  ): Promise<void> {
    let superseded: NetworkPayload | undefined;
    let connection: Awaited<ReturnType<WagoNetworkBrokerChange['brokerConnection']>> | undefined;
    if (retry && row.phase === 'verifying' && row.encryptedPayload) {
      const previous = this.payload(row, controller);
      connection = await this.brokerConnection(row.mqttServerId);
      if (Object.entries(connection).some(([key, value]) => previous[key as keyof NetworkPayload] !== value)) {
        // Verification means the previous helper finished applying. An
        // interrupted recreation must first finish its exact saved intent;
        // only this settled device state can adopt corrected broker details.
        await host.prepare();
        superseded = previous;
      }
    }
    if (!row.encryptedPayload || superseded) {
      // Keep the previous verification intent intact until the replacement
      // credentials and predecessor digest have been encrypted durably.
      if (!superseded) await this.phase(row, 'provisioning', assertOwned);
      connection ??= await this.brokerConnection(row.mqttServerId);
      const prefix = normalizeOperationalPrefix((await this.wago.getSettings()).operationalPrefix);
      const identity = `wago-controller-${controller.hardwareId}`,
        root = `${prefix}/v1/controllers/${controller.hardwareId}`;
      await assertOwned();
      const credential = await this.context
        .getMqttCredentialProvisioning()
        .provision({
          mqttServerId: row.mqttServerId,
          identity,
          username: identity,
          vhost: '/',
          topicPolicy: {
            publish: [`${root}/#`],
            subscribe: [`${root}/configuration/desired`, `${root}/commands`, `${root}/credentials/rotate`],
          },
        })
        .catch(() => {
          throw new NetworkChangeError('broker_provisioning');
        });
      if (
        !('password' in credential) ||
        credential.username !== identity ||
        !credential.password ||
        credential.password.length > 4096 ||
        /[\r\n\0]/.test(credential.password)
      )
        throw new NetworkChangeError('broker_provisioning');
      const payload: NetworkPayload = {
        schema: 1,
        controllerId,
        sessionId: row.sessionId,
        fingerprint: row.fingerprint,
        targetHost: row.targetHost,
        mqttServerId: row.mqttServerId,
        previousServerId: controller.mqttServerId,
        previousEpoch: controller.credentialEpoch,
        hardwareId: controller.hardwareId,
        operationToken: randomBytes(16).toString('hex'),
        credentialEpoch: randomUUID(),
        token: randomBytes(32).toString('base64url'),
        prefix,
        username: identity,
        password: credential.password,
        ...connection,
        ...(superseded
          ? { supersededDigest: createHash('sha256').update(JSON.stringify(superseded)).digest('hex') }
          : {}),
      };
      const plaintext = JSON.stringify(payload),
        encrypted = this.context.secrets.encrypt(plaintext);
      if (!encrypted || encrypted === plaintext || this.context.secrets.decrypt(encrypted) !== plaintext)
        throw new RuntimeUpdateError('management_required');
      row.encryptedPayload = encrypted;
      await this.phase(row, 'applying', assertOwned);
    }
    const payload = this.payload(row, controller);
    const bytes = Buffer.from(JSON.stringify(payload)),
      digest = createHash('sha256').update(bytes).digest('hex');
    // Subscribe before the recreation; a unique unguessable token and new
    // epoch exclude stale retained acknowledgements from earlier operations.
    const evidence = row.phase === 'saving' ? null : await this.evidence(payload, abort.signal);
    try {
      if (evidence) {
        await this.phase(row, 'applying', assertOwned);
        if (
          payload.supersededDigest &&
          (await host.command(`mqtt-release ${host.managementToken} ${payload.supersededDigest} ${digest}`)) !== 'OK\n'
        )
          throw new RuntimeUpdateError('recovery');
        if ((await host.command(`mqtt-apply ${host.managementToken} ${digest} ${bytes.length}`, bytes)) !== 'OK\n')
          throw new RuntimeUpdateError('recovery');
        await this.phase(row, 'verifying', assertOwned);
        await evidence.wait();
        await this.phase(row, 'saving', assertOwned);
      }
      await assertOwned();
      await this.saveBindings(row, host.encryptedCredentials, payload, assertOwned);
      if ((await host.command(`mqtt-ack ${host.managementToken} ${digest}`)) !== 'OK\n')
        throw new RuntimeUpdateError('recovery');
      await this.wago.refreshNetworkConnection(controllerId);
    } finally {
      evidence?.close();
    }
  }
}
