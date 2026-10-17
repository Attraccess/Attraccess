import { WagoController } from './entity';

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

import { randomUUID, randomBytes } from 'node:crypto';

import {
  CONFIGURATION_PROTOCOL_VERSION,
  commandTopic,
  configurationDesiredTopic,
  configurationReportedTopic,
  normalizeOperationalPrefix,
  discoveryTopic,
} from '../protocol/index';

import { WagoEnrollment } from './enrollment.entity';

import { WagoAudit } from '../audit/index';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import { WagoCredentialOperationUncertainError } from './model';

import { hash, isValidHardwareId } from './model';

import { WagoRevisions } from '../configuration/revisions';

export abstract class WagoControllerEnrollment extends WagoRevisions {
  protected async restoreUnclaimedControllerWhileLocked(
    {
      controller,
      mqttServerId,
      identity,
      previousController,
    }: {
      controller: WagoController;
      mqttServerId: number;
      identity: string;
      previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    },
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    await assertOwned();
    const manual = await this.context
      .getMqttCredentialProvisioning()
      .revoke({ mqttServerId, identity, username: identity, vhost: '/' });
    if (manual) throw new ConflictException('Manual permanent credential revocation is required.');
    await assertOwned();
    controller.credentialMqttServerId = null;
    controller.credentialEpoch = null;
    Object.assign(controller, previousController);
    await assertOwned();
    await this.controllers.save(controller).catch((rollbackError) => {
      this.context.logger.warn(
        `Could not restore WAGO controller ${controller.id} after claim failure: ${String(rollbackError)}`,
      );
    });
  }

  protected async restoreUnclaimedController(
    {
      controller,
      mqttServerId,
      identity,
      previousController,
    }: {
      controller: WagoController;
      mqttServerId: number;
      identity: string;
      previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    },
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    await this.withClaimConfigurationLock(() =>
      this.restoreUnclaimedControllerWhileLocked(
        {
          controller,
          mqttServerId,
          identity,
          previousController,
        },
        assertOwned,
      ),
    );
  }

  protected async prepareClaim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned: () => Promise<void> = async () => undefined,
    manualCredentials?: { username: string; password: string },
  ): Promise<{
    controller: WagoController;
    enrollment: WagoEnrollment;
    mqttServerId: number;
    credential: { username: string; password: string };
    configuration: { protocolVersion: number; namespace: string; desiredTopic: string; reportedTopic: string };
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    credentialDelivered: boolean;
  }> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);
    if (controller.trustState === 'claimed') throw new ConflictException('controller has already been claimed');
    if (!name.trim()) throw new ConflictException('a controller name is required');
    if (!this.matchesVerifier(controller, verifier))
      throw new ConflictException('physical pairing code or fingerprint does not match the controller');
    if (controller.compatibilityError) throw new ConflictException(controller.compatibilityError);
    const selectedServerId = mqttServerId ?? controller.mqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before claiming this controller');
    if (selectedServerId !== controller.mqttServerId)
      throw new ConflictException('claim the controller on the MQTT server used for its enrollment package');
    if (!(await this.context.getMqttServerConfig(selectedServerId)))
      throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const enrollment = await this.activeEnrollment(controller.enrollmentId);
    if (!enrollment)
      throw new ConflictException(
        'the controller enrollment package has expired or was already consumed; create a new one',
      );

    const identity = `wago-controller-${controller.hardwareId}`;
    const settings = await this.getSettings();
    const namespace = normalizeOperationalPrefix(settings.operationalPrefix);
    if (
      manualCredentials &&
      (await this.context.getMqttCredentialProvisioning().availableProviders(selectedServerId)).length
    )
      throw new ConflictException(
        'This broker uses automatic credential provisioning; use the standard claim operation',
      );
    if (
      controller.credentialMqttServerId &&
      (!manualCredentials || controller.credentialMqttServerId !== selectedServerId)
    )
      throw new ConflictException(
        'Remove the controller registration to revoke its unfinished permanent credential before claiming again.',
      );
    // Persist the exact broker before provisioning. Discovery may later update
    // mqttServerId; removal must still revoke this identity on its original broker.
    await assertOwned();
    controller.credentialMqttServerId = selectedServerId;
    controller.credentialEpoch = randomUUID();
    await this.controllers.save(controller);
    await assertOwned();
    const provisioned =
      manualCredentials ??
      (await this.context.getMqttCredentialProvisioning().provision({
        mqttServerId: selectedServerId,
        identity,
        username: identity,
        vhost: '/',
        topicPolicy: {
          publish: [`${namespace}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${controller.hardwareId}/#`],
          subscribe: [
            configurationDesiredTopic(namespace, controller.hardwareId),
            commandTopic(namespace, controller.hardwareId),
            `${namespace}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${controller.hardwareId}/credentials/rotate`,
          ],
        },
      }));
    await assertOwned();
    const credential = 'password' in provisioned ? provisioned : manualCredentials;
    if (!credential) throw new ConflictException('Manual credential provisioning is required');
    const previousController = {
      trustState: controller.trustState,
      name: controller.name,
      mqttServerId: controller.mqttServerId,
      updatedAt: controller.updatedAt,
    };
    try {
      // Persist the claimed state before delivery so post-delivery failures cannot revoke its credentials.
      await assertOwned();
      controller.trustState = 'claimed';
      controller.name = name.trim();
      controller.mqttServerId = selectedServerId;
      controller.updatedAt = new Date().toISOString();
      await this.controllers.save(controller);
      return {
        controller,
        enrollment,
        mqttServerId: selectedServerId,
        credential,
        configuration: {
          protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
          namespace,
          desiredTopic: configurationDesiredTopic(namespace, controller.hardwareId),
          reportedTopic: configurationReportedTopic(namespace, controller.hardwareId),
        },
        identity,
        previousController,
        credentialDelivered: false,
      };
    } catch (error) {
      await this.restoreUnclaimedControllerWhileLocked(
        {
          controller,
          mqttServerId: selectedServerId,
          identity,
          previousController,
        },
        assertOwned,
      );
      throw error;
    }
  }

  async claim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
    assertOwned: () => Promise<void> = async () => undefined,
    manual?: {
      credentials: { username: string; password: string };
      acknowledged: () => void;
      expiresAt: string;
      dispatched: () => void;
    },
  ): Promise<WagoController> {
    return this.withClaimLock(id, async () => {
      const prepared = await this.withClaimConfigurationLock(() =>
        this.prepareClaim(id, name, verifier, mqttServerId, assertOwned, manual?.credentials),
      );
      try {
        const acknowledgementToken = randomBytes(24).toString('base64url');
        await assertOwned();
        await this.watchClaimAcknowledgement(
          prepared,
          acknowledgementToken,
          manual ? { acknowledged: manual.acknowledged, assertOwned } : undefined,
        );
        await assertOwned();
        manual?.dispatched();
        await this.context.mqtt.publish(
          prepared.mqttServerId,
          `${discoveryTopic(prepared.controller.hardwareId)}/claim`,
          JSON.stringify({
            username: prepared.credential.username,
            password: prepared.credential.password,
            configuration: prepared.configuration,
            acknowledgementToken,
            ...(manual ? { expiresAt: manual.expiresAt } : {}),
          }),
          { qos: 1 },
        );
        prepared.credentialDelivered = true;
        await assertOwned();
        await this.context.mqtt.publish(prepared.mqttServerId, discoveryTopic(prepared.controller.hardwareId), '', {
          qos: 1,
          retain: true,
        });
        return prepared.controller;
      } catch (error) {
        this.clearClaimAcknowledgement(prepared.enrollment.id);
        if (!prepared.credentialDelivered) await this.restoreUnclaimedController(prepared, assertOwned);
        throw error;
      } finally {
        const mayRefresh =
          !manual ||
          (await assertOwned().then(
            () => true,
            () => false,
          ));
        if (mayRefresh)
          await this.subscribeConfiguredServers().catch((error) => {
            this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after claim: ${String(error)}`);
            this.scheduleSubscriptionRetry();
          });
      }
    });
  }

  async completeManualCredentials(
    id: number,
    input: { name: string; verifier: string; username: string; password: string },
    principal: PluginAuditPrincipal,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<{ controllerId: number; result: 'acknowledged' }> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    if (
      input.username !== `wago-controller-${controller.hardwareId}` ||
      !input.password ||
      input.password.length > 4096
    )
      throw new BadRequestException('Supply the controller identity and provisioned password');
    if (!(JSON.parse(controller.capabilities) as string[]).includes('claim-expiry-v1'))
      throw new ConflictException('Install a runtime supporting expiring claims before manual credential fallback');
    return new WagoAudit(this.context).run(principal, id, 'manual_credential_fallback', {}, async () => {
      let active = true;
      let dispatched = false;
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      const assertActive = async () => {
        if (!active) throw new ConflictException('Controller credential operation ended');
        await assertOwned();
        if (!active) throw new ConflictException('Controller credential operation ended');
      };
      let acknowledged!: () => void;
      const receipt = new Promise<void>((resolve) => {
        acknowledged = resolve;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiration = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          active = false;
          reject(
            dispatched
              ? new WagoCredentialOperationUncertainError('Controller credential acknowledgement timed out')
              : new ConflictException('Controller credential acknowledgement timed out'),
          );
        }, 30_000);
      });
      try {
        // A timed-out continuation keeps the claim lock until its await settles;
        // assertActive prevents any later persistence, publication or revocation.
        await Promise.race([
          (async () => {
            await this.claim(id, input.name, input.verifier, undefined, assertActive, {
              credentials: { username: input.username, password: input.password },
              acknowledged,
              expiresAt,
              dispatched: () => {
                dispatched = true;
              },
            });
            await receipt;
            await assertActive();
          })(),
          expiration,
        ]);
        return { controllerId: id, result: 'acknowledged' as const };
      } catch (error) {
        if (dispatched && !(error instanceof WagoCredentialOperationUncertainError))
          throw new WagoCredentialOperationUncertainError(
            'Controller credential handoff is uncertain; recover the controller operation before retrying',
          );
        throw error;
      } finally {
        active = false;
        clearTimeout(timer);
        if (controller.enrollmentId) this.clearClaimAcknowledgement(controller.enrollmentId);
      }
    });
  }

  /** Revokes the controller's access before removing all of its local state. */
  async remove(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<string> {
    return this.withClaimLock(id, () =>
      this.withClaimConfigurationLock(async () => {
        const controller = await this.controllers.findOneBy({ id });
        if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);

        const credentialServerId =
          controller.credentialMqttServerId ?? (controller.trustState === 'claimed' ? controller.mqttServerId : null);
        if (credentialServerId) {
          const identity = `wago-controller-${controller.hardwareId}`;
          await assertOwned();
          const manual = await this.context.getMqttCredentialProvisioning().revoke({
            mqttServerId: credentialServerId,
            identity,
            username: identity,
            vhost: '/',
          });
          if (manual)
            throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
        }

        if (controller.enrollmentId) await this.revokeEnrollmentById(controller.enrollmentId, assertOwned);
        await assertOwned();
        await Promise.all([this.drafts.delete({ controllerId: id }), this.revisions.delete({ controllerId: id })]);
        await assertOwned();
        await this.controllers.delete(id);
        this.configurationReportQueues.delete(id);
        await this.subscribeConfiguredServers().catch((error) => {
          this.context.logger.warn(
            `Could not refresh WAGO MQTT subscriptions after controller removal: ${String(error)}`,
          );
          this.scheduleSubscriptionRetry();
        });
        return controller.hardwareId;
      }),
    );
  }

  async deleteEnrollmentById(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<void> {
    await assertOwned();
    await this.enrollments.delete(id);
  }

  /** Server-side commissioning revokes the enrollment it created without exposing credentials to a browser. */
  async revokeEnrollmentById(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<void> {
    const enrollment = await this.enrollments.findOneBy({ id });
    // Expiry limits enrollment use but does not revoke the provisioned broker credential.
    if (enrollment && !enrollment.consumedAt) await this.revokeEnrollment(enrollment, assertOwned);
  }

  async createEnrollment(
    hardwareId: string,
    mqttServerId?: number,
    manualCredentials?: { username: string; password: string },
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<{
    id: number;
    broker: { host: string; port: number; useTls: boolean };
    username: string;
    password?: string;
    claimSecret: string;
    expiresAt: string;
    manualInstructions?: readonly string[];
  }> {
    const normalizedHardwareId = hardwareId.trim();
    if (!isValidHardwareId(normalizedHardwareId))
      throw new ConflictException('a valid hardware ID without MQTT separators or wildcards is required');
    const selectedServerId = mqttServerId ?? (await this.getSettings()).defaultMqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before creating an enrollment package');
    const server = await this.context.getMqttServerConfig(selectedServerId);
    if (!server) throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const claimSecret = randomBytes(24).toString('base64url');
    const identity = `wago-enrollment-${randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    // Persist the broker identity before its external creation so expiry recovery can revoke an
    // ambiguous provision result if coordinator ownership disappears mid-request.
    await assertOwned();
    const enrollment = await this.enrollments.save(
      this.enrollments.create({
        mqttServerId: selectedServerId,
        hardwareId: normalizedHardwareId,
        secretHash: hash(claimSecret),
        identity,
        createdAt: new Date().toISOString(),
        expiresAt,
      }),
    );
    this.scheduleEnrollmentExpiry(enrollment);
    await assertOwned();
    const provisionedCredential = await this.context.getMqttCredentialProvisioning().provision({
      mqttServerId: selectedServerId,
      identity,
      username: identity,
      vhost: '/',
      topicPolicy: {
        publish: [discoveryTopic(normalizedHardwareId), `${discoveryTopic(normalizedHardwareId)}/claim/ack`],
        subscribe: [`${discoveryTopic(normalizedHardwareId)}/claim`],
      },
    });
    if (!('password' in provisionedCredential) && !manualCredentials) {
      await assertOwned();
      const timer = this.enrollmentExpiryTimers.get(enrollment.id);
      if (timer) clearTimeout(timer);
      this.enrollmentExpiryTimers.delete(enrollment.id);
      await this.enrollments.delete(enrollment.id);
      throw new ConflictException(
        `Manual discovery credentials are required: ${provisionedCredential.instructions.join(' ')}`,
      );
    }
    const credential = 'password' in provisionedCredential ? provisionedCredential : manualCredentials;
    if (!credential?.username.trim() || !credential.password)
      throw new ConflictException('a manual discovery username and password are required');
    await assertOwned();
    if (!('password' in provisionedCredential)) {
      enrollment.identity = credential.username;
      await this.enrollments.save(enrollment);
    }
    await this.subscribeConfiguredServers().catch((error) => {
      this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after enrollment: ${String(error)}`);
      this.scheduleSubscriptionRetry();
    });
    return {
      id: enrollment.id,
      broker: { host: server.host, port: server.port, useTls: server.useTls },
      username: credential.username,
      password: 'password' in credential ? credential.password : undefined,
      claimSecret,
      expiresAt,
      manualInstructions:
        'instructions' in provisionedCredential
          ? provisionedCredential.instructions.map((instruction) =>
              instruction.replaceAll(identity, () => credential.username),
            )
          : undefined,
    };
  }
}
