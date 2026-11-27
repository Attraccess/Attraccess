import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/** One kept card and the duplicates of its UID that were deleted. */
interface ResolvedGroup {
  keptId: number;
  deletedIds: number[];
}

/**
 * A card UID belongs to one card record, compared without letter case: a unique index on `lower(uid)`. Before the
 * index exists, every group of records sharing a UID keeps one record: an active one first, then the newest
 * (`createdAt`), then the highest id. The other records of the group are deleted, with the pending reset records
 * that point to them. Pending enrollments stay (several per UID are intended). Deleted and kept ids are logged, never
 * keys. Stored UIDs keep their letter case.
 *
 * `down` drops the index only: deleted duplicates are not restored.
 */
export class NfcCardUniqueUid1796500000100 implements MigrationInterface {
  name = 'NfcCardUniqueUid1796500000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const groups: ResolvedGroup[] = await queryRunner.query(
      `WITH "ranked" AS (
         SELECT "id", lower("uid") AS "uidKey",
                row_number() OVER (
                  PARTITION BY lower("uid") ORDER BY "isActive" DESC, "createdAt" DESC, "id" DESC) AS "rank"
         FROM "nfc_card"),
       "groups" AS (
         SELECT "uidKey", max("id") FILTER (WHERE "rank" = 1) AS "keptId",
                array_agg("id" ORDER BY "id") FILTER (WHERE "rank" > 1) AS "deletedIds"
         FROM "ranked" GROUP BY "uidKey" HAVING count(*) > 1)
       SELECT "keptId", "deletedIds" FROM "groups" ORDER BY "keptId"`,
    );
    const deletedIds = groups.flatMap((group) => group.deletedIds);
    if (deletedIds.length) {
      await queryRunner.query(
        `DELETE FROM "nfc_card_pending_change" WHERE "kind" = 'reset' AND "cardId" = ANY($1::int[])`,
        [deletedIds],
      );
      await queryRunner.query(`DELETE FROM "nfc_card" WHERE "id" = ANY($1::int[])`, [deletedIds]);
      new Logger('NfcCardUniqueUid').warn(
        `Deleted ${deletedIds.length} duplicate card(s) of the same UID: ids ${deletedIds.join(', ')}. ` +
          `Kept per UID: ${groups.map((group) => `${group.keptId} (deleted ${group.deletedIds.join(', ')})`).join('; ')}`,
      );
    }
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_nfc_card_uid_lower" ON "nfc_card" (lower("uid"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deleted duplicates are gone for good; only the index is removed.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_nfc_card_uid_lower"`);
  }
}
