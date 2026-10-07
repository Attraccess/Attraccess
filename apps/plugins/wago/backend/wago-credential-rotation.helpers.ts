import { ConflictException } from '@nestjs/common';
import { sourceTime } from './diagnostics-envelope';
import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../shared/clock';
import { WagoController } from './wago-controller.entity';
import { CAPABILITY } from './wago-credential-rotation.state';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';

export function assertRotationController(
  controller: WagoController,
  retry: boolean,
): asserts controller is WagoController & { mqttServerId: number } {
  if (controller.trustState !== 'claimed' || !controller.mqttServerId || controller.compatibilityError)
    throw new ConflictException('A compatible claimed controller is required.');
  if (
    'credentialMqttServerId' in controller &&
    controller.credentialMqttServerId != null &&
    controller.credentialMqttServerId !== controller.mqttServerId
  )
    throw new ConflictException('Use the original credential broker before rotating credentials.');
  let capabilities: unknown;
  try {
    capabilities = JSON.parse(controller.capabilities);
  } catch {
    capabilities = [];
  }
  if (!Array.isArray(capabilities) || !capabilities.includes(CAPABILITY))
    throw new ConflictException('Install a runtime supporting credential-rotation-v1 before rotating credentials.');
  const heartbeatAt = sourceTime(controller.lastHeartbeatAt);
  const now = Date.now();
  // A discovery announcement cannot establish that the permanent runtime is subscribed.
  // Retry only delivers an already rotated credential; allow recovery without a fresh heartbeat.
  if (
    !retry &&
    (heartbeatAt === null || heartbeatAt > now + CONTROLLER_CLOCK_TOLERANCE_MS || now - heartbeatAt >= 90_000)
  )
    throw new ConflictException('Wait for a fresh permanent controller heartbeat before rotating credentials.');
}

export function checkPendingRotation(
  previous: WagoCredentialRotationEntity | null,
  credentialEpoch: string,
  retry: boolean,
  mqttServerId: number,
  prefix: string,
) {
  if (previous && previous.credentialEpoch !== credentialEpoch)
    throw new ConflictException('Recover the previous credential registration before rotating again.');
  if (previous && previous.phase !== 'completed' && !retry)
    throw new ConflictException('Retry the pending credential handoff instead of rotating again.');
  if (retry && (!previous || previous.phase === 'provisioning'))
    throw new ConflictException('Broker rotation completion is uncertain. Recover broker credentials before retrying.');
  if (retry && previous?.phase === 'completed') return { state: 'completed' as const, revision: previous.revision };
  if (previous && (previous.mqttServerId !== mqttServerId || previous.prefix !== prefix))
    throw new ConflictException('Credential rotation must use its original broker and namespace.');
  return undefined;
}
