export type LogSink = (line: string) => void;

/** One JSON object per line. Callers must never pass secrets, setup codes or datasets. */
export function createLogger(sink: LogSink = (line) => process.stdout.write(`${line}\n`)) {
  return (level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void => {
    sink(JSON.stringify({ level, message, ...fields }));
  };
}
export type Logger = ReturnType<typeof createLogger>;
