export type LogSink = (line: string) => void;

const BEARER = /Bearer\s+[^\s"\\]+/gi;
/**
 * Matter setup codes: a QR payload (`MT:...`) and the 11- or 21-digit manual codes, as a free-standing digit run (not inside a UUID or a longer word). A safety
 * net for a code that slips into free text; callers never log one on purpose.
 */
const QR_PAYLOAD = /MT:[A-Z0-9.-]{10,}/g;
const MANUAL_CODE = /(?<![0-9A-Za-z-])(?:[0-9]{21}|[0-9]{11})(?![0-9A-Za-z-])/g;

/**
 * One JSON object per line. Callers must never pass secrets, setup codes or datasets. As a safety net, any configured
 * secret, anything that follows `Bearer` and anything shaped like a Matter setup code is masked in the output.
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
    return masked
      .replace(BEARER, 'Bearer [redacted]')
      .replace(QR_PAYLOAD, '[redacted]')
      .replace(MANUAL_CODE, '[redacted]');
  };
  return (level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void => {
    sink(mask(JSON.stringify({ level, message, ...fields })));
  };
}
export type Logger = ReturnType<typeof createLogger>;
