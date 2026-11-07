import { type BookableHours, normalizeBookableHours, validateBookableHours } from '../time/bookable-hours';

export const WHO_CAN_BOOK = ['can-start', 'managers-only', 'any-user'] as const;
export type WhoCanBook = (typeof WHO_CAN_BOOK)[number];

export interface ResourceSettings {
  resourceId: number;
  enabled: boolean;
  approvalRequired: boolean;
  timeStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxAdvanceDays: number;
  /** A booking must start at least this many minutes after it is made (0 = any time up to the start). */
  minLeadMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** Pending + confirmed bookings with a future end per user and resource; 0 = unlimited. */
  maxActiveBookingsPerUser: number;
  whoCanBook: WhoCanBook;
  /** Another user's booking starting within this window asks for confirmation to start; 0 = never. */
  confirmWindowMinutes: number;
  checkInEnabled: boolean;
  checkInGraceMinutes: number;
  earlyCheckInMinutes: number;
  handoverReminderMinutes: number;
  /** Signed-in card users see holder names on Attractap readers (never on a signed-out reader). */
  showNamesOnReaders: boolean;
  bookableHours: BookableHours;
}

/** Everything but `resourceId`: what the API reads and writes. */
export type ResourceSettingsValues = Omit<ResourceSettings, 'resourceId'>;

export const DEFAULT_SETTINGS: ResourceSettingsValues = {
  enabled: false,
  approvalRequired: false,
  timeStepMinutes: 15,
  minDurationMinutes: 15,
  maxDurationMinutes: 240,
  maxAdvanceDays: 30,
  minLeadMinutes: 0,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  maxActiveBookingsPerUser: 3,
  whoCanBook: 'can-start',
  confirmWindowMinutes: 60,
  checkInEnabled: true,
  checkInGraceMinutes: 15,
  earlyCheckInMinutes: 15,
  handoverReminderMinutes: 15,
  showNamesOnReaders: false,
  bookableHours: {},
};

export function defaultSettings(resourceId: number): ResourceSettings {
  return { resourceId, ...DEFAULT_SETTINGS, bookableHours: {} };
}

export interface SettingsFieldError {
  field: string;
  message: string;
}

export const INTEGER_RANGES: Record<string, [number, number]> = {
  timeStepMinutes: [5, 240],
  minDurationMinutes: [1, 1440],
  maxDurationMinutes: [1, 10080],
  maxAdvanceDays: [1, 730],
  minLeadMinutes: [0, 10080],
  bufferBeforeMinutes: [0, 1440],
  bufferAfterMinutes: [0, 1440],
  maxActiveBookingsPerUser: [0, 100],
  confirmWindowMinutes: [0, 1440],
  checkInGraceMinutes: [1, 240],
  earlyCheckInMinutes: [0, 240],
  handoverReminderMinutes: [0, 1440],
};

/** Cross-field validation of a complete settings object. Empty result = valid. */
export function validateSettings(values: ResourceSettingsValues): SettingsFieldError[] {
  const errors: SettingsFieldError[] = [];
  for (const [field, [min, max]] of Object.entries(INTEGER_RANGES)) {
    const value = (values as unknown as Record<string, unknown>)[field];
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      errors.push({ field, message: `must be an integer between ${min} and ${max}` });
    }
  }
  if (errors.some((error) => error.field === 'timeStepMinutes') === false && 1440 % values.timeStepMinutes !== 0) {
    errors.push({ field: 'timeStepMinutes', message: 'must divide 1440 so the grid repeats every day' });
  }
  const step = values.timeStepMinutes;
  if (!errors.length) {
    if (values.minDurationMinutes % step !== 0) {
      errors.push({ field: 'minDurationMinutes', message: 'must be a multiple of the time step' });
    }
    if (values.maxDurationMinutes % step !== 0) {
      errors.push({ field: 'maxDurationMinutes', message: 'must be a multiple of the time step' });
    }
    if (values.maxDurationMinutes < values.minDurationMinutes) {
      errors.push({ field: 'maxDurationMinutes', message: 'must not be shorter than the minimum duration' });
    }
  }
  if (!(WHO_CAN_BOOK as readonly string[]).includes(values.whoCanBook)) {
    errors.push({ field: 'whoCanBook', message: `must be one of ${WHO_CAN_BOOK.join(', ')}` });
  }
  for (const flag of ['enabled', 'approvalRequired', 'checkInEnabled', 'showNamesOnReaders'] as const) {
    if (typeof values[flag] !== 'boolean') errors.push({ field: flag, message: 'must be a boolean' });
  }
  errors.push(...validateBookableHours(values.bookableHours));
  return errors;
}

/** Merges a partial update over the current values; bookable hours are replaced wholesale when supplied. */
export function mergeSettings(
  current: ResourceSettingsValues,
  patch: Partial<ResourceSettingsValues>,
): ResourceSettingsValues {
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ResourceSettingsValues)[]) {
    if (patch[key] !== undefined) (merged as Record<string, unknown>)[key] = patch[key];
  }
  return merged;
}

export function finalizeSettings(values: ResourceSettingsValues): ResourceSettingsValues {
  return { ...values, bookableHours: normalizeBookableHours(values.bookableHours) };
}

/** Names of the setting keys whose values differ. */
export function changedSettingKeys(before: ResourceSettingsValues, after: ResourceSettingsValues): string[] {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof ResourceSettingsValues)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/** The settings without their `resourceId`. */
export function settingsValues(settings: ResourceSettings): ResourceSettingsValues {
  const values: Record<string, unknown> = { ...settings };
  delete values.resourceId;
  return values as unknown as ResourceSettingsValues;
}
