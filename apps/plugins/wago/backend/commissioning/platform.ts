import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { type ManagementTarget, type ManagementMode, type ManagementException } from '../management/model';

import { restoreManagementKey } from '../management/key';

import { commissioningCommandTimeout } from './progress';

import { shellQuote } from './model';

import { pinnedHostKey } from './host-identity';

import { runProcess } from './process';

import { ConflictException, NotFoundException } from '@nestjs/common';

import { WagoController } from '../controllers/entity';

import { ManagementError } from '../management/service';

import { TemporarySshCredential } from './model';

import { auditCommissioning, CommissioningPrincipal } from './audit';

import { CC100_DIGITAL_PROFILE_ID, type Cc100HardwareProfile } from '../../shared/hardware-profile';

import { randomBytes } from 'node:crypto';

import { WagoCommissioningSession } from './session.entity';

import {
  wagoCommissioningPreparationScript,
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionFinishScript,
  wagoHardwareDeploymentReportScript,
  parseWagoHardwareDeploymentReport,
} from '../host/hardware-deployment';

import { runtimeBundleStagingCapacityPreflightScript } from '../runtime/install';

import { SSH_TIMEOUT_MS } from './model';

import { WagoControllerLockError, WagoStorageCapacityError } from './model';

import { commissionClock } from './clock';

import { type WagoCommissioningPreflightReport } from '../../shared/commissioning';

import { WagoRecoveryError } from '../runtime/recovery-error';

import { CommissioningSessionResponse } from './model';

import { requireDeliveryCredentials } from './model';

import { WagoCommissioningSessions } from './sessions';

export abstract class WagoCommissioningPlatform extends WagoCommissioningSessions {
  protected async verifyManagementKey(
    target: ManagementTarget,
    username: string,
    privateKey: string,
    nonce: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ) {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    commissioningCommandTimeout(limits.timeoutMs, guard?.deadline);
    if (!/^[a-f0-9]{32}$/.test(nonce) || !/^[a-z_][a-z0-9_-]{0,31}$/.test(username))
      throw new Error('Invalid management proof');
    const directory = await mkdtemp(join(tmpdir(), 'attraccess-management-key-'));
    try {
      const knownHosts = join(directory, 'known_hosts'),
        key = join(directory, 'identity.pub');
      const identity = restoreManagementKey(privateKey);
      await writeFile(knownHosts, await pinnedHostKey(target.host, target.hostKeyFingerprint), { mode: 0o600 });
      await writeFile(key, identity.publicKey, { mode: 0o600 });
      const keyFingerprint = identity.fingerprint;
      const socket = join(directory, 'agent.sock');
      const sshArguments = [
        '-F',
        '/dev/null',
        '-i',
        key,
        '-o',
        `IdentityAgent=${socket}`,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'PreferredAuthentications=publickey',
        '-o',
        'PasswordAuthentication=no',
        '-o',
        'KbdInteractiveAuthentication=no',
        '-o',
        'BatchMode=yes',
        '-o',
        'ControlPath=none',
        '-o',
        'GlobalKnownHostsFile=/dev/null',
        '-o',
        `UserKnownHostsFile=${knownHosts}`,
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'HostKeyAlgorithms=ssh-ed25519',
        '-o',
        'ConnectTimeout=15',
        `${username}@${target.host}`,
        `printf '%s\\n' ${shellQuote(nonce)}; id -u`,
      ];
      // A dedicated short-lived agent holds only this generated identity. The key
      // enters via stdin, never argv or a disk file; the agent exits with SSH and
      // its 30-second key TTL also bounds credentials after a client crash.
      const output = await this.remoteOperation(() =>
        runProcess(
          'ssh-agent',
          [
            '-t',
            '30',
            '-a',
            socket,
            'sh',
            '-c',
            `ssh-add -t 30 - >/dev/null 2>&1 && exec ssh ${sshArguments.map(shellQuote).join(' ')}`,
          ],
          privateKey,
          {},
          {
            ...limits,
            timeoutMs: commissioningCommandTimeout(limits.timeoutMs, guard?.deadline),
            signal: guard?.signal,
          },
        ),
      );
      const match = output.match(new RegExp(`^${nonce}\\n([0-9]+)\\n$`));
      if (!match) throw new Error('Management key proof failed');
      return {
        nonce,
        hostKeyFingerprint: target.hostKeyFingerprint,
        keyFingerprint,
        keyOnly: true,
        uid: Number(match[1]),
        managementOperationSucceeded: true,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  protected async manageSecurityWhileAudited(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
  ) {
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
          (session.state === 'revoked' && action !== 'recover')
        )
          throw new ConflictException('Confirm controller identity and finish delivery before management changes.');
        if (!session.managementControllerId) {
          const controller = await this.context
            .getRepository(WagoController)
            .findOneBy({ hardwareId: session.hardwareId, mqttServerId: session.mqttServerId });
          if (!controller) throw new ConflictException('Wait for controller enrollment before management inspection.');
          session.managementControllerId = controller.id;
          await this.save(session, 'management_subject_bound');
        }
        const subject = session.managementControllerId;
        try {
          if (action === 'inspect')
            return await this.management.inspect(
              { controllerId: subject, host: session.targetHost, hostKeyFingerprint: session.hostKeyFingerprint },
              input.temporarySsh,
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'review')
            return await this.management.review(
              subject,
              { mode: input.mode, exceptions: input.exceptions },
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'apply')
            return await this.management.apply(
              subject,
              {
                reviewToken: input.reviewToken,
                confirm: input.confirm as true,
                temporarySsh: input.temporarySsh,
              },
              this.operationContext.getStore()?.assertOwned,
            );
          return await this.management.recover(
            subject,
            {
              confirm: input.confirm as true,
              temporarySsh: input.temporarySsh,
            },
            this.operationContext.getStore()?.assertOwned,
          );
        } catch (error) {
          throw new ConflictException(
            error instanceof ManagementError
              ? `Management security: ${error.code}`
              : 'Management security request failed.',
          );
        }
      }),
    );
  }

  async manageSecurity(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ) {
    return auditCommissioning(
      this.context,
      principal,
      id,
      `security_${action}`,
      () => this.manageSecurityWhileAudited(id, action, input),
      (result) => !result.failure,
    );
  }

  async managementStatus(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    return session.managementControllerId ? this.management.status(session.managementControllerId) : null;
  }

  /** Persist ownership before destructive host changes so interruption is recoverable. */
  protected async prepareController(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    verifiedBundleBytes: number,
    hardwareProfile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
  ): Promise<void> {
    if (session.deliveryToken)
      throw new ConflictException('Clean up the retained runtime installation before preparing the controller.');
    if (session.dockerProvisionToken && session.dockerProvisionState !== 'started')
      throw new ConflictException('Clean up the retained controller preparation before retrying.');
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleStagingCapacityPreflightScript(verifiedBundleBytes),
      { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 65_536, storageDiagnostic: true },
    );
    session.dockerProvisionToken ??= randomBytes(16).toString('hex');
    session.dockerProvisionState = 'starting';
    await this.save(session, 'controller_preparation_started');
    try {
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        wagoCommissioningPreparationScript(session.dockerProvisionToken, '', hardwareProfile),
        {
          timeoutMs: SSH_TIMEOUT_MS,
          maxOutputBytes: 65_536,
          lockDiagnostic: true,
          onProgress: (checkpoint) => this.reportPreparationProgress(session, checkpoint),
        },
      );
      await this.transferWrites.get(session.id);
      session.dockerProvisionState = 'started';
      session.codesysState = 'disabled';
      await this.save(session, 'controller_prepared');
    } catch (error) {
      await this.transferWrites.get(session.id);
      if (error instanceof WagoControllerLockError) {
        session.dockerProvisionToken = null;
        session.dockerProvisionState = null;
        await this.save(session, 'controller_preparation_busy');
        throw error;
      }
      session.dockerProvisionState = 'recovery_required';
      await this.save(session, 'controller_preparation_failed');
      throw error;
    }
  }

  protected async cleanupControllerPreparation(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    if (!session.dockerProvisionToken) return;
    if (session.dockerProvisionState !== 'restored') {
      session.dockerProvisionState = 'recovering';
      await this.save(session, 'controller_preparation_cleanup_started');
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        wagoDockerProvisionRecoveryScript(session.dockerProvisionToken),
        { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
      );
      session.dockerProvisionState = 'restored';
      await this.save(session, 'controller_preparation_cleanup_verified');
    }
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      wagoDockerProvisionFinishScript(session.dockerProvisionToken, 'restored'),
      { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
    );
    session.dockerProvisionToken = null;
    session.dockerProvisionState = null;
    await this.save(session, 'controller_preparation_cleaned_up');
  }

  async platform(
    id: number,
    action: 'inspect' | 'activate' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      reviewedDockerActivation?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    const credential = requireDeliveryCredentials({ temporarySsh: input.temporarySsh, confirmInstall: true });
    if (action !== 'inspect' && input.reviewedDockerActivation !== true)
      throw new ConflictException('Explicit Docker activation or recovery approval is required.');
    return auditCommissioning(
      this.context,
      principal,
      id,
      `platform_${action}`,
      () =>
        this.withControllerLock(id, () =>
          this.withDeliveryLock(id, async () => {
            const session = await this.sessions.findOneBy({ id });
            if (!session) throw new NotFoundException('commissioning session not found');
            if (
              ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
              (session.state === 'revoked' && action !== 'recover')
            )
              throw new ConflictException('Finish identity confirmation and any active delivery first.');
            try {
              if (action === 'inspect') {
                session.platformReport = null;
                const report: WagoCommissioningPreflightReport = parseWagoHardwareDeploymentReport(
                  await this.sudoRunScript(
                    session.targetHost,
                    session.hostKeyFingerprint,
                    credential,
                    wagoHardwareDeploymentReportScript(),
                  ),
                );
                report.clock = await commissionClock(
                  (script, limits) =>
                    this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, limits),
                  false,
                  async () => undefined,
                );
                session.platformReport = JSON.stringify(report);
              } else if (action === 'activate') {
                const bundle = await this.acquireRuntimeBundle(session);
                try {
                  await this.prepareController(session, credential, bundle.bytes, bundle.hardwareProfile);
                } finally {
                  await rm(bundle.directory, { recursive: true, force: true });
                }
              } else {
                if (!session.dockerProvisionToken)
                  throw new ConflictException('No Docker provisioning attempt to recover.');
                await this.cleanupControllerPreparation(session, credential);
              }
              session.failureReason = null;
              return this.toResponse(await this.save(session, `platform_${action}_succeeded`));
            } catch (error) {
              if (error instanceof ConflictException) throw error;
              if (action !== 'inspect' && session.dockerProvisionToken)
                session.dockerProvisionState = 'recovery_required';
              session.failureReason =
                error instanceof WagoStorageCapacityError
                  ? error.message
                  : error instanceof WagoControllerLockError
                    ? error.message
                    : error instanceof WagoRecoveryError
                      ? error.message
                      : action === 'inspect'
                        ? 'Controller preflight could not be read. Check the explicit SSH credential and supported firmware tools.'
                        : action === 'activate'
                          ? 'Controller preparation failed. Check the runtime release, staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.'
                          : 'Controller preparation cleanup remains unverified. Clean up any runtime transaction first, then retry preparation cleanup. The recovery token is retained; previous workloads are not restored.';
              return this.toResponse(await this.save(session, `platform_${action}_failed`));
            }
          }),
        ),
      (result) => !result.failureReason,
    );
  }

  protected async reconcileDiscovery(): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const session of page) {
        if (session.state !== 'awaiting_discovery' || session.enrollmentId === null) continue;
        const controller = await this.context.getRepository(WagoController).findOneBy({
          hardwareId: session.hardwareId,
          mqttServerId: session.mqttServerId,
          enrollmentId: session.enrollmentId,
        });
        if (controller?.trustState === 'untrusted') await this.claimDiscovered(controller);
      }
      if (page.length < 100) return;
    }
  }
}
