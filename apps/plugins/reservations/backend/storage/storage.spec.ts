import { compareBaselineWithLegacy } from '../testing/legacy-layout.test-utils';
import { RESERVATIONS_LEGACY_MIGRATIONS, reservationsStorage } from './index';

// The DDL of the 1.x migrations `CreateReservations1790000000000` and `AddReservationStatusIndexes1790000000001`,
// copied verbatim. Installed databases keep these tables, so the baseline (version 1) must describe them exactly.
const LEGACY_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_slot" ON "reservations_reservation" ("resourceId", "status", "startTime", "endTime")`,
  `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_user" ON "reservations_reservation" ("userId", "status")`,
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
  `CREATE TABLE IF NOT EXISTS "reservations_global_settings" (
        "key" varchar PRIMARY KEY NOT NULL,
        "value" text NOT NULL
      )`,
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
  `CREATE INDEX IF NOT EXISTS "IDX_reservations_ical_feed_user" ON "reservations_ical_feed" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "reservations_notice" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "reservationId" integer NOT NULL,
        "kind" varchar NOT NULL,
        "refKey" varchar NOT NULL DEFAULT (''),
        "sentAt" datetime NOT NULL
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reservations_notice" ON "reservations_notice" ("reservationId", "kind", "refKey")`,
  // AddReservationStatusIndexes1790000000001
  `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_status_start" ON "reservations_reservation" ("status", "startTime")`,
  `CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_status_end" ON "reservations_reservation" ("status", "endTime")`,
];

describe('reservations storage baseline', () => {
  it('declares exactly the table layout the 1.x migrations produced', () => {
    const { legacy, declared } = compareBaselineWithLegacy(reservationsStorage, LEGACY_DDL);
    expect(Object.keys(declared)).toHaveLength(5);
    expect(declared).toEqual(legacy);
  });

  it('keeps every legacy table name as the physical name', () => {
    const physical = Object.values(reservationsStorage.tables).map((definition) => definition.physicalName);
    expect(physical.sort()).toEqual([
      'reservations_global_settings',
      'reservations_ical_feed',
      'reservations_notice',
      'reservations_reservation',
      'reservations_resource_settings',
    ]);
  });

  it('adopts databases where both legacy migrations ran, and lists them in order', () => {
    expect(reservationsStorage.adoption?.legacyMigrations).toEqual([
      'CreateReservations1790000000000',
      'AddReservationStatusIndexes1790000000001',
    ]);
    expect(RESERVATIONS_LEGACY_MIGRATIONS).toHaveLength(2);
  });

  it('creates every declared table in the version 1 baseline and nothing else', () => {
    const [baseline, ...later] = reservationsStorage.migrations;
    expect(baseline.version).toBe(1);
    expect(later).toEqual([]);
    expect(baseline.steps?.map((s) => (s.op === 'createTable' ? s.table : s.op)).sort()).toEqual(
      Object.keys(reservationsStorage.tables).sort(),
    );
  });
});
