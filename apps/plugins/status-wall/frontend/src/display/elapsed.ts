/** Short elapsed time for a tile: "12 min", "2 h 05". */
export function formatElapsed(since: string | null, now: Date): string | null {
  if (!since) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}
