import type { WagoCommissioningPreflightReport } from '../shared/commissioning';
import { commissionClock } from './wago-commissioning-clock';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { DeliveryInput } from './wago-commissioning.service.delivery-input';
import { isSupportedController } from './wago-commissioning.service.is-supported-controller';
import { RuntimeDeliveryBundle } from './wago-commissioning.service.runtime-delivery-bundle';
import { TemporarySshCredential } from './wago-commissioning.service.temporary-ssh-credential';
import { DeliveryAttempt } from './wago-delivery-attempt';
import { managedProvisionPreflightScript } from './wago-managed-provision';
import { runtimeBundlePreflightScript } from './wago-runtime-install';

import { WagoCommissioningServiceWithDeliveryLockOperation } from './wago-commissioning.service.wago-commissioning-service-with-delivery-lock-operation';
export abstract class WagoDeliveryPreparation extends WagoCommissioningServiceWithDeliveryLockOperation {
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
