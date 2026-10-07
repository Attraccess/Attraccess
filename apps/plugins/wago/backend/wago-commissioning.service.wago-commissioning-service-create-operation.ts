import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CommissioningPrincipal } from './wago-commissioning-audit';
import { configuredFirmwareBaseline } from "./wago-commissioning.service.configured-firmware-baseline";
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { isPrivateAddress } from "./wago-commissioning.service.is-private-address";
import { WagoCommissioningServiceSupportOperation } from "./wago-commissioning.service.wago-commissioning-service-support-operation";
import { scanHostKey } from "./wago-commissioning-host-identity";

export abstract class WagoCommissioningServiceCreateOperation extends WagoCommissioningServiceSupportOperation {


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
}
