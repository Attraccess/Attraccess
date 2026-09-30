import { QueryRunner } from 'typeorm';
import { ActivityFlowNodeTypes1783600000000 } from './1783600000000-activity-flow-node-types';

describe('ActivityFlowNodeTypes1783600000000', () => {
  const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
  const migration = new ActivityFlowNodeTypes1783600000000();

  beforeEach(() => jest.clearAllMocks());

  it('moves existing operating and idle nodes into the activity namespace', async () => {
    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`,
      ['output.resource.activity.operating', 'output.resource.operating'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`,
      ['output.resource.activity.idle', 'output.resource.idle'],
    );
  });

  it('restores the previous identifiers when reverted', async () => {
    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`,
      ['output.resource.operating', 'output.resource.activity.operating'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `UPDATE "resource_flow_node" SET "type" = ? WHERE "type" = ?`,
      ['output.resource.idle', 'output.resource.activity.idle'],
    );
  });
});
