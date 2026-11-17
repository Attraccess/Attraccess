import type { OperationResponse } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import type { MatterFabric } from '../devices/entities';
import type { MatterTables } from '../plugin-storage/access';

export type SidecarFabric = OperationResponse<'fabric.get'>;

/** What identifies a fabric and the storage it lives in, as both the sidecar and the plugin record it. */
export type FabricFacts = {
  fabricId: string;
  rootCertFingerprint: string;
  fabricGeneration: number;
  storageInstanceId: string;
};

/** The facts of an initialized sidecar fabric, or null while there is none to speak of. */
export function factsOf(status: SidecarFabric): FabricFacts | null {
  if (
    status.state !== 'initialized' ||
    status.fabricId === null ||
    status.rootCertFingerprint === null ||
    status.storageInstanceId === null
  ) {
    return null;
  }
  return {
    fabricId: status.fabricId,
    rootCertFingerprint: status.rootCertFingerprint,
    fabricGeneration: status.fabricGeneration,
    storageInstanceId: status.storageInstanceId,
  };
}

export function factsOfRow(row: MatterFabric | null): FabricFacts | null {
  if (!row || row.fabricGeneration === null || row.rootCertFingerprint === null || row.storageInstanceId === null) {
    return null;
  }
  return {
    fabricId: row.fabricId,
    rootCertFingerprint: row.rootCertFingerprint,
    fabricGeneration: row.fabricGeneration,
    storageInstanceId: row.storageInstanceId,
  };
}

/**
 * The fabric the plugin recorded: the newest live fabric row that a fabric operation wrote the generation to. Rows
 * the inventory created (no generation) never count, so reconciliation cannot overwrite what the plugin recorded.
 */
export function recordedFabricRow({ fabrics }: MatterTables): Promise<MatterFabric | null> {
  return fabrics.findOne({
    where: { fabricGeneration: { isNull: false }, retiredAt: null },
    orderBy: [
      { field: 'recordedAt', direction: 'desc' },
      { field: 'firstSeenAt', direction: 'desc' },
    ],
  });
}

/** Writes the facts onto the live row of this fabric, creating it when the inventory has not yet. */
export async function recordFacts(
  { fabrics }: MatterTables,
  facts: FabricFacts,
  label: string | null = null,
): Promise<MatterFabric> {
  const now = new Date().toISOString();
  const existing = await fabrics.findOne({ where: { fabricId: facts.fabricId, retiredAt: null } });
  const fields = {
    fabricGeneration: facts.fabricGeneration,
    storageInstanceId: facts.storageInstanceId,
    rootCertFingerprint: facts.rootCertFingerprint,
    recordedAt: now,
    status: 'active' as const,
    lastSeenAt: now,
  };
  if (existing) {
    const patch = label === null ? fields : { ...fields, label };
    await fabrics.update({ id: existing.id }, patch);
    return Object.assign(existing, patch);
  }
  return fabrics.insert({
    id: randomUUID(),
    fabricId: facts.fabricId,
    label,
    firstSeenAt: now,
    retiredAt: null,
    ...fields,
  });
}
