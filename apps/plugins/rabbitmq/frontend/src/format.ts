export function formatBytes(value: number | null): string {
  if (value == null) return '–';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = value;
  let unit = 0;
  while (Math.abs(size) >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}

export function formatRate(value: number | null, suffix: string): string {
  return value == null ? '–' : `${value.toFixed(1)} ${suffix}`;
}

export function formatNumber(value: number | null): string {
  return value == null ? '–' : value.toLocaleString();
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '–';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function formatTimestamp(ms: number | null): string {
  return ms == null ? '–' : new Date(ms).toLocaleString();
}
