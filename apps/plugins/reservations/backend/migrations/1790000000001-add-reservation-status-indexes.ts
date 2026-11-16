import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Indexes for the scheduler's cross-resource scans: they filter on status plus startTime (expiry,
 * no-show, reminders, handover, overrun) or endTime (completion) without a resourceId, so the
 * (resourceId, status, ...) slot index does not serve them.
 */
export class AddReservationStatusIndexes1790000000001 implements MigrationInterface {
  name = 'AddReservationStatusIndexes1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_status_start" ON "reservations_reservation" ("status", "startTime")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_status_end" ON "reservations_reservation" ("status", "endTime")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reservations_reservation_status_end"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reservations_reservation_status_start"`);
  }
}
