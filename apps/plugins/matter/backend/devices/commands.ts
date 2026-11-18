import type { MatterTables } from '../plugin-storage/access';

export const MAX_COMMAND_ROWS = 1_000;
export const MAX_COMMAND_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Keeps the command log bounded: the newest 1,000 rows or the last 30 days, whichever keeps less. Runs after each
 * insert and each reconciliation.
 */
export async function pruneCommands({ commands }: MatterTables, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MAX_COMMAND_AGE_MS).toISOString();
  let removed = await commands.delete({ requestedAt: { lt: cutoff } });
  // Fewer rows than the cap: nothing more to drop, and no row has to be read.
  if ((await commands.count()) < MAX_COMMAND_ROWS) return removed;
  // The oldest row that is still kept: everything before it in (requestedAt, requestId) order goes.
  const oldestKept = await commands.findOne({
    orderBy: [
      { field: 'requestedAt', direction: 'desc' },
      { field: 'requestId', direction: 'desc' },
    ],
    offset: MAX_COMMAND_ROWS - 1,
    limit: 1,
  });
  if (!oldestKept) return removed;
  removed += await commands.delete({
    or: [
      { requestedAt: { lt: oldestKept.requestedAt } },
      { requestedAt: oldestKept.requestedAt, requestId: { lt: oldestKept.requestId } },
    ],
  });
  return removed;
}
