import { ConfigError } from './config';

/** Operational failures (ConfigError, listen errors like EADDRINUSE) are fully described by their message. */
export function isOperational(error: unknown): boolean {
  return error instanceof ConfigError || (error instanceof Error && 'code' in error);
}

const hasCode = (error: unknown, code: string) => error instanceof Error && 'code' in error && error.code === code;

/** The one-line stderr message for a sidecar that could not start. */
export function startupFailure(error: unknown): string {
  if (error instanceof ConfigError) {
    return `${error.message}. Fix the MATTER_SIDECAR_* environment variables and start again.`;
  }
  const hint = hasCode(error, 'EADDRINUSE') ? ' Set MATTER_SIDECAR_PORT to a free port.' : '';
  const reason = error instanceof Error ? error.message : 'unknown error';
  return `could not start (${reason}).${hint} Only the sidecar stopped; Attraccess is unaffected.`;
}
