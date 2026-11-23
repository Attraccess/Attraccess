import { registerAs } from '@nestjs/config';
import { loadEnv } from '@attraccess/env';
import type { z as zod } from 'zod';

export type ValkeyConfigType = {
  VALKEY_URL?: string;
  /** Replaces `<hostname>:<PORT>` as this instance's name in session-change heartbeats and lock tokens. */
  ATTRACCESS_INSTANCE_NAME?: string;
};

/** `|` separates the instance name from the boot id, so instance `a` would take `a|b`'s heartbeats for its own. */
export const INSTANCE_NAME_PIPE_MESSAGE =
  'ATTRACCESS_INSTANCE_NAME must not contain a pipe (|): it separates the instance name from the boot id';

export const valkeyEnvSchema = (z: typeof zod) => ({
  VALKEY_URL: z.string().min(1).optional(),
  // Trimmed; blank counts as unset.
  ATTRACCESS_INSTANCE_NAME: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((value) => !value?.includes('|'), { message: INSTANCE_NAME_PIPE_MESSAGE }),
});

export default registerAs('valkey', (): ValkeyConfigType => loadEnv(valkeyEnvSchema));
