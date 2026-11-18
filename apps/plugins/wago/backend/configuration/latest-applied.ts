import type { WagoConfigurationRevisionRow, WagoStorage } from '../storage';

const BATCH = 50;

/**
 * The newest applied revision of each controller, with its snapshot. The record port has no group-wise maximum, so
 * this looks up each controller's newest applied revision number first (an indexed aggregate that moves no snapshots)
 * and then reads exactly those rows with one filter per batch. Controllers without an applied revision are absent.
 */
export async function loadLatestAppliedRevisions(
  revisions: WagoStorage['configurationRevisions'],
  controllerIds: readonly number[],
): Promise<WagoConfigurationRevisionRow[]> {
  const latest: Array<{ controllerId: number; revision: number }> = [];
  for (let start = 0; start < controllerIds.length; start += BATCH) {
    const found = await Promise.all(
      controllerIds.slice(start, start + BATCH).map(async (controllerId) => ({
        controllerId,
        revision: (await revisions.aggregate('revision', { controllerId, state: 'applied' })).max as number | null,
      })),
    );
    for (const entry of found) if (entry.revision !== null) latest.push({ ...entry, revision: entry.revision });
  }
  const rows: WagoConfigurationRevisionRow[] = [];
  for (let start = 0; start < latest.length; start += BATCH) {
    const keys = latest.slice(start, start + BATCH).map(({ controllerId, revision }) => ({ controllerId, revision }));
    rows.push(...(await revisions.find({ where: { and: [{ state: 'applied' }, { or: keys }] } })));
  }
  return rows;
}
