import { f, table, type PluginStorageRow } from '@attraccess/plugins-backend-sdk';

export const icalFeedTable = table(
  {
    id: f.id(),
    userId: f.integer(),
    name: f.string(),
    /** sha256 hex of the secret token; the token itself is never stored. */
    tokenHash: f.string(),
    /** First characters of the token, to recognise a feed in the UI. */
    tokenPrefix: f.string().optional(),
    /** JSON text, shape defined by the iCal service. */
    selection: f.text(),
    createdAt: f.timestamp(),
    revokedAt: f.timestamp().optional(),
    lastUsedAt: f.timestamp().optional(),
  },
  {
    physicalName: 'reservations_ical_feed',
    indexes: [
      { name: 'IDX_reservations_ical_feed_user', fields: ['userId'] },
      { name: 'UQ_reservations_ical_feed_token', fields: ['tokenHash'], unique: true },
    ],
  },
);

export type IcalFeedRow = PluginStorageRow<typeof icalFeedTable>;
