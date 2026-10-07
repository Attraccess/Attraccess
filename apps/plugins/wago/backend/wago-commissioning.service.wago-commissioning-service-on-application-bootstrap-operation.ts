import { commissioningAcceptanceScript } from './wago-commissioning-accept';
import {
  ConflictException
} from '@nestjs/common';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { createWagoManagementService } from './wago-management-store';
import {
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';
import { WagoCommissioningServiceState } from "./wago-commissioning.service.wago-commissioning-service-state";
export abstract class WagoCommissioningServiceOnApplicationBootstrapOperation extends WagoCommissioningServiceState {


  async onApplicationBootstrap(): Promise<void> {
    // The host datasource is available only after plugin module construction completes.
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    this.managedRuntime?.registerRootProbe(async (host, fingerprint, password) => {
      try {
        return (
          (await this.run(host, fingerprint, { username: 'root', password }, 'id -u', undefined, {
            timeoutMs: 15000,
            maxOutputBytes: 1024,
          })) === '0\n'
        );
      } catch {
        return false;
      }
    });
    this.managedRuntime?.registerPreparationAcceptance(async (host, fingerprint, password, token, guard, management) => {
      await this.operationContext.run(guard, async () => {
        await guard.assertOwned();
        const script = commissioningAcceptanceScript(token, '', false, management);
        const result = await this.run(
          host, fingerprint, { username: 'root', password }, runtimeBundleStreamReceiver,
          Buffer.from(script).toString('base64') + '\n',
          { timeoutMs: 12 * 60_000, maxOutputBytes: 1024, recoveryDiagnostic: true },
        );
        if (result !== 'OK\n') throw new ConflictException('Commissioning acceptance could not be confirmed.');
        await guard.assertOwned();
      });
    });
    this.managedRuntime?.registerRetirementProbe(async (host, fingerprint, password) => {
      try {
        return (
          (await this.run(
            host,
            fingerprint,
            { username: 'root', password },
            'set -eu; test "$(id -u)" = 0; test ! -e /home/attraccess/.ssh/authorized_keys; test ! -L /home/attraccess/.ssh/authorized_keys; test ! -e /etc/attraccess-wago-management/key.pending; test ! -e /etc/attraccess-wago-management/cutover; test ! -e /etc/attraccess-wago-management/committed; printf "0\\n"',
            undefined,
            { timeoutMs: 15000, maxOutputBytes: 1024 },
          )) === '0\n'
        );
      } catch {
        return false;
      }
    });
    this.management = createWagoManagementService(this.context, {
      execute: (target, credential, command, limits) =>
        this.run(target.host, target.hostKeyFingerprint, credential, command, undefined, limits),
      verifyNewKeyConnection: (target, username, privateKey, nonce, limits) =>
        this.verifyManagementKey(target, username, privateKey, nonce, limits),
    });
    try {
      await this.recoverSessions();
      await this.reconcileCompletedSessions();
      this.wago.registerCommissioningDiscoveryHandler((controller) => this.claimDiscovered(controller));
      void this.reconcileDiscovery().catch(() =>
        this.context.logger?.warn('Saved commissioning discovery requires attention.'),
      );
    } catch {
      this.context.logger?.warn('WAGO commissioning recovery failed; automatic discovery claim is disabled.');
    }
  }
}
