import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeEmail } from '../../users-and-auth/users/accounts/normalize-email';

type UserEmailRow = { id: number; email: string; isEmailVerified: number | boolean };

/**
 * Emails are unique regardless of case. Per group of accounts that differ only by case the
 * verified one (then the lowest id) keeps the address, the others are parked on a reserved
 * `.invalid` address. Normalisation runs in TypeScript, not SQL LOWER(), so stored data matches
 * the runtime helper for non-ASCII addresses.
 */
export class LowercaseEmails1792900000000 implements MigrationInterface {
  name = 'LowercaseEmails1792900000000';

  private readonly logger = new Logger(LowercaseEmails1792900000000.name);

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: UserEmailRow[] = await queryRunner.query(`SELECT "id", "email", "isEmailVerified" FROM "user"`);

    const groups = new Map<string, UserEmailRow[]>();
    for (const row of rows) {
      const key = normalizeEmail(row.email);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const parked: Array<{ id: number }> = [];
    const keep: Array<{ id: number; email: string; current: string }> = [];
    for (const [email, group] of groups) {
      const [kept, ...others] = [...group].sort(
        (a, b) => Number(!!b.isEmailVerified) - Number(!!a.isEmailVerified) || a.id - b.id,
      );
      if (kept.email !== email) {
        keep.push({ id: kept.id, email, current: kept.email });
      }
      if (others.length) {
        this.logger.warn(
          `Case-only duplicate emails: kept user ${kept.id}, parked users ${others
            .map((o) => o.id)
            .sort((a, b) => a - b)
            .join(', ')}`,
        );
        parked.push(...others);
      }
    }

    // Park first so lowercasing never collides with a not yet renamed duplicate.
    for (const { id } of parked) {
      await queryRunner.query(`UPDATE "user" SET "email" = ? WHERE "id" = ?`, [
        `duplicate-${id}@duplicate-email.invalid`,
        id,
      ]);
    }
    for (const { id, email } of keep) {
      await queryRunner.query(`UPDATE "user" SET "email" = ? WHERE "id" = ?`, [email, id]);
    }
  }

  public async down(): Promise<void> {
    // original casing cannot be restored
  }
}
