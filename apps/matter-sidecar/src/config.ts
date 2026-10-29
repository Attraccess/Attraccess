import {
  DEFAULT_REPLAY_MAX_AGE_MS,
  DEFAULT_REPLAY_MAX_EVENTS,
  DEFAULT_REQUEST_DEADLINE_MS,
  DEFAULT_SHUTDOWN_GRACE_MS,
  MAX_MESSAGE_BYTES,
} from '@attraccess/matter-contract';
import { z } from 'zod';

export const LOOPBACK_HOST = '127.0.0.1';

const positiveInt = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).default(fallback);

const configSchema = z.object({
  MATTER_SIDECAR_PORT: z.coerce.number().int().min(0).max(65_535).default(8581),
  MATTER_SIDECAR_MAX_MESSAGE_BYTES: positiveInt(MAX_MESSAGE_BYTES, 16 * 1024 * 1024),
  MATTER_SIDECAR_REQUEST_DEADLINE_MS: positiveInt(DEFAULT_REQUEST_DEADLINE_MS, 60_000),
  MATTER_SIDECAR_SHUTDOWN_GRACE_MS: positiveInt(DEFAULT_SHUTDOWN_GRACE_MS, 60_000),
  MATTER_SIDECAR_REPLAY_MAX_EVENTS: positiveInt(DEFAULT_REPLAY_MAX_EVENTS, 100_000),
  MATTER_SIDECAR_REPLAY_MAX_AGE_MS: positiveInt(DEFAULT_REPLAY_MAX_AGE_MS, 24 * 3_600_000),
  MATTER_SIDECAR_CLIENT_QUEUE_BYTES: positiveInt(MAX_MESSAGE_BYTES, 64 * 1024 * 1024),
});

export type SidecarConfig = {
  /** The sidecar only ever binds to loopback. There is no remote bind option. */
  host: typeof LOOPBACK_HOST;
  port: number;
  maxMessageBytes: number;
  requestDeadlineMs: number;
  shutdownGraceMs: number;
  replayMaxEvents: number;
  replayMaxAgeMs: number;
  clientQueueBytes: number;
};

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid sidecar configuration: ${problems.join('; ')}`);
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const values = result.data;
  return {
    host: LOOPBACK_HOST,
    port: values.MATTER_SIDECAR_PORT,
    maxMessageBytes: values.MATTER_SIDECAR_MAX_MESSAGE_BYTES,
    requestDeadlineMs: values.MATTER_SIDECAR_REQUEST_DEADLINE_MS,
    shutdownGraceMs: values.MATTER_SIDECAR_SHUTDOWN_GRACE_MS,
    replayMaxEvents: values.MATTER_SIDECAR_REPLAY_MAX_EVENTS,
    replayMaxAgeMs: values.MATTER_SIDECAR_REPLAY_MAX_AGE_MS,
    clientQueueBytes: values.MATTER_SIDECAR_CLIENT_QUEUE_BYTES,
  };
}

/** Test helper friendly defaults without reading the environment. */
export function configWith(overrides: Partial<SidecarConfig> = {}): SidecarConfig {
  return { ...loadConfig({}), port: 0, ...overrides };
}
