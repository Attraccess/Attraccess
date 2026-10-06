/**
 * Formats minutes as hh:mm:ss, rounded to the nearest second.
 * Hours are cumulative, so durations of a day or more do not wrap at 24 hours.
 */
export function useFormatedDuration(minutes: number) {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, remainingMinutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
