import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/** Per-resource opt-in: signed-in card users may see holder names on Attractap readers. Off by default. */
export class AddShowNamesOnReaders1790000000002 implements MigrationInterface {
  name = 'AddShowNamesOnReaders1790000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(`PRAGMA table_info("reservations_resource_settings")`)) as {
      name: string;
    }[];
    if (columns.some((column) => column.name === 'showNamesOnReaders')) return;
    await queryRunner.query(
      `ALTER TABLE "reservations_resource_settings" ADD COLUMN "showNamesOnReaders" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations_resource_settings" DROP COLUMN "showNamesOnReaders"`);
  }
}
