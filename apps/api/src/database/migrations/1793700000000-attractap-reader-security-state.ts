import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per reader: the server's secured verdict, the reported firmware profile and the last eFuse report result. */
const COLUMNS: Array<{ name: string; definition: string }> = [
  { name: 'secured', definition: 'boolean NOT NULL DEFAULT (0)' },
  { name: 'securedAt', definition: 'datetime' },
  { name: 'firmwareProfile', definition: 'text' },
  { name: 'secureVersion', definition: 'integer' },
  { name: 'efuseSecureVersion', definition: 'integer' },
  { name: 'securityReportCheckedAt', definition: 'datetime' },
  { name: 'securityReportProblems', definition: 'text' },
];

export class AttractapReaderSecurityState1793700000000 implements MigrationInterface {
  name = 'AttractapReaderSecurityState1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(`PRAGMA table_info("attractap")`)) as { name: string }[];
    for (const column of COLUMNS) {
      if (!existing.some((c) => c.name === column.name)) {
        await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "${column.name}" ${column.definition}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(`PRAGMA table_info("attractap")`)) as { name: string }[];
    for (const column of [...COLUMNS].reverse()) {
      if (existing.some((c) => c.name === column.name)) {
        await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "${column.name}"`);
      }
    }
  }
}
