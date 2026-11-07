import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Creates the reservations plugin tables. Self-contained (no foreign keys into host tables) because
 * plugin up-migrations may run before the host's own migrations on a fresh database.
 */
export class CreateReservations1790000000000 implements MigrationInterface {
  name = 'CreateReservations1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reservations_reservation" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "resourceId" integer NOT NULL,
        "userId" integer NOT NULL,
        "startTime" datetime NOT NULL,
        "endTime" datetime NOT NULL,
        "bufferBeforeMinutes" integer NOT NULL DEFAULT (0),
        "bufferAfterMinutes" integer NOT NULL DEFAULT (0),
        "status" varchar NOT NULL,
        "note" varchar,
        "createdAt" datetime NOT NULL,
        "endedEarlyAt" datetime,
        "cancelledBy" integer,
        "cancelReason" varchar,
        "decidedBy" integer,
        "decisionReason" varchar,
        "decidedAt" datetime,
        "checkedInAt" datetime,
        "checkedInUsageId" integer,
        "keptAt" datetime,
        "confirmationSentAt" datetime,
        "stillNeededSentAt" datetime,
        "reminder24hSentAt" datetime,
        "handoverSentAt" datetime,
        "overrunSentAt" datetime,
        "noShowNotifiedAt" datetime,
        "expiredNotifiedAt" datetime
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_slot" ON "reservations_reservation" ("resourceId", "status", "startTime", "endTime")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_user" ON "reservations_reservation" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reservations_resource_settings" (
        "resourceId" integer PRIMARY KEY NOT NULL,
        "enabled" boolean NOT NULL DEFAULT (0),
        "approvalRequired" boolean NOT NULL DEFAULT (0),
        "timeStepMinutes" integer NOT NULL DEFAULT (15),
        "minDurationMinutes" integer NOT NULL DEFAULT (15),
        "maxDurationMinutes" integer NOT NULL DEFAULT (240),
        "maxAdvanceDays" integer NOT NULL DEFAULT (30),
        "minLeadMinutes" integer NOT NULL DEFAULT (0),
        "bufferBeforeMinutes" integer NOT NULL DEFAULT (0),
        "bufferAfterMinutes" integer NOT NULL DEFAULT (0),
        "maxActiveBookingsPerUser" integer NOT NULL DEFAULT (3),
        "whoCanBook" varchar NOT NULL DEFAULT ('can-start'),
        "confirmWindowMinutes" integer NOT NULL DEFAULT (60),
        "checkInEnabled" boolean NOT NULL DEFAULT (1),
        "checkInGraceMinutes" integer NOT NULL DEFAULT (15),
        "earlyCheckInMinutes" integer NOT NULL DEFAULT (15),
        "handoverReminderMinutes" integer NOT NULL DEFAULT (15),
        "bookableHours" text NOT NULL DEFAULT ('{}'),
        "updatedAt" datetime NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reservations_global_settings" (
        "key" varchar PRIMARY KEY NOT NULL,
        "value" text NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reservations_ical_feed" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "name" varchar NOT NULL,
        "tokenHash" varchar NOT NULL,
        "tokenPrefix" varchar,
        "selection" text NOT NULL,
        "createdAt" datetime NOT NULL,
        "revokedAt" datetime,
        "lastUsedAt" datetime,
        CONSTRAINT "UQ_reservations_ical_feed_token" UNIQUE ("tokenHash")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_ical_feed_user" ON "reservations_ical_feed" ("userId")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "reservations_notice" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "reservationId" integer NOT NULL,
        "kind" varchar NOT NULL,
        "refKey" varchar NOT NULL DEFAULT (''),
        "sentAt" datetime NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reservations_notice" ON "reservations_notice" ("reservationId", "kind", "refKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations_notice"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations_ical_feed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations_global_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations_resource_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations_reservation"`);
  }
}
