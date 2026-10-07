import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { discoveryTopic } from './protocol';
import { hash } from './wago.helpers';
import { isValidHardwareId } from './wago.helpers';
import { WagoServiceLatestRevisionOperation } from './wago.wago-service-latest-revision-operation';
export abstract class WagoServiceCreateEnrollmentOperation extends WagoServiceLatestRevisionOperation {
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
