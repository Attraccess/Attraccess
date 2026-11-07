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
  // A token may contain `"` or `\`, which JSON escapes: mask the escaped form as well, before the Bearer pattern
  // could cut such a token in half.
  const known = secrets
    .filter((secret) => secret !== '')
    .flatMap((secret) => [JSON.stringify(secret).slice(1, -1), secret]);
  const mask = (line: string) => {
    let masked = line;
    for (const secret of known) masked = masked.split(secret).join('[redacted]');
    return masked.replace(BEARER, 'Bearer [redacted]');
  };
  return (level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void => {
    sink(mask(JSON.stringify({ level, message, ...fields })));
  };
}
export type Logger = ReturnType<typeof createLogger>;
