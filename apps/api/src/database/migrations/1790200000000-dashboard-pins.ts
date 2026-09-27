import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class DashboardPins1790200000000 implements MigrationInterface {
  name = 'DashboardPins1790200000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({ name: 'dashboard_pin', columns: [
      { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
      { name: 'userId', type: 'integer', isNullable: false },
      { name: 'itemType', type: 'text', isNullable: false },
      { name: 'itemId', type: 'text', isNullable: false },
      { name: 'position', type: 'integer', isNullable: false },
    ], foreignKeys: [{ columnNames: ['userId'], referencedTableName: 'user', referencedColumnNames: ['id'], onDelete: 'CASCADE' }] }));
    await queryRunner.createIndex('dashboard_pin', new TableIndex({ name: 'IDX_dashboard_pin_user_position', columnNames: ['userId', 'position'], isUnique: true }));
    await queryRunner.createIndex('dashboard_pin', new TableIndex({ name: 'IDX_dashboard_pin_user_item', columnNames: ['userId', 'itemType', 'itemId'], isUnique: true }));
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.dropTable('dashboard_pin'); }
}
