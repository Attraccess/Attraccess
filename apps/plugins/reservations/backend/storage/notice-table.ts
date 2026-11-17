import { f, table, type PluginStorageRow } from '@attraccess/plugins-backend-sdk';

/**
 * Exactly-once ledger for maintenance/health notices: inserting the (reservationId, kind, refKey)
 * row is the claim; a unique violation means the notice was already sent.
 */
export const noticeTable = table(
  {
    id: f.id(),
    reservationId: f.integer(),
    /** e.g. `maintenance`, `health_unhealthy`, `health_recovered`. */
    kind: f.string(),
    /** Disambiguator inside the kind, e.g. the maintenance id or health identifier; '' when unused. */
    refKey: f.string().withDefault(''),
    sentAt: f.timestamp(),
  },
  {
    physicalName: 'reservations_notice',
    indexes: [{ name: 'UQ_reservations_notice', fields: ['reservationId', 'kind', 'refKey'], unique: true }],
  },
);

export type NoticeRow = PluginStorageRow<typeof noticeTable>;
