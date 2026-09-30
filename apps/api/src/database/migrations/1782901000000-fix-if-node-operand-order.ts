import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IfExecutor used to evaluate `comparisonValue <operator> path` while the editor reads
 * `path <operator> comparisonValue`, so every relational if-node ran inverted (ATT-790).
 *
 * The executor is now correct. To keep already-deployed flows behaving exactly as they did
 * before the fix, invert the stored operator: `a > b` evaluated as `b > a` is the same as `a < b`.
 * Unlike swapping path/comparisonValue this is exact regardless of `comparisonValueIsPath`.
 */
const INVERTED_OPERATOR: Record<string, string> = {
  '>': '<',
  '<': '>',
  '>=': '<=',
  '<=': '>=',
};

export class FixIfNodeOperandOrder1782901000000 implements MigrationInterface {
  name = 'FixIfNodeOperandOrder1782901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.invertRelationalOperators(queryRunner);
  }

  // The mapping is its own inverse, so down() is the same pass.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.invertRelationalOperators(queryRunner);
  }

  private async invertRelationalOperators(queryRunner: QueryRunner): Promise<void> {
    const nodes = await queryRunner.query(
      `SELECT "id", "data" FROM "resource_flow_node" WHERE "type" = 'processing.if' AND "data" IS NOT NULL`
    );

    for (const row of nodes) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (!data || typeof data !== 'object') {
        continue;
      }

      const inverted = INVERTED_OPERATOR[data.comparisonOperator];
      if (!inverted) {
        continue;
      }

      await queryRunner.query(`UPDATE "resource_flow_node" SET "data" = ? WHERE "id" = ?`, [
        JSON.stringify({ ...data, comparisonOperator: inverted }),
        row.id,
      ]);
    }
  }
}
