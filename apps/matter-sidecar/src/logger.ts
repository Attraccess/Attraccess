export type LogSink = (line: string) => void;

const BEARER = /Bearer\s+[^\s"\\]+/gi;

/**
 * One JSON object per line. Callers must never pass secrets, setup codes or datasets. As a safety net, any configured
 * secret and anything that follows `Bearer` is masked in the output.
 */
export function createLogger(
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  secrets: readonly string[] = [],
) {
  const known = secrets.filter((secret) => secret !== '');
  const mask = (line: string) => {
    let masked = line.replace(BEARER, 'Bearer [redacted]');
    for (const secret of known) masked = masked.split(secret).join('[redacted]');
    return masked;
  };
  return (level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void => {
    sink(mask(JSON.stringify({ level, message, ...fields })));
  };
}
export type Logger = ReturnType<typeof createLogger>;
