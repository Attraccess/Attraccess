import type { EntityManager } from 'typeorm';
import { MatterCommand } from './entities';

export const MAX_COMMAND_ROWS = 1_000;
export const MAX_COMMAND_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Keeps the command log bounded: the newest 1,000 rows or the last 30 days, whichever keeps less. Runs after each
 * insert and each reconciliation.
 */
export async function pruneCommands(manager: EntityManager, now: Date = new Date()): Promise<number> {
  const repo = manager.getRepository(MatterCommand);
  const cutoff = new Date(now.getTime() - MAX_COMMAND_AGE_MS).toISOString();
  let removed =
    (await repo.createQueryBuilder().delete().where('requested_at < :cutoff', { cutoff }).execute()).affected ?? 0;
  const keep = await repo
    .createQueryBuilder('c')
    .select('c.requestId', 'requestId')
    .orderBy('c.requestedAt', 'DESC')
    .addOrderBy('c.requestId', 'DESC')
    .limit(MAX_COMMAND_ROWS)
    .getRawMany<{ requestId: string }>();
  if (keep.length < MAX_COMMAND_ROWS) return removed;
  const ids = keep.map((row) => row.requestId);
  // SQLite caps the number of bound variables, so excess rows are found by the cut-off row instead of a long NOT IN.
  const oldestKept = await repo.findOneBy({ requestId: ids[ids.length - 1] });
  if (!oldestKept) return removed;
  removed +=
    (
      await repo
        .createQueryBuilder()
        .delete()
        .where('requested_at < :at OR (requested_at = :at AND request_id < :id)', {
          at: oldestKept.requestedAt,
          id: oldestKept.requestId,
        })
        .execute()
    ).affected ?? 0;
  return removed;
}
