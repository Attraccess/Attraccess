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
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }

    // Every address held after the migration; parked placeholders must not collide with any of them.
    const taken = new Set(groups.keys());
    const parked: Array<{ id: number; email: string }> = [];
    const renamed: Array<{ id: number; email: string }> = [];
    for (const [email, group] of groups) {
      const [kept, ...others] = group.sort(
        (a, b) => Number(!!b.isEmailVerified) - Number(!!a.isEmailVerified) || a.id - b.id,
      );
      if (kept.email !== email) {
        renamed.push({ id: kept.id, email });
      }
      if (others.length) {
        this.logger.warn(
          `Case-only duplicate emails: kept user ${kept.id}, parked users ${others
            .map((o) => o.id)
            .sort((a, b) => a - b)
            .join(', ')}`,
        );
        for (const { id } of others) {
          parked.push({ id, email: this.placeholder(id, taken) });
        }
      }
    }

    // Park first so lowercasing never collides with a not yet renamed duplicate.
    for (const { id, email } of [...parked, ...renamed]) {
      await queryRunner.query(`UPDATE "user" SET "email" = ? WHERE "id" = ?`, [email, id]);
    }
  }

  private placeholder(id: number, taken: Set<string>): string {
    let email = `duplicate-${id}@duplicate-email.invalid`;
    for (let attempt = 2; taken.has(email); attempt++) {
      email = `duplicate-${id}-${attempt}@duplicate-email.invalid`;
    }
    taken.add(email);
    return email;
  }

  public async down(): Promise<void> {
    // original casing cannot be restored
  }
}
