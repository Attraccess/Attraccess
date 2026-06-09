import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupervisedUsage1781500000000 implements MigrationInterface {
  name = 'SupervisedUsage1781500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource" ADD COLUMN "supervisionMode" varchar CHECK( "supervisionMode" IN ('introduction_required','supervision_allowed','supervision_required') ) NOT NULL DEFAULT ('introduction_required')`
    );
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "supervisedUsagesUntilIntroduction" integer`);
    await queryRunner.query(
      `ALTER TABLE "resource" ADD COLUMN "autoIntroductionTarget" varchar CHECK( "autoIntroductionTarget" IN ('resource','group') )`
    );
    await queryRunner.query(
      `ALTER TABLE "resource" ADD COLUMN "autoIntroductionGroupId" integer REFERENCES "resource_group" ("id") ON DELETE SET NULL`
    );

    await queryRunner.query(
      `ALTER TABLE "resource_usage" ADD COLUMN "supervisorUserId" integer REFERENCES "user" ("id") ON DELETE SET NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "supervisorUserId"`);

    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "autoIntroductionGroupId"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "autoIntroductionTarget"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "supervisedUsagesUntilIntroduction"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "supervisionMode"`);
  }
}
