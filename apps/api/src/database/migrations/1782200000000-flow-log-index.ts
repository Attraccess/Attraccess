import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowLogIndex1782200000000 implements MigrationInterface {
  name = 'FlowLogIndex1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_flow_log_resource_created" ON "resource_flow_log" ("resourceId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_flow_log_resource_created"`);
  }
}
