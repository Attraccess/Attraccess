// Mirrors the API's settings validation so the form can flag problems before saving.
import { WEEKDAYS, parseHm, type BookableHours } from './time';
import type { ResourceSettingsValues } from './types';

export const INTEGER_RANGES = {
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
} as const satisfies Record<string, readonly [number, number]>;

export const MAX_RANGES_PER_DAY = 8;
const HM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Field -> i18n key under `settings.validation`; empty when the values are valid. */
export function validateSettingsForm(values: ResourceSettingsValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, [min, max]] of Object.entries(INTEGER_RANGES)) {
    const value = (values as unknown as Record<string, number>)[field];
    if (!Number.isInteger(value) || value < min || value > max) errors[field] = 'range';
  }
  if (!errors.timeStepMinutes && 1440 % values.timeStepMinutes !== 0) errors.timeStepMinutes = 'stepDividesDay';
  if (Object.keys(errors).length === 0) {
    const step = values.timeStepMinutes;
    if (values.minDurationMinutes % step !== 0) errors.minDurationMinutes = 'multipleOfStep';
    if (values.maxDurationMinutes % step !== 0) errors.maxDurationMinutes = 'multipleOfStep';
    else if (values.maxDurationMinutes < values.minDurationMinutes) errors.maxDurationMinutes = 'maxBelowMin';
  }
  Object.assign(errors, validateBookableHoursForm(values.bookableHours));
  return errors;
}

export function validateBookableHoursForm(hours: BookableHours): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const day of WEEKDAYS) {
    const ranges = hours[day] ?? [];
    if (ranges.length > MAX_RANGES_PER_DAY) errors[`bookableHours.${day}`] = 'tooManyRanges';
    const parsed: [number, number][] = [];
    for (const range of ranges) {
      if (!HM.test(range.start) || !HM.test(range.end) || range.start === '24:00') {
        errors[`bookableHours.${day}`] = 'timeFormat';
        break;
      }
      if (parseHm(range.start) >= parseHm(range.end)) {
        errors[`bookableHours.${day}`] = 'endAfterStart';
        break;
      }
      parsed.push([parseHm(range.start), parseHm(range.end)]);
    }
    if (!errors[`bookableHours.${day}`]) {
      parsed.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < parsed.length; i += 1) {
        if (parsed[i][0] < parsed[i - 1][1]) errors[`bookableHours.${day}`] = 'overlap';
      }
    }
  }
  return errors;
}
