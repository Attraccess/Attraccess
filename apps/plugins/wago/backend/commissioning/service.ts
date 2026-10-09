import { MANAGEMENT_INSPECTION_COMMAND, parseManagementInspection } from '../management/inspection';

import { ConflictException, Inject, Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';

import { rm } from 'node:fs/promises';

import { PLUGIN_CONTEXT, PluginContext } from '@attraccess/plugins-backend-sdk';

import { WagoService } from '../controllers/service';

import { assertCommissioningBroker } from './delivery/preflight';

import { CommissioningPrincipal } from './audit';

import { WagoRuntimeArtifactsService, WagoRuntimeArtifactCatalog } from '../runtime/artifacts/catalog';

import { WagoCommissioningReadiness } from './readiness/readiness';

import { WagoManagedRuntimeService } from '../runtime/managed/service';

import { DeliveryInput } from './model';

import { CommissioningSessionResponse } from './model';

import { DeliveryAttempt } from './delivery/delivery-attempt';

import { requireDeliveryCredentials } from './model';

import { WagoCommissioningTimeoutError } from './delivery/progress';

import { WagoCommissioningSession } from './sessions/session.entity';

import {
  RuntimeReleaseChangedError,
  WagoControllerLockError,
  WagoRuntimeUploadError,
  WagoStorageCapacityError,
} from './model';

import { WagoManagedProvisioningError } from '../runtime/managed/provisioning/provisioning-error';

import { randomBytes } from 'node:crypto';

import { commissionClock } from './delivery/clock';

import { RuntimeDeliveryBundle } from './model';

import { TemporarySshCredential } from './model';

import { runtimeBundleDeliveryScript, runtimeBundlePreflightScript } from '../runtime/install';

import { type WagoCommissioningPreflightReport } from '../../shared/commissioning';

import { isSupportedController } from './model';

import { managedProvisionPreflightScript } from '../runtime/managed/provisioning/provision';

import { WagoCommissioningProgress } from './sessions/lifecycle';

export { runtimeBundleInstallScript } from '../runtime/install';

export { WagoStorageCapacityError, WagoControllerLockError, WagoRuntimeUploadError } from './model';

export { isSupportedController } from './model';

export { shellQuote } from './model';

@Injectable()
export class WagoCommissioningService extends WagoCommissioningProgress implements OnApplicationBootstrap {
  constructor(
    @Inject(PLUGIN_CONTEXT) context: PluginContext,
    @Inject(WagoService) wago: WagoService,
    @Optional() @Inject(WagoRuntimeArtifactsService) artifacts?: WagoRuntimeArtifactCatalog,
    @Optional() @Inject(WagoCommissioningReadiness) readiness?: WagoCommissioningReadiness,
    @Optional() @Inject(WagoManagedRuntimeService) managedRuntime?: WagoManagedRuntimeService,
  ) {
    super(context, wago, artifacts, readiness, managedRuntime);
  }

  protected async deliverWhileLocked(
    id: number,
    input: DeliveryInput,
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    const session = await this.loadDeliverableSession(id);
    const credential = requireDeliveryCredentials(input);
    if (principal) session.initiatingPrincipal = JSON.stringify(principal);
    await this.requireRuntimeArtifact();

    let pairingCode: string;
    try {
      pairingCode = this.decryptVerifier(session);
    } catch {
      await this.invalidateVerifier(session);
      return this.toResponse(session);
    }
    const attempt: DeliveryAttempt = {
      enrollmentExpiresAt: null,
      credentialsTouched: false,
      safeFailure: 'Delivery failed. Controller recovery may be required; check access and runtime prerequisites.',
    };

    try {
      const broker = await this.context.getMqttServerConfig(session.mqttServerId);
      if (!broker) throw new ConflictException('MQTT server not found');
      try {
        assertCommissioningBroker(broker);
      } catch (error) {
        if (error instanceof ConflictException) attempt.safeFailure = error.message;
        throw error;
      }
      const providers = await this.context.getMqttCredentialProvisioning().availableProviders(session.mqttServerId);
      if (!providers.length) {
        attempt.safeFailure =
          'Automatic MQTT credential provisioning is unavailable for this server. Check its MQTT settings.';
        throw new Error(attempt.safeFailure);
      }
      attempt.bundle = await this.acquireRuntimeBundle(session);
      await this.assertCurrentRuntimeBundle(attempt.bundle);
      const clock = await this.prepareDelivery(session, credential, attempt.bundle, input, attempt);
      await this.transferDelivery(session, credential, attempt.bundle, broker, pairingCode, clock, attempt);

      if (this.managedRuntime) {
        attempt.safeFailure =
          'Managed SSH provisioning failed. Use the audited recovery action for the generated root credential before retrying cleanup.';
        await this.updateProgress(
          session,
          90,
          'Provisioning managed SSH',
          'Rotating root recovery and provisioning encrypted key-only management access for automatic updates.',
        );
        const guard = this.operationContext.getStore();
        if (!guard) throw new Error('Controller operation ownership unavailable');
        const managementPeer = parseManagementInspection(
          await this.run(session.targetHost, session.hostKeyFingerprint, credential, MANAGEMENT_INSPECTION_COMMAND),
        );
        if (managementPeer.ssh !== 'dropbear' || managementPeer.dropbearVersion !== '2025.88')
          throw new Error('Managed SSH requires the FW31 Dropbear 2025.88 peer');
        await this.managedRuntime.enrol(
          session,
          (script) =>
            this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, {
              // The live supervisor's bounded safety gate can hold install.lock for 300s.
              timeoutMs: 375000,
              maxOutputBytes: 4096,
              managementDiagnostic: true,
            }),
          guard.signal,
        );
        await this.assertCurrentRuntimeBundle(attempt.bundle);
      }

      session.state = 'awaiting_discovery';
      session.enrollmentExpiresAt = attempt.enrollmentExpiresAt;
      session.failureReason = null;
      session.progressPercent = 100;
      session.progressStep = 'Waiting for controller connection';
      session.progressDetail =
        'Runtime delivered. Waiting for the controller to connect and complete its automatic claim.';
      return this.toResponse(await this.save(session, 'bootstrap_delivered'));
    } catch (error) {
      return await this.failDelivery(session, error, attempt);
    } finally {
      if (attempt.bundle) await rm(attempt.bundle.directory, { recursive: true, force: true });
    }
  }

  protected async failDelivery(
    session: WagoCommissioningSession,
    error: unknown,
    attempt: DeliveryAttempt,
  ): Promise<CommissioningSessionResponse> {
    await this.transferWrites.get(session.id);
    if (
      error instanceof WagoCommissioningTimeoutError ||
      error instanceof WagoRuntimeUploadError ||
      error instanceof RuntimeReleaseChangedError ||
      error instanceof WagoStorageCapacityError ||
      error instanceof WagoControllerLockError ||
      error instanceof WagoManagedProvisioningError
    )
      attempt.safeFailure = error.message;
    if (attempt.credentialsTouched && session.enrollmentId !== null) {
      try {
        await this.revokeSessionEnrollment(session);
      } catch {
        session.state = 'delivery_failed';
        session.enrollmentExpiresAt = null;
        session.progressStep = 'Delivery failed';
        session.progressDetail = 'Credential revocation requires attention before delivery can be retried.';
        session.failureReason = 'Delivery failed; bootstrap credential revocation requires attention.';
        return this.toResponse(await this.save(session, 'enrollment_revocation_failed'));
      }
    }
    session.state = 'delivery_failed';
    session.enrollmentExpiresAt = null;
    session.progressStep = 'Delivery failed';
    session.progressDetail =
      error instanceof WagoManagedProvisioningError && !session.deliveryToken && !session.dockerProvisionToken
        ? 'No controller preparation started. Correct the managed SSH prerequisite and retry installation.'
        : error instanceof WagoStorageCapacityError
          ? 'Free space on the CC100, then retry installation.'
          : error instanceof WagoControllerLockError
            ? 'The CC100 was busy. No preparation started; retry installation.'
            : 'Review the blocker. Clean up any interrupted preparation or runtime installation before retrying. Cleanup will not restore CODESYS or previous workloads.';
    session.failureReason = attempt.safeFailure;
    return this.toResponse(await this.save(session, 'delivery_failed'));
  }

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

  protected async prepareDelivery(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    bundle: RuntimeDeliveryBundle,
    input: DeliveryInput,
    attempt: DeliveryAttempt,
  ) {
    session.state = 'delivering';
    session.failureReason = null;
    await this.updateProgress(
      session,
      10,
      'Verifying controller identity',
      'Checking pinned identity and runtime prerequisites.',
    );
    const inspection = await this.inspect(session.targetHost, session.hostKeyFingerprint, credential);
    session.codesysState = inspection.codesys;
    if (!isSupportedController(inspection.firmware, session.firmwareBaseline)) {
      attempt.safeFailure = 'Unsupported CC100 model or firmware baseline.';
      throw new Error(attempt.safeFailure);
    }
    if (this.managedRuntime) {
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        managedProvisionPreflightScript(),
        { timeoutMs: 15000, maxOutputBytes: 4096, managementDiagnostic: true },
      );
    }
    await this.updateProgress(
      session,
      20,
      'Preparing controller',
      'Permanently disabling CODESYS, activating vendor Docker and preparing exclusive onboard IO.',
    );
    attempt.safeFailure =
      'Controller preparation failed. Check staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.';
    await this.assertCurrentRuntimeBundle(bundle);
    await this.prepareController(session, credential, bundle.bytes, bundle.hardwareProfile);
    attempt.safeFailure =
      'Runtime prerequisites failed. Check vendor Docker, exclusive onboard IO, available storage and required firmware tools.';
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundlePreflightScript(bundle.bytes, '', bundle.hardwareProfile),
    );
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      'set -eu; if test -f /etc/attraccess-wago/install.lock; then (exec 8</etc/attraccess-wago/install.lock; flock -n 8); fi; for path in /etc/attraccess-wago/delivery /var/lib/attraccess-wago-install-transaction /var/lib/attraccess-wago-install-transaction.restored /var/lib/attraccess-wago-install-transaction.cleanup /var/lib/attraccess-wago-install-transaction.accepted-cleanup; do test ! -e "$path"; done',
    );
    attempt.safeFailure =
      'Controller UTC inspection or synchronization failed. Enrollment is blocked; retry with fresh install consent and SSH credentials. Check the application UTC clock and supported FW31 clock tool. Clock changes are not rolled back by cleanup.';
    const previousReport: WagoCommissioningPreflightReport = JSON.parse(session.platformReport ?? '{}');
    delete previousReport.clock;
    session.platformReport = JSON.stringify(previousReport);
    await this.updateProgress(
      session,
      45,
      'Checking controller UTC',
      'Comparing controller UTC with authoritative application UTC before enrollment.',
    );
    const clock = await commissionClock(
      (script, limits) =>
        this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, limits),
      input.confirmInstall === true,
      async (clock) => {
        session.platformReport = JSON.stringify({ ...JSON.parse(session.platformReport ?? '{}'), clock });
        await this.updateProgress(
          session,
          45,
          'Controller UTC',
          `${clock.result}; controller ${clock.controllerUtc}; application ${clock.hostUtc}; skew ${clock.skewSeconds}s; action ${clock.action}.`,
        );
      },
    );
    if (!['within-tolerance', 'synchronized'].includes(clock.result)) throw new Error(attempt.safeFailure);

    return clock;
  }
}
