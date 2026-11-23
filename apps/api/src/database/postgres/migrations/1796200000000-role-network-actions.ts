import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Network restriction (ATT-46): the resource actions the members of a role may still perform from outside the
 * allowed network. A role has no rows until an administrator allows something, so nothing changes on upgrade.
 */
export class RoleNetworkActions1796200000000 implements MigrationInterface {
  name = 'RoleNetworkActions1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "role_network_action" ("roleId" integer NOT NULL, "action" text NOT NULL, ` +
        `CONSTRAINT "PK_eaa12d9946cc6c4934c378b4dad" PRIMARY KEY ("roleId", "action"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_network_action" ADD CONSTRAINT "FK_4ad95bd8f9203ef427aca88fd91" FOREIGN KEY ("roleId") ` +
        `REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_network_action"`);
  }
}
