import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_OPERATING_TYPE = 'output.resource.operating';
const OLD_IDLE_TYPE = 'output.resource.idle';
const OPERATING_TYPE = 'output.resource.activity.operating';
const IDLE_TYPE = 'output.resource.activity.idle';

export class ActivityFlowNodeTypes1783600000000 implements MigrationInterface {
  name = 'ActivityFlowNodeTypes1783600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`, [OPERATING_TYPE, OLD_OPERATING_TYPE]);
    await queryRunner.query(`UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`, [IDLE_TYPE, OLD_IDLE_TYPE]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`, [OLD_OPERATING_TYPE, OPERATING_TYPE]);
    await queryRunner.query(`UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`, [OLD_IDLE_TYPE, IDLE_TYPE]);
  }
}
