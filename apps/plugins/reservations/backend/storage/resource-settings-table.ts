import { f, table, type PluginStorageRow } from '@attraccess/plugins-backend-sdk';
import type { WhoCanBook } from '../settings/settings.model';

export const resourceSettingsTable = table(
  {
    resourceId: f.integer(),
    enabled: f.boolean().withDefault(false),
    approvalRequired: f.boolean().withDefault(false),
    timeStepMinutes: f.integer().withDefault(15),
    minDurationMinutes: f.integer().withDefault(15),
    maxDurationMinutes: f.integer().withDefault(240),
    maxAdvanceDays: f.integer().withDefault(30),
    minLeadMinutes: f.integer().withDefault(0),
    bufferBeforeMinutes: f.integer().withDefault(0),
    bufferAfterMinutes: f.integer().withDefault(0),
    maxActiveBookingsPerUser: f.integer().withDefault(3),
    whoCanBook: f.string().withDefault('can-start'),
    confirmWindowMinutes: f.integer().withDefault(60),
    checkInEnabled: f.boolean().withDefault(true),
    checkInGraceMinutes: f.integer().withDefault(15),
    earlyCheckInMinutes: f.integer().withDefault(15),
    handoverReminderMinutes: f.integer().withDefault(15),
    /** JSON text, see BookableHours. '{}' = bookable 24/7. */
    bookableHours: f.text().withDefault('{}'),
    updatedAt: f.timestamp(),
  },
  { primaryKey: ['resourceId'], physicalName: 'reservations_resource_settings' },
);

export type ResourceSettingsRow = Omit<PluginStorageRow<typeof resourceSettingsTable>, 'whoCanBook'> & {
  whoCanBook: WhoCanBook;
};
