import { type DateTimeOptions, useDateTimeFormatter } from './useDateTimeFormatter';

export function useFormatDateTime(date?: Date | string | number | null, options?: DateTimeOptions) {
  const formatter = useDateTimeFormatter(options);

  return formatter(date);
}
