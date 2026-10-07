import { MANAGEMENT_INSPECTION_COMMAND, parseManagementInspection } from './wago-management-inspection';
import { ConflictException, Inject, Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { PLUGIN_CONTEXT, PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { assertCommissioningBroker } from './wago-commissioning-preflight';
import { CommissioningPrincipal } from './wago-commissioning-audit';
import { WagoRuntimeArtifactsService, WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { DeliveryInput } from './wago-commissioning.service.delivery-input';
import { CommissioningSessionResponse } from './wago-commissioning.service.commissioning-session-response';
import { DeliveryAttempt } from './wago-delivery-attempt';
import { requireDeliveryCredentials } from './wago-commissioning.service.require-delivery-credentials';

import { WagoDeliveryFailure } from './wago-delivery-failure';
@Injectable()
export class WagoCommissioningService extends WagoDeliveryFailure implements OnApplicationBootstrap {
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
}
export { runtimeBundleInstallScript } from './wago-runtime-install';
export {
  WagoStorageCapacityError,
  WagoControllerLockError,
  WagoRuntimeUploadError,
} from './wago-commissioning.service.errors';
export { isSupportedController } from './wago-commissioning.service.is-supported-controller';
export { shellQuote } from './wago-commissioning.service.shell-quote';
