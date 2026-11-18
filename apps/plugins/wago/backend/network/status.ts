import { NotFoundException } from '@nestjs/common';

import type { WagoStorage } from '../storage';

export async function networkStatus(storage: WagoStorage, controllerId: number) {
  const controller = await storage.controllers.get(controllerId);
  if (!controller) throw new NotFoundException('WAGO controller not found');
  const [access, row, pendingCredentialRetirements] = await Promise.all([
    storage.managedAccess.findOne({
      where: { controllerId },
      orderBy: [{ field: 'sessionId', direction: 'desc' }],
    }),
    storage.networkChanges.get(controllerId),
    storage.mqttCredentialRetirements.count({ controllerId }),
  ]);
  const lease = row && (await storage.deviceOperations.get(row.fingerprint));
  return {
    available: access?.state === 'managed',
    targetHost: access?.host ?? null,
    mqttServerId: controller.mqttServerId,
    pendingCredentialRetirements,
    operation: row
      ? {
          targetHost: row.targetHost,
          mqttServerId: row.mqttServerId,
          phase: row.phase,
          failure: row.failure,
          running: row.phase !== 'completed' && !!lease?.owner && Number(lease.leaseUntil) > Date.now(),
        }
      : null,
  };
}
