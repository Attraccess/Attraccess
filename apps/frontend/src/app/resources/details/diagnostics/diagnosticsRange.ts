export interface DiagnosticsRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

export function rangeToBounds(days: string): DiagnosticsRange {
  const end = new Date();
  const start = new Date(end.getTime() - Number(days) * 24 * 60 * 60_000);
  return { from: start.toISOString(), to: end.toISOString(), start, end };
}
