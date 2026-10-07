import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { randomBytes } from 'node:crypto';
import { commissionClock } from './wago-commissioning-clock';
import { assertCommissioningBroker } from './wago-commissioning-preflight';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { RuntimeDeliveryBundle } from './wago-commissioning.service.runtime-delivery-bundle';
import { TemporarySshCredential } from './wago-commissioning.service.temporary-ssh-credential';
import { DeliveryAttempt } from './wago-delivery-attempt';
import { runtimeBundleDeliveryScript } from './wago-runtime-install';

import { WagoDeliveryPreparation } from './wago-delivery-preparation';
export abstract class WagoDeliveryTransfer extends WagoDeliveryPreparation {
  protected async transferDelivery(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    bundle: RuntimeDeliveryBundle,
    broker: NonNullable<Awaited<ReturnType<PluginContext['getMqttServerConfig']>>>,
    pairingCode: string,
    clock: Awaited<ReturnType<typeof commissionClock>>,
    attempt: DeliveryAttempt,
  ) {
    attempt.credentialsTouched = true;
    attempt.safeFailure =
      'Enrollment or runtime delivery failed. Clean up the retained installation before retrying; previous workloads will not be restored.';
    await this.revokeSessionEnrollment(session);
    await this.operationContext.getStore()?.assertOwned();
    attempt.safeFailure =
      'Application UTC changed or controller clock verification expired before enrollment. No new enrollment credential was issued; retry with fresh install consent.';
    clock.assertFresh();
    attempt.safeFailure =
      'Enrollment or runtime delivery failed. Clean up the retained installation before retrying; previous workloads will not be restored.';
    const enrollment = await this.wago.createEnrollment(
      session.hardwareId,
      session.mqttServerId,
      undefined,
      this.operationContext.getStore()?.assertOwned,
    );
    session.enrollmentId = enrollment.id;
    await this.save(session, 'enrollment_created');
    if (!enrollment.password) throw new Error('Restricted credential unavailable');
    // Re-resolve trust settings supplied by the host, never infer them from the enrollment DTO.
    const currentBroker = await this.context.getMqttServerConfig(session.mqttServerId);
    if (!currentBroker) throw new Error('Broker unavailable');
    assertCommissioningBroker(currentBroker);
    if (JSON.stringify(currentBroker) !== JSON.stringify(broker)) throw new Error('Broker changed during delivery');
    attempt.enrollmentExpiresAt = enrollment.expiresAt;
    const environment = [
      ...(bundle.imageId ? [`WAGO_RUNTIME_IMAGE_ID=${bundle.imageId}`] : []),
      `WAGO_HARDWARE_ID=${session.hardwareId}`,
      `WAGO_MQTT_URL=${broker.useTls ? 'mqtts' : 'mqtt'}://${broker.host}:${broker.port}`,
      `WAGO_MQTT_USERNAME=${enrollment.username}`,
      `WAGO_MQTT_PASSWORD=${enrollment.password}`,
      `WAGO_ENROLLMENT_SECRET=${enrollment.claimSecret}`,
      `WAGO_PAIRING_CODE=${pairingCode}`,
      ...(broker.useTls && broker.tlsInsecure ? ['WAGO_MQTT_TLS_INSECURE=true'] : []),
      ...(broker.useTls && broker.tlsServername ? [`WAGO_MQTT_TLS_SERVERNAME=${broker.tlsServername}`] : []),
      ...(broker.useTls && !broker.tlsInsecure && broker.caCert
        ? ['NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem']
        : []),
    ];
    if (environment.some((line) => /[\r\n\0]/.test(line))) throw new Error('Invalid environment value');
    await this.assertCurrentRuntimeBundle(bundle);
    await this.updateProgress(
      session,
      55,
      'Transferring runtime',
      'One locked delivery stages configuration and installs the runtime.',
    );
    const deliveryToken = session.deliveryToken ?? session.dockerProvisionToken ?? randomBytes(16).toString('hex');
    session.deliveryToken = deliveryToken;
    await this.save(session, 'runtime_delivery_started');
    try {
      await this.copyTo(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        bundle.path,
        runtimeBundleDeliveryScript(
          bundle.image,
          environment.join('\n'),
          broker.useTls && !broker.tlsInsecure ? broker.caCert : undefined,
          bundle.bytes,
          bundle.digest,
          deliveryToken,
          '',
          bundle.hardwareProfile,
        ),
        (percent) => this.reportTransferProgress(session, percent),
      );
    } finally {
      await this.transferWrites.get(session.id);
    }

    // A release change while SSH was transferring/loading must remain visible;
    // never advance the obsolete installation to automatic enrollment/claim.
    await this.assertCurrentRuntimeBundle(bundle);
  }
}
