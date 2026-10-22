import { NFCCard } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../../encryption/encryption.service';

/** Local maintenance only. A failed/conflicting row rolls back the entire batch. */
export async function rewrapCardKeys(source: DataSource, encryption: EncryptionService): Promise<number> {
  return source.transaction(async (manager) => {
    const repository = manager.getRepository(NFCCard);
    const rows = await repository.createQueryBuilder('card').select('card').orderBy('card.id', 'ASC').getRawMany();
    let changed = 0;
    for (const raw of rows) {
      const row = Object.fromEntries(
        repository.metadata.columns.map((column) => [column.databaseName, raw[`card_${column.databaseName}`]]),
      ) as { id: number; uid: string; keyNo: number; key: string } & Record<string, unknown>;
      const wrapped = encryption.rewrapCardKey(row, row.key);
      if (wrapped === row.key) continue;
      // Compare every stored column, including ownership and active state. Explicitly
      // preserve updatedAt: this is storage maintenance, not an on-card rotation.
      const update = repository
        .createQueryBuilder()
        .update()
        .set({
          key: wrapped,
          updatedAt: () => source.driver.escape('updatedAt'),
        });
      Object.entries(row).forEach(([column, value], index) => {
        const name = source.driver.escape(column);
        if (value === null) update.andWhere(`${name} IS NULL`);
        else update.andWhere(`${name} = :original${index}`, { [`original${index}`]: value });
      });
      const result = await update.execute();
      if (result.affected !== 1) throw new Error('Card key rewrap conflict');
      changed++;
    }
    return changed;
  });
}
