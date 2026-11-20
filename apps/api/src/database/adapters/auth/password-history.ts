import { PasswordHistory } from '@attraccess/database-entities';
import type { EntityManager } from 'typeorm';

/**
 * Appends a retired password hash to the user's history and prunes the history to the newest `keep` entries. A hash
 * equal to the newest entry is not added again, so archiving twice for one change leaves one entry.
 */
export async function appendPasswordHistory(
  manager: EntityManager,
  userId: number,
  passwordHash: string,
  keep: number,
): Promise<void> {
  if (keep <= 0 || !passwordHash) return;
  const history = manager.getRepository(PasswordHistory);
  const newest = await history.findOne({ where: { userId }, order: { createdAt: 'DESC', id: 'DESC' } });
  if (newest?.passwordHash !== passwordHash) {
    await history.save(history.create({ userId, passwordHash }));
  }

  const kept = await history.find({
    where: { userId },
    order: { createdAt: 'DESC', id: 'DESC' },
    take: keep,
    select: { id: true },
  });
  const keptIds = kept.map((row) => row.id);
  const prune = history.createQueryBuilder().delete().where('userId = :userId', { userId });
  if (keptIds.length > 0) prune.andWhere('id NOT IN (:...keptIds)', { keptIds });
  await prune.execute();
}
