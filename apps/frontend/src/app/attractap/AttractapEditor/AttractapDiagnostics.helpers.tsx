export function formatBytes(value: number | null | undefined, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}
export function formatUptime(ms: number | null | undefined, fallback: string): string {
  if (ms === null || ms === undefined) {
    return fallback;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(' ');
}
export function mismatchChipColor(matches: boolean | null | undefined): 'danger' | 'default' {
  return matches === false ? 'danger' : 'default';
}
export function symbolicationChipColor(
  status: string | null | undefined,
): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'danger';
    case 'unavailable':
      return 'warning';
    default:
      return 'default';
  }
}
