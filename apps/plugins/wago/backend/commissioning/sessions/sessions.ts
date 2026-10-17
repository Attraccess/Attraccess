import { NotFoundException, ConflictException } from '@nestjs/common';

import { commissioningVerification } from './verification';

import { CommissioningSessionResponse } from '../model';

import { createHash, randomBytes } from 'node:crypto';

import { CommissioningPrincipal } from '../audit';

import { configuredFirmwareBaseline } from '../model';

import { isPrivateAddress } from '../model';

import { scanHostKey } from '../delivery/host-identity';

import { commissioningAcceptanceScript } from '../delivery/accept';

import { WagoCommissioningSession } from './session.entity';

import { createWagoManagementService } from '../../management/store';

import { runtimeBundleStreamReceiver } from '../../runtime/install';

import { WagoCommissioningServiceState } from '../state';

export abstract class WagoCommissioningSessions extends WagoCommissioningServiceState {
  async verification(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const settings = this.readiness ? await this.wago.getSettings() : null;
    const runtime = this.readiness?.observe(session.mqttServerId, session.hardwareId, settings.operationalPrefix);
    const verification = await commissioningVerification(this.context, session, runtime);
    const security = session.managementControllerId
      ? await this.management.status(session.managementControllerId)
      : null;
    return {
      ...verification,
      managementHardening: security?.hardened ? 'verified' : (security?.support ?? 'unverified'),
      softwareReady:
        verification.permanentConnection &&
        verification.enrollmentRevoked &&
        verification.configurationApplied &&
        verification.hardwareReadiness === 'ready' &&
        !!security?.hardened,
    };
  }

  async list(limit = 50, offset = 0): Promise<CommissioningSessionResponse[]> {
    const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const skip = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    const sessions = await this.sessions.find({ order: { updatedAt: 'DESC' }, take, skip });
    return Promise.all(sessions.map((session) => this.toResponse(session)));
  }

  async confirmHostKey(
    id: number,
    hostKeyFingerprint: string,
    trustMethod: 'trusted_inventory' | 'isolated_service_connection' = 'trusted_inventory',
    physicalIdentityConfirmed = false,
  ): Promise<CommissioningSessionResponse> {
    if (
      !['trusted_inventory', 'isolated_service_connection'].includes(trustMethod) ||
      (trustMethod === 'isolated_service_connection' && physicalIdentityConfirmed !== true)
    )
      throw new ConflictException('Confirm the isolated service connection and physical controller identity.');
    return this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.state !== 'awaiting_identity_confirmation')
        throw new ConflictException('commissioning session identity cannot be confirmed in its current state');
      if (hostKeyFingerprint !== session.hostKeyFingerprint)
        throw new ConflictException(
          'the supplied SSH host-key fingerprint does not match the scanned controller identity',
        );

      session.state = 'awaiting_delivery';
      session.progressPercent = 0;
      session.progressStep = 'Identity confirmed';
      session.progressDetail =
        trustMethod === 'trusted_inventory'
          ? 'The administrator compared the SSH host key with an independent trusted record.'
          : 'The operator confirmed a physically isolated service connection. This is first-key pinning on that connection, not independent cryptographic device authentication.';
      return this.toResponse(await this.save(session, `host_key_confirmed_${trustMethod}`));
    });
  }

  async create(
    input: {
      mqttServerId: number;
      targetHost: string;
      name: string;
    },
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    if (!isPrivateAddress(input.targetHost))
      throw new ConflictException('commissioning is limited to a protected controller address');
    if (!input.name.trim()) throw new ConflictException('a controller name is required');
    if (!configuredFirmwareBaseline)
      throw new ConflictException(
        'no CC100 firmware baseline is configured; commissioning is disabled until an exact supported baseline is set',
      );
    let brokerAvailable: boolean;
    try {
      brokerAvailable = Boolean(await this.context.getMqttServerConfig(input.mqttServerId));
    } catch {
      throw new ConflictException('Commissioning MQTT configuration could not be resolved.');
    }
    if (!brokerAvailable) throw new NotFoundException('MQTT server not found');

    let hostKeyFingerprint: string;
    try {
      hostKeyFingerprint = await scanHostKey(input.targetHost);
    } catch {
      throw new ConflictException('Commissioning SSH host-key scan failed.');
    }
    const hardwareId = `cc100-${createHash('sha256').update(hostKeyFingerprint).digest('hex').slice(0, 16)}`;
    const now = new Date().toISOString();
    const session = await this.sessions.save(
      this.sessions.create({
        hardwareId,
        mqttServerId: input.mqttServerId,
        targetHost: input.targetHost,
        hostKeyFingerprint,
        firmwareBaseline: configuredFirmwareBaseline,
        controllerName: input.name.trim(),
        state: 'awaiting_identity_confirmation',
        enrollmentExpiresAt: null,
        enrollmentId: null,
        // This verifier authenticates the first runtime announcement and is never exposed to an operator.
        pairingCode: this.encryptVerifier(randomBytes(32).toString('base64url')),
        initiatingPrincipal: principal ? JSON.stringify(principal) : null,
        runtimeArtifactDigest: null,
        codesysState: null,
        progressPercent: 0,
        progressStep: 'Confirm controller identity',
        progressDetail: 'Verify the scanned SSH host-key fingerprint on the controller before delivery.',
        auditLog: JSON.stringify([{ at: now, event: 'host_key_scanned' }]),
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return this.toResponse(session);
  }

  async support(): Promise<{ firmwareBaseline: string | null; ready: boolean }> {
    return {
      firmwareBaseline: configuredFirmwareBaseline || null,
      ready: Boolean(await this.artifacts?.has()),
    };
  }

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
    this.managedRuntime?.registerPreparationAcceptance(
      async (host, fingerprint, password, token, guard, management) => {
        await this.operationContext.run(guard, async () => {
          await guard.assertOwned();
          const script = commissioningAcceptanceScript(token, '', false, management);
          const result = await this.run(
            host,
            fingerprint,
            { username: 'root', password },
            runtimeBundleStreamReceiver,
            Buffer.from(script).toString('base64') + '\n',
            { timeoutMs: 12 * 60_000, maxOutputBytes: 1024, recoveryDiagnostic: true },
          );
          if (result !== 'OK\n') throw new ConflictException('Commissioning acceptance could not be confirmed.');
          await guard.assertOwned();
        });
      },
    );
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
