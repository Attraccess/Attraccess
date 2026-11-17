import { f, table, type PluginStoragePatch, type PluginStorageRow, type PluginStorageWhere } from '@attraccess/plugins-backend-sdk';

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
  'no_show',
  'completed',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Columns holding a one-shot "already sent" timestamp; claimed atomically by the store. */
export const REMINDER_FLAGS = [
  'confirmationSentAt',
  'stillNeededSentAt',
  'reminder24hSentAt',
  'handoverSentAt',
  'overrunSentAt',
  'noShowNotifiedAt',
  'expiredNotifiedAt',
] as const;
export type ReminderFlag = (typeof REMINDER_FLAGS)[number];

// Column names are the field names (the legacy table uses camelCase columns). All times are UTC.
export const reservationTable = table(
  {
    id: f.id(),
    resourceId: f.integer(),
    userId: f.integer(),
    startTime: f.timestamp(),
    endTime: f.timestamp(),
    /** Snapshot of the resource's buffers when the booking was made. */
    bufferBeforeMinutes: f.integer().withDefault(0),
    bufferAfterMinutes: f.integer().withDefault(0),
    status: f.string(),
    note: f.string().optional(),
    createdAt: f.timestamp(),
    endedEarlyAt: f.timestamp().optional(),
    cancelledBy: f.integer().optional(),
    cancelReason: f.string().optional(),
    decidedBy: f.integer().optional(),
    decisionReason: f.string().optional(),
    decidedAt: f.timestamp().optional(),
    checkedInAt: f.timestamp().optional(),
    checkedInUsageId: f.integer().optional(),
    /** The holder answered "still needed" / chose to keep the booking. */
    keptAt: f.timestamp().optional(),
    confirmationSentAt: f.timestamp().optional(),
    stillNeededSentAt: f.timestamp().optional(),
    reminder24hSentAt: f.timestamp().optional(),
    handoverSentAt: f.timestamp().optional(),
    overrunSentAt: f.timestamp().optional(),
    noShowNotifiedAt: f.timestamp().optional(),
    expiredNotifiedAt: f.timestamp().optional(),
  },
  {
    physicalName: 'reservations_reservation',
    // The per-resource indexes serve the slot queries; the status indexes the scheduler's cross-resource scans.
    indexes: [
      { name: 'IDX_reservations_reservation_slot', fields: ['resourceId', 'status', 'startTime', 'endTime'] },
      { name: 'IDX_reservations_reservation_user', fields: ['userId', 'status'] },
      { name: 'IDX_reservations_reservation_status_start', fields: ['status', 'startTime'] },
      { name: 'IDX_reservations_reservation_status_end', fields: ['status', 'endTime'] },
    ],
  },
);

/** A booking as read from the record port (`status` narrowed to the values the plugin writes). */
export type ReservationRow = Omit<PluginStorageRow<typeof reservationTable>, 'status'> & { status: ReservationStatus };

/** Filter and patch types of the booking table (the port's own, with the plain `status` string). */
export type ReservationWhere = PluginStorageWhere<PluginStorageRow<typeof reservationTable>>;
export type ReservationPatch = PluginStoragePatch<PluginStorageRow<typeof reservationTable>>;
