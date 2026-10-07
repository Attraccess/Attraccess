import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import { normalizeOperationalPrefix } from './protocol';
import { WagoAudit } from './wago-audit';
import { WagoController } from './wago-controller.entity';
import { Credential } from './wago-credential-rotation.credential';
import { assertRotationController } from './wago-credential-rotation.helpers';
import { checkPendingRotation } from './wago-credential-rotation.helpers';
import { WagoCredentialRotationServiceAssertRemovalBrokerOperation } from './wago-credential-rotation.wago-credential-rotation-service-assert-removal-broker-operation';
import { WagoCredentialRotationUncertainError } from './wago-credential-rotation.wago-credential-rotation-uncertain-error';

export abstract class WagoCredentialRotationServiceRotateOperation extends WagoCredentialRotationServiceAssertRemovalBrokerOperation {
  async rotate(
    controllerId: number,
    prefix: string,
    principal: PluginAuditPrincipal,
    guard: CommissioningOperationGuard,
    retry = false,
  ) {
    await guard.assertOwned();
    const controller = await this.context.getRepository(WagoController).findOneBy({ id: controllerId });
    if (!controller) throw new NotFoundException('WAGO controller not found');
    assertRotationController(controller, retry);
    const [epochRow] = await this.repository.query(
      'SELECT credential_epoch AS epoch FROM plugin_wago_controllers WHERE id = ?',
      [controllerId],
    );
    const credentialEpoch: unknown = epochRow?.epoch;
    if (
      typeof credentialEpoch !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialEpoch)
    )
      throw new ConflictException('Re-enroll this controller with a credential epoch before rotating credentials.');
    prefix = normalizeOperationalPrefix(prefix);
    const identity = `wago-controller-${controller.hardwareId}`;
    const previous = await this.repository
      .createQueryBuilder('rotation')
      .addSelect('rotation.encryptedCredentials')
      .where('rotation.controllerId = :controllerId', { controllerId })
      .getOne();
    const completed = checkPendingRotation(previous, credentialEpoch, retry, controller.mqttServerId, prefix);
    if (completed) return completed;
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'credential_rotation');
    await lifecycle.attempt();
    let uncertain = retry;
    try {
      let row = previous;
      if (!retry) {
        const revision = (previous?.revision ?? 0) + 1;
        if (!Number.isSafeInteger(revision)) throw new ConflictException('Credential rotation revision exhausted.');
        row = this.repository.create({
          controllerId,
          revision,
          credentialEpoch,
          phase: 'provisioning',
          mqttServerId: controller.mqttServerId,
          prefix,
          token: randomBytes(32).toString('base64url'),
          encryptedCredentials: null,
        });
        await guard.assertOwned();
        await this.repository.save(row);
        await guard.assertOwned();
        const root = `${prefix}/v1/controllers/${controller.hardwareId}`;
        uncertain = true;
        const credential = await this.context.getMqttCredentialProvisioning().rotate({
          mqttServerId: row.mqttServerId,
          identity,
          username: identity,
          vhost: '/',
          topicPolicy: {
            publish: [`${root}/#`],
            subscribe: [`${root}/configuration/desired`, `${root}/commands`, `${root}/credentials/rotate`],
          },
        });
        await guard.assertOwned();
        if (!('password' in credential)) {
          uncertain = false;
          // The manual-provider response is instructions only, not a completed broker mutation.
          if (previous) await this.repository.save(previous);
          else await this.repository.delete(controllerId);
          throw new ConflictException('Automatic broker credential rotation is unavailable.');
        }
        if (credential.username !== identity || !credential.password || credential.password.length > 4096)
          throw new ConflictException('Broker credential rotation needs recovery.');
        const plaintext = JSON.stringify({ username: identity, password: credential.password });
        const encrypted = this.context.secrets.encrypt(plaintext);
        if (!encrypted || encrypted === plaintext || this.context.secrets.decrypt(encrypted) !== plaintext)
          throw new ConflictException('Credential recovery storage is unavailable.');
        row.encryptedCredentials = encrypted;
        row.phase = 'pending';
        await guard.assertOwned();
        await this.repository.save(row);
      }
      if (!row?.encryptedCredentials) throw new ConflictException('Credential recovery storage is unavailable.');
      const credential = JSON.parse(this.context.secrets.decrypt(row.encryptedCredentials)) as Credential;
      if (
        credential.username !== identity ||
        typeof credential.password !== 'string' ||
        !credential.password ||
        credential.password.length > 4096
      )
        throw new ConflictException('Credential recovery storage is unavailable.');
      await this.handoff(controller.hardwareId, row, credential, guard);
      await guard.assertOwned();
      row.phase = 'completed';
      row.encryptedCredentials = null;
      await this.repository.save(row);
      await guard.assertOwned();
      await lifecycle.finish('succeeded');
      return { state: 'completed' as const, revision: row.revision };
    } catch {
      await lifecycle.finish('failed');
      if (uncertain) throw new WagoCredentialRotationUncertainError();
      throw new ConflictException(
        'Credential rotation is incomplete. Inspect its recovery state and retry the pending handoff.',
      );
    }
  }
}
